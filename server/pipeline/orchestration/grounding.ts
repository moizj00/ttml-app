/**
 * Shared logic for research grounding and citation revalidation.
 */
import { setLetterResearchUnverified } from "../db";
import { createLogger } from "../logger";
import { createTokenAccumulator } from "../providers";
import { buildCitationRegistry, revalidateCitationsWithOpenAI } from "../citations";
import type { IntakeJson, ResearchPacket, PipelineContext } from "../../../shared/types";

const logger = createLogger({ module: "GroundingService" });

export async function applyResearchGroundingAndRevalidate(
    letterId: number,
    intake: IntakeJson,
    researchProvider: string,
    research: ResearchPacket,
    pipelineCtx: PipelineContext,
    opts?: { researchFromCache?: boolean },
): Promise<void> {
    const isUnverified =
        researchProvider === "anthropic-fallback" ||
        researchProvider === "claude-fallback" ||
        researchProvider === "none";
    pipelineCtx.researchProvider = researchProvider;
    pipelineCtx.researchUnverified = isUnverified;
    pipelineCtx.webGrounded = !isUnverified;
    await setLetterResearchUnverified(letterId, isUnverified);

    let citationRegistry = buildCitationRegistry(research);
    logger.info({ letterId, count: citationRegistry.length, isUnverified }, "[Pipeline] Built citation registry");

    const citationTokens = createTokenAccumulator();
    const researchFromCache = opts?.researchFromCache ?? (researchProvider === "kv-cache");
    const allHighConfidence = citationRegistry.length > 0 && citationRegistry.every(r => r.confidence === "high");
    const skipRevalidation =
        citationRegistry.length === 0 ||
        citationRegistry.length < 3 ||
        isUnverified ||
        researchFromCache ||
        allHighConfidence;

    if (skipRevalidation) {
        const reasons: string[] = [];
        if (citationRegistry.length === 0) reasons.push("no citations");
        if (citationRegistry.length > 0 && citationRegistry.length < 3) reasons.push(`only ${citationRegistry.length} citations (< 3 threshold)`);
        if (isUnverified) reasons.push(`research provider ${researchProvider} is not web-grounded`);
        if (researchFromCache) reasons.push("research served from KV cache (already validated)");
        if (allHighConfidence) reasons.push("all citations already high confidence");
        logger.info({ letterId, reasons }, "[Pipeline] Skipping citation revalidation");
    } else {
        const jurisdiction = intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? "US";
        const revalResult = await revalidateCitationsWithOpenAI(
            citationRegistry, jurisdiction, letterId, citationTokens
        );
        citationRegistry = revalResult.registry;
        pipelineCtx.citationRevalidationModelKey = revalResult.modelKey;
    }
    pipelineCtx.citationRegistry = citationRegistry;
    pipelineCtx.citationRevalidationTokens = citationTokens;
}
