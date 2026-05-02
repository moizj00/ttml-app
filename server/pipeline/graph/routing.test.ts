// ═══════════════════════════════════════════════════════
// Tests for routeAfterVetting + VETTING_ROUTE_MAP
//
// Pure unit tests — no DB, no LLMs. We import the routing function
// directly and feed it crafted PipelineStateType inputs.
// ═══════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  routeAfterVetting,
  VETTING_ROUTE_MAP,
  type VettingRouteResult,
} from "./index";
import type { PipelineStateType } from "./state";
import { emptySharedContext } from "./memory";
import {
  PIPELINE_ERROR_CODES,
  PIPELINE_ERROR_CATEGORY,
} from "../../../shared/types/pipeline";

function baseState(over: Partial<PipelineStateType> = {}): PipelineStateType {
  return {
    letterId: 1,
    userId: 0,
    intake: {},
    messages: [],
    sharedContext: emptySharedContext(),
    researchPacket: null,
    researchProvider: "",
    researchUnverified: false,
    assembledLetter: "Dear Recipient, …",
    vettedLetter: "",
    qualityDegraded: false,
    retryCount: 0,
    errorRetryCount: 0,
    lastErrorStage: "",
    lastErrorCode: "",
    lastErrorMessage: "",
    qualityWarnings: [],
    vettingReport: null,
    vettingReports: [],
    workflowJobId: 0,
    currentStage: "vetting",
    isFreePreview: false,
    ...over,
  } as PipelineStateType;
}

describe("routeAfterVetting", () => {
  it("returns finalize on a clean pass with content", () => {
    const r = routeAfterVetting(baseState());
    expect(r).toBe("finalize");
  });

  it("returns draft when quality is degraded and retry budget remains", () => {
    const r = routeAfterVetting(
      baseState({ qualityDegraded: true, retryCount: 0 })
    );
    expect(r).toBe("draft");
  });

  it("returns draft when retryCount=1 (still under the cap of 2)", () => {
    const r = routeAfterVetting(
      baseState({ qualityDegraded: true, retryCount: 1 })
    );
    expect(r).toBe("draft");
  });

  it("returns finalize when retry budget exhausted (retryCount=2)", () => {
    const r = routeAfterVetting(
      baseState({ qualityDegraded: true, retryCount: 2 })
    );
    expect(r).toBe("finalize");
  });

  it("returns fail when assembledLetter is empty", () => {
    const r = routeAfterVetting(baseState({ assembledLetter: "" }));
    expect(r).toBe("fail");
  });

  it("returns finalize_degraded when errorRetryCount>=3 BUT we have content", () => {
    const r = routeAfterVetting(
      baseState({ errorRetryCount: 3, assembledLetter: "Some content" })
    );
    expect(r).toBe("finalize_degraded");
  });

  it("returns fail on a permanent error code regardless of content", () => {
    const r = routeAfterVetting(
      baseState({ lastErrorCode: PIPELINE_ERROR_CODES.API_KEY_MISSING })
    );
    expect(r).toBe("fail");
  });

  it("returns fail on INTAKE_INCOMPLETE permanent error", () => {
    const r = routeAfterVetting(
      baseState({ lastErrorCode: PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE })
    );
    expect(r).toBe("fail");
  });

  it("does NOT short-circuit on transient error codes", () => {
    const r = routeAfterVetting(
      baseState({ lastErrorCode: PIPELINE_ERROR_CODES.RATE_LIMITED })
    );
    expect(r).toBe("finalize");
  });

  it("permanent error still routes to fail when content exists", () => {
    const r = routeAfterVetting(
      baseState({
        lastErrorCode: PIPELINE_ERROR_CODES.CONTENT_POLICY_VIOLATION,
        assembledLetter: "I'm a draft",
      })
    );
    expect(r).toBe("fail");
  });
});

describe("VETTING_ROUTE_MAP exhaustiveness", () => {
  it("includes every VettingRouteResult variant", () => {
    const expected: VettingRouteResult[] = [
      "draft",
      "finalize",
      "finalize_degraded",
      "fail",
    ];
    for (const k of expected) {
      expect(Object.keys(VETTING_ROUTE_MAP)).toContain(k);
      expect(typeof VETTING_ROUTE_MAP[k]).toBe("string");
    }
  });

  it("each route key maps to a non-empty target node name", () => {
    for (const [k, v] of Object.entries(VETTING_ROUTE_MAP)) {
      expect(v.length, `route ${k}`).toBeGreaterThan(0);
    }
  });

  it("every output of routeAfterVetting() is a valid VETTING_ROUTE_MAP key", () => {
    const probes: Array<Partial<PipelineStateType>> = [
      {},
      { qualityDegraded: true, retryCount: 0 },
      { qualityDegraded: true, retryCount: 2 },
      { assembledLetter: "" },
      { errorRetryCount: 3 },
      { lastErrorCode: PIPELINE_ERROR_CODES.API_KEY_MISSING },
      { lastErrorCode: PIPELINE_ERROR_CODES.RATE_LIMITED },
    ];
    for (const p of probes) {
      const r = routeAfterVetting(baseState(p));
      expect(Object.keys(VETTING_ROUTE_MAP)).toContain(r);
    }
  });

  it("all permanent error codes route to fail", () => {
    const permanent = (
      Object.keys(PIPELINE_ERROR_CATEGORY) as Array<
        keyof typeof PIPELINE_ERROR_CATEGORY
      >
    ).filter(c => PIPELINE_ERROR_CATEGORY[c] === "permanent");
    expect(permanent.length).toBeGreaterThan(0);
    for (const code of permanent) {
      const r = routeAfterVetting(baseState({ lastErrorCode: code }));
      expect(r, `code=${code}`).toBe("fail");
    }
  });
});
