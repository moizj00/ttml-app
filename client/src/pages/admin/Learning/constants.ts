export const CATEGORIES = [
  "citation_error",
  "jurisdiction_error",
  "tone_issue",
  "structure_issue",
  "factual_error",
  "bloat_detected",
  "missing_section",
  "style_preference",
  "legal_accuracy",
  "general",
] as const;
export type LessonCategory = (typeof CATEGORIES)[number];

export const STAGES = [
  "research",
  "drafting",
  "assembly",
  "vetting",
] as const;
export type PipelineStage = (typeof STAGES)[number];

export const LETTER_TYPES = [
  "demand-letter",
  "cease-and-desist",
  "contract-breach",
  "eviction-notice",
  "employment-dispute",
  "consumer-complaint",
  "general-legal",
] as const;

export function categoryColor(cat: string): string {
  const map: Record<string, string> = {
    citation_error:
      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    jurisdiction_error:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    tone_issue:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    structure_issue:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    factual_error:
      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    bloat_detected:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    missing_section:
      "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
    style_preference:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
    legal_accuracy:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    general:
      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  return map[cat] ?? map.general;
}

export function sourceLabel(src: string): string {
  const map: Record<string, string> = {
    attorney_approval: "Approval",
    attorney_rejection: "Rejection",
    attorney_changes: "Changes Req.",
    attorney_edit: "Edit",
    manual: "Manual",
    consolidation: "Consolidated",
  };
  return map[src] ?? src;
}

export function daysSince(date: string | Date): number {
  return Math.floor(
    (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)
  );
}
