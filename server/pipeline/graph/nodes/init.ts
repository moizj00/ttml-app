/**
 * Init node — the first node in the LangGraph StateGraph.
 *
 * Responsibilities:
 *   1. Normalize the raw intake JSON into sharedContext.normalized (a
 *      single derived object every downstream agent reads from instead
 *      of re-deriving from intake.*).
 *
 *   2. Create a workflow_jobs row so the admin pipeline monitor can see
 *      this LangGraph run. Without this, LangGraph runs were invisible
 *      to admins (only classic simple/fallback pipelines created rows).
 *
 *   3. Fetch recursive-learning lessons once for the letterType +
 *      jurisdiction so downstream prompts can inject them. This mirrors
 *      what `server/pipeline/fallback.ts` already does for the classic
 *      path.
 *
 *   4. Seed breadcrumbs so observers can trace the run start.
 *
 * All heavy lifting (lessons, DB writes) is wrapped in try/catch so a
 * transient DB hiccup can never prevent the run from proceeding — the
 * graph continues with an empty lessons array and a zero jobId.
 */

import { HumanMessage } from "@langchain/core/messages";
import { createLogger } from "../../../logger";
import { createWorkflowJob, getActiveLessons } from "../../../db";
import {
  breadcrumb,
  normalizeIntake,
  type LessonRecord,
} from "../memory";
import type { PipelineStateType } from "../state";

const log = createLogger({ module: "LangGraph:InitNode" });

export async function initNode(
  state: PipelineStateType,
): Promise<Partial<PipelineStateType>> {
  const { letterId, intake } = state;
  log.info({ letterId }, "[InitNode] Initializing shared context");

  // 1. Normalize intake — single source of truth for downstream agents
  const normalized = normalizeIntake(intake);

  // 2. Create workflow_jobs row so admin pipeline monitor shows this run
  let workflowJobId = 0;
  try {
    const job = await createWorkflowJob({
      letterRequestId: letterId,
      jobType: "generation_pipeline",
      provider: "langgraph",
      requestPayloadJson: {
        mode: "langgraph",
        letterType: normalized.letterType,
        jurisdiction: normalized.jurisdiction,
      },
    });
    workflowJobId = job?.insertId ?? 0;
    log.info({ letterId, workflowJobId }, "[InitNode] Created workflow_jobs row");
  } catch (err) {
    // Non-fatal: if workflow_jobs insert fails (e.g. transient DB
    // issue), the pipeline can still complete. Admin monitor just
    // won't show this particular run. Log + continue.
    log.warn(
      { letterId, err: err instanceof Error ? err.message : String(err) },
      "[InitNode] Failed to create workflow_jobs row — pipeline will continue without admin visibility",
    );
  }

  // 3. Fetch recursive-learning lessons for this letterType + jurisdiction
  let lessons: LessonRecord[] = [];
  try {
    const rows = await getActiveLessons({
      letterType: normalized.letterType,
      jurisdiction: normalized.jurisdictionState ?? normalized.jurisdictionCountry,
      limit: 10,
    });
    lessons = (rows ?? []).map((r: any) => ({
      id: r.id,
      lessonText: r.lesson_text ?? r.lessonText ?? "",
      letterType: r.letter_type ?? r.letterType ?? null,
      jurisdiction: r.jurisdiction ?? null,
      pipelineStage: r.pipeline_stage ?? r.pipelineStage ?? null,
    })).filter((l) => l.lessonText.length > 0);
    log.info({ letterId, lessonCount: lessons.length }, "[InitNode] Loaded learning lessons");
  } catch (err) {
    log.warn(
      { letterId, err: err instanceof Error ? err.message : String(err) },
      "[InitNode] Failed to load lessons — proceeding with empty lessons array",
    );
  }

  return {
    workflowJobId,
    currentStage: "research",
    sharedContext: {
      normalized,
      lessons,
      tokenUsage: [],
      breadcrumbs: [
        breadcrumb("init", `Shared context initialized (letterType=${normalized.letterType}, jurisdiction=${normalized.jurisdiction}, lessons=${lessons.length})`),
      ],
    },
    messages: [
      new HumanMessage(
        `Pipeline started for ${normalized.letterType} letter in ${normalized.jurisdiction} (${lessons.length} lessons loaded)`,
      ),
    ],
  };
}
