/**
 * Intermediate content registry for tracking best drafts.
 */

const _intermediateContentRegistry = new Map<
  number,
  { content: string; qualityWarnings: string[] }
>();

/**
 * Record intermediate content for a letter.
 */
export function setIntermediateContent(
  letterId: number,
  content: string,
  qualityWarnings: string[]
) {
  _intermediateContentRegistry.set(letterId, { content, qualityWarnings });
}

/**
 * Read and clear the registry entry for a letter. Called by the worker.
 */
export function consumeIntermediateContent(letterId: number): {
  content?: string;
  qualityWarnings: string[];
} {
  const entry = _intermediateContentRegistry.get(letterId);
  _intermediateContentRegistry.delete(letterId);
  return {
    content: entry?.content,
    qualityWarnings: entry?.qualityWarnings ?? [],
  };
}
