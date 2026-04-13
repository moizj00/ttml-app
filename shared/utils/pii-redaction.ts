/**
 * PII Redaction Utility
 * 
 * Redacts personally identifiable information from letter content
 * for safe display behind the paywall preview.
 */

type PIIPattern = { pattern: RegExp; replacement: string };

// Patterns for common PII
const PII_PATTERNS: PIIPattern[] = [
  // Email addresses
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi, replacement: "[EMAIL REDACTED]" },
  
  // Phone numbers (various formats)
  { pattern: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "[PHONE REDACTED]" },
  
  // SSN (XXX-XX-XXXX)
  { pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, replacement: "[SSN REDACTED]" },
  
  // Street addresses (basic pattern)
  { pattern: /\b\d{1,5}\s+[A-Za-z0-9\s,]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir|Place|Pl)\.?(?:\s*(?:Apt|Suite|Unit|#)\s*\d+[A-Za-z]?)?\b/gi, replacement: "[ADDRESS REDACTED]" },
  
  // ZIP codes (standalone 5 or 9 digit)
  { pattern: /\b\d{5}(?:-\d{4})?\b/g, replacement: "[ZIP REDACTED]" },
  
  // Credit card numbers (basic)
  { pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, replacement: "[CARD REDACTED]" },
  
  // Bank account numbers (8-17 digits)
  { pattern: /\b(?:account\s*(?:number|#|no\.?)?\s*:?\s*)?\d{8,17}\b/gi, replacement: "[ACCOUNT REDACTED]" },
  
  // Routing numbers (9 digits)
  { pattern: /\b(?:routing\s*(?:number|#|no\.?)?\s*:?\s*)?\d{9}\b/gi, replacement: "[ROUTING REDACTED]" },
  
  // Driver's license (state-specific patterns are complex, basic catch)
  { pattern: /\b(?:DL|Driver'?s?\s*License)\s*(?:#|number|no\.?)?\s*:?\s*[A-Z0-9]{5,15}\b/gi, replacement: "[DL REDACTED]" },
  
  // Dates of birth (various formats)
  { pattern: /\b(?:DOB|Date\s*of\s*Birth|Born)\s*:?\s*\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/gi, replacement: "[DOB REDACTED]" },
];

// Names in specific contexts (after "Dear", "From:", "To:", "Sincerely,", etc.)
const NAME_CONTEXT_PATTERNS: PIIPattern[] = [
  // After "Dear"
  { pattern: /\bDear\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi, replacement: "Dear [NAME REDACTED]" },
  
  // Signature blocks
  { pattern: /\bSincerely,?\s*\n\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi, replacement: "Sincerely,\n[NAME REDACTED]" },
  { pattern: /\bRegards,?\s*\n\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi, replacement: "Regards,\n[NAME REDACTED]" },
  { pattern: /\bRespectfully,?\s*\n\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi, replacement: "Respectfully,\n[NAME REDACTED]" },
  
  // From/To headers
  { pattern: /\bFrom:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi, replacement: "From: [NAME REDACTED]" },
  { pattern: /\bTo:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi, replacement: "To: [NAME REDACTED]" },
];

export type RedactPIIOptions = {
  redactNames?: boolean;
  redactAddresses?: boolean;
  redactFinancial?: boolean;
  preserveStructure?: boolean;
};

/**
 * Redact PII from text content.
 * @param content - The raw letter content
 * @param options - Redaction options
 * @returns Redacted content safe for paywall preview
 */
export function redactPII(
  content: string,
  options: RedactPIIOptions = {}
): string {
  const {
    redactNames = true,
    redactAddresses = true,
    redactFinancial = true,
    preserveStructure = true,
  } = options;

  let redacted = content;

  // Apply PII patterns
  for (const { pattern, replacement } of PII_PATTERNS) {
    // Skip address patterns if disabled
    if (!redactAddresses && replacement.includes("ADDRESS")) continue;
    if (!redactAddresses && replacement.includes("ZIP")) continue;
    
    // Skip financial patterns if disabled
    if (!redactFinancial && replacement.includes("CARD")) continue;
    if (!redactFinancial && replacement.includes("ACCOUNT")) continue;
    if (!redactFinancial && replacement.includes("ROUTING")) continue;
    
    redacted = redacted.replace(pattern, replacement);
  }

  // Apply name context patterns
  if (redactNames) {
    for (const { pattern, replacement } of NAME_CONTEXT_PATTERNS) {
      redacted = redacted.replace(pattern, replacement);
    }
  }

  return redacted;
}

/**
 * Create a truncated preview of the letter with PII redacted
 * Shows first portion with blur effect indication
 * 
 * @param content - Full letter content
 * @param previewPercent - Percentage of content to show (default 30%)
 * @returns Truncated and redacted preview
 */
export function createPaywallPreview(
  content: string,
  previewPercent: number = 30
): string {
  // First redact PII
  const redacted = redactPII(content);
  
  // Calculate cutoff point (by character, respecting word boundaries)
  const targetLength = Math.floor(redacted.length * (previewPercent / 100));
  
  // Find the nearest word boundary after target
  let cutoff = targetLength;
  while (cutoff < redacted.length && !/\s/.test(redacted[cutoff])) {
    cutoff++;
  }
  
  // Don't cut in the middle of a sentence if possible
  const lastPeriod = redacted.lastIndexOf(".", cutoff);
  const lastNewline = redacted.lastIndexOf("\n", cutoff);
  const bestCutoff = Math.max(lastPeriod + 1, lastNewline + 1, targetLength);
  
  return redacted.slice(0, Math.min(bestCutoff, cutoff)).trim();
}

/**
 * Check if content likely contains PII
 * Useful for validation/flagging.
 * Uses a fresh regex test (via source clone) to avoid stateful lastIndex issues.
 */
export function containsPII(content: string): boolean {
  for (const { pattern } of PII_PATTERNS) {
    // Clone the regex to avoid mutating shared lastIndex on global regexes
    const fresh = new RegExp(pattern.source, pattern.flags);
    if (fresh.test(content)) return true;
  }
  return false;
}
