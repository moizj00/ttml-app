import { describe, it, expect } from "vitest";
import {
  parseLangGraphMode,
  useLangGraphForLetter,
  getCanaryFractionFromEnv,
} from "./mode";

describe("parseLangGraphMode — backwards-compat with the boolean string", () => {
  it("returns 'off' for unset / empty / 'false' / 'off' / '0'", () => {
    expect(parseLangGraphMode(undefined)).toBe("off");
    expect(parseLangGraphMode("")).toBe("off");
    expect(parseLangGraphMode("false")).toBe("off");
    expect(parseLangGraphMode("off")).toBe("off");
    expect(parseLangGraphMode("0")).toBe("off");
  });

  it("returns 'tier3' for the legacy 'true' value", () => {
    expect(parseLangGraphMode("true")).toBe("tier3");
  });

  it("returns 'tier3' for the explicit 'tier3' label", () => {
    expect(parseLangGraphMode("tier3")).toBe("tier3");
  });

  it("returns 'primary' / 'canary' for the new modes", () => {
    expect(parseLangGraphMode("primary")).toBe("primary");
    expect(parseLangGraphMode("canary")).toBe("canary");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(parseLangGraphMode("  Primary ")).toBe("primary");
    expect(parseLangGraphMode("CANARY")).toBe("canary");
  });

  it("falls back to 'off' on garbage values", () => {
    expect(parseLangGraphMode("not-a-mode")).toBe("off");
  });
});

describe("useLangGraphForLetter", () => {
  it("returns false when mode='off'", () => {
    expect(
      useLangGraphForLetter({ mode: "off", letterId: 42 })
    ).toBe(false);
  });

  it("returns true for tier3 / primary regardless of letterId", () => {
    for (const id of [1, 42, 9999, -3]) {
      expect(useLangGraphForLetter({ mode: "tier3", letterId: id })).toBe(true);
      expect(useLangGraphForLetter({ mode: "primary", letterId: id })).toBe(
        true
      );
    }
  });

  it("respects canaryFraction=0 (no letters routed)", () => {
    for (const id of [1, 42, 9999]) {
      expect(
        useLangGraphForLetter({ mode: "canary", letterId: id, canaryFraction: 0 })
      ).toBe(false);
    }
  });

  it("respects canaryFraction=1 (all letters routed)", () => {
    for (const id of [1, 42, 9999]) {
      expect(
        useLangGraphForLetter({ mode: "canary", letterId: id, canaryFraction: 1 })
      ).toBe(true);
    }
  });

  it("is deterministic across calls for the same letterId", () => {
    const a = useLangGraphForLetter({
      mode: "canary",
      letterId: 12345,
      canaryFraction: 0.5,
    });
    const b = useLangGraphForLetter({
      mode: "canary",
      letterId: 12345,
      canaryFraction: 0.5,
    });
    expect(a).toBe(b);
  });

  it("approximates the configured fraction over a range of letterIds", () => {
    const N = 1000;
    const fraction = 0.2;
    let count = 0;
    for (let i = 0; i < N; i++) {
      if (
        useLangGraphForLetter({
          mode: "canary",
          letterId: i,
          canaryFraction: fraction,
        })
      ) {
        count++;
      }
    }
    // Expect within ±50% of the target — generous because the hash mixer
    // is not a real PRNG. We just need it not to be all-or-nothing.
    expect(count).toBeGreaterThan(N * fraction * 0.5);
    expect(count).toBeLessThan(N * fraction * 1.5);
  });
});

describe("getCanaryFractionFromEnv", () => {
  const KEY = "LANGGRAPH_CANARY_FRACTION";

  function withEnv<T>(value: string | undefined, fn: () => T): T {
    const prev = process.env[KEY];
    if (value === undefined) delete process.env[KEY];
    else process.env[KEY] = value;
    try {
      return fn();
    } finally {
      if (prev === undefined) delete process.env[KEY];
      else process.env[KEY] = prev;
    }
  }

  it("defaults to 0.1 when unset or invalid", () => {
    withEnv(undefined, () => expect(getCanaryFractionFromEnv()).toBe(0.1));
    withEnv("not-a-number", () =>
      expect(getCanaryFractionFromEnv()).toBe(0.1)
    );
  });

  it("clamps to [0, 1]", () => {
    withEnv("-5", () => expect(getCanaryFractionFromEnv()).toBe(0));
    withEnv("2.5", () => expect(getCanaryFractionFromEnv()).toBe(1));
    withEnv("0.25", () => expect(getCanaryFractionFromEnv()).toBe(0.25));
  });
});
