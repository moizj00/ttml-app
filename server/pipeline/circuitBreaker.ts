/**
 * AI Provider Circuit Breaker
 *
 * Tracks consecutive failures per AI provider. Opens circuit after threshold
 * failures to fail fast and avoid wasting time/credits on known-dead providers.
 *
 * States:
 *   CLOSED  → normal operation, pass through to provider
 *   OPEN    → fail fast immediately, no API calls
 *   HALF_OPEN → allow 1 probe call after cooldown, then close or re-open
 *
 * New env vars:
 *   CIRCUIT_BREAKER_THRESHOLD  - failures to open (default: 3)
 *   CIRCUIT_BREAKER_COOLDOWN_MS - cooldown before half-open (default: 60000)
 *   CIRCUIT_BREAKER_PROBES     - successful probes to close (default: 1)
 */

import { createLogger } from "../logger";
import { captureServerException } from "../sentry";

const cbLogger = createLogger({ module: "CircuitBreaker" });

type CircuitState = "closed" | "open" | "half_open";

interface CircuitRecord {
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureAt: number;
  lastSuccessAt: number;
  openedAt: number;
  totalFailures: number;
  totalSuccesses: number;
}

const THRESHOLD = Math.max(1, parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD ?? "3", 10));
const COOLDOWN_MS = parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MS ?? "60000", 10); // 1 min
const PROBES_TO_CLOSE = Math.max(1, parseInt(process.env.CIRCUIT_BREAKER_PROBES ?? "1", 10));

// In-memory circuit state — lost on restart (acceptable for AI providers)
const circuits = new Map<string, CircuitRecord>();

function getCircuit(provider: string): CircuitRecord {
  if (!circuits.has(provider)) {
    circuits.set(provider, {
      state: "closed",
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastFailureAt: 0,
      lastSuccessAt: 0,
      openedAt: 0,
      totalFailures: 0,
      totalSuccesses: 0,
    });
  }
  return circuits.get(provider)!;
}

/** Check if a provider's circuit is open (fail fast) */
export function isCircuitOpen(provider: string): boolean {
  const circuit = getCircuit(provider);

  // If open and cooldown expired → half-open
  if (circuit.state === "open" && Date.now() - circuit.openedAt > COOLDOWN_MS) {
    circuit.state = "half_open";
    circuit.consecutiveSuccesses = 0;
    cbLogger.info(
      `[CircuitBreaker] Provider "${provider}" → HALF_OPEN (cooldown ${COOLDOWN_MS}ms expired)`
    );
  }

  return circuit.state === "open";
}

/** Report a successful call to a provider */
export function reportSuccess(provider: string): void {
  const circuit = getCircuit(provider);
  circuit.consecutiveSuccesses++;
  circuit.totalSuccesses++;
  circuit.lastSuccessAt = Date.now();

  if (circuit.state === "half_open" && circuit.consecutiveSuccesses >= PROBES_TO_CLOSE) {
    circuit.state = "closed";
    circuit.consecutiveFailures = 0;
    cbLogger.info(
      `[CircuitBreaker] Provider "${provider}" → CLOSED (${circuit.consecutiveSuccesses} consecutive successes)`
    );
  } else if (circuit.state === "closed" && circuit.consecutiveFailures > 0) {
    // Reset failure streak on success
    circuit.consecutiveFailures = 0;
  }
}

/** Report a failed call to a provider */
export function reportFailure(provider: string, error: unknown): void {
  const circuit = getCircuit(provider);
  circuit.consecutiveFailures++;
  circuit.totalFailures++;
  circuit.lastFailureAt = Date.now();
  circuit.consecutiveSuccesses = 0;

  if (circuit.state === "half_open") {
    // Probe failed → back to open
    circuit.state = "open";
    circuit.openedAt = Date.now();
    cbLogger.warn(
      `[CircuitBreaker] Provider "${provider}" → OPEN (probe failed, ${circuit.consecutiveFailures} total failures)`
    );
  } else if (circuit.state === "closed" && circuit.consecutiveFailures >= THRESHOLD) {
    circuit.state = "open";
    circuit.openedAt = Date.now();
    cbLogger.error(
      `[CircuitBreaker] Provider "${provider}" → OPEN (${circuit.consecutiveFailures} consecutive failures, threshold=${THRESHOLD})`
    );
    captureServerException(error instanceof Error ? error : new Error(String(error)), {
      tags: { component: "circuit-breaker", provider, action: "opened" },
      extra: { consecutiveFailures: circuit.consecutiveFailures, threshold: THRESHOLD },
    });
  }
}

/** Execute a provider call with circuit breaker protection */
export async function withCircuitBreaker<T>(
  provider: string,
  fn: () => Promise<T>
): Promise<T> {
  if (isCircuitOpen(provider)) {
    const circuit = getCircuit(provider);
    const remaining = Math.max(0, COOLDOWN_MS - (Date.now() - circuit.openedAt));
    throw new Error(
      `[CircuitBreaker] Provider "${provider}" circuit is OPEN — ` +
        `failing fast (${circuit.consecutiveFailures} failures). ` +
        `Cooldown expires in ${remaining}ms`
    );
  }

  try {
    const result = await fn();
    reportSuccess(provider);
    return result;
  } catch (err) {
    reportFailure(provider, err);
    throw err;
  }
}

/** Get circuit breaker status for all providers (admin endpoint) */
export function getCircuitStatus(): Array<{
  provider: string;
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureAt: number;
  lastSuccessAt: number;
  cooldownRemainingMs: number;
}> {
  return Array.from(circuits.entries()).map(([provider, circuit]) => ({
    provider,
    state: circuit.state,
    consecutiveFailures: circuit.consecutiveFailures,
    consecutiveSuccesses: circuit.consecutiveSuccesses,
    totalFailures: circuit.totalFailures,
    totalSuccesses: circuit.totalSuccesses,
    lastFailureAt: circuit.lastFailureAt,
    lastSuccessAt: circuit.lastSuccessAt,
    cooldownRemainingMs:
      circuit.state === "open"
        ? Math.max(0, COOLDOWN_MS - (Date.now() - circuit.openedAt))
        : 0,
  }));
}

/** Reset a provider's circuit (admin action) */
export function resetCircuit(provider: string): void {
  circuits.delete(provider);
  cbLogger.info(`[CircuitBreaker] Provider "${provider}" circuit reset`);
}

/** Reset all circuits (admin action) */
export function resetAllCircuits(): void {
  circuits.clear();
  cbLogger.info("[CircuitBreaker] All circuits reset");
}
