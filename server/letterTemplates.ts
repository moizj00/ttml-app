/**
 * Letter template builders.
 * Loads the HTML files from attached_assets/ and substitutes live letter data
 * for all placeholder strings. The static footer bar is removed; Puppeteer's
 * displayHeaderFooter injects per-page headers/footers with dynamic page numbers.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "..", "attached_assets");

const TEMPLATE_1_PATH = join(ASSETS_DIR, "Template-1-Approved-Letter_1773859885047.html");
const TEMPLATE_2_PATH = join(ASSETS_DIR, "Template-2-Draft-Letter_1773859885048.html");

function loadTemplate(path: string): string {
  return readFileSync(path, "utf-8");
}

export interface LetterTemplateData {
  senderName: string;
  senderAddress: string;
  senderEmail: string;
  senderPhone: string;
  recipientName: string;
  recipientAddress: string;
  subject: string;
  letterId: number;
  letterType: string;
  jurisdictionState?: string | null;
  jurisdictionCountry?: string | null;
  date: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  bodyHtml: string;
}

/**
 * Escape HTML special characters in plain text values.
 */
function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Split an address string on commas or newlines into separate <div> lines.
 */
function splitAddress(addr: string): string[] {
  return addr
    .split(/[,\n]/)
    .map(s => s.trim())
    .filter(Boolean);
}

// Strip all external-resource tags and attributes from user-supplied body HTML
// to prevent SSRF via headless Chrome. Allowlist keeps only text-formatting tags.
function sanitizeBody(html: string): string {
  const ALLOWED_TAGS = new Set([
    "p", "br", "strong", "em", "b", "i", "u", "s",
    "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "div", "span", "blockquote",
  ]);

  return html
    // Remove high-risk elements including their content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, "")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/<math\b[^>]*>[\s\S]*?<\/math>/gi, "")
    // Remove external-resource self-closing tags
    .replace(/<img\b[^>]*\/?>/gi, "")
    .replace(/<embed\b[^>]*\/?>/gi, "")
    .replace(/<link\b[^>]*\/?>/gi, "")
    .replace(/<meta\b[^>]*\/?>/gi, "")
    .replace(/<base\b[^>]*\/?>/gi, "")
    .replace(/<input\b[^>]*\/?>/gi, "")
    // Remove tags that can navigate/load resources (keep text content)
    .replace(/<a\b[^>]*>/gi, "").replace(/<\/a>/gi, "")
    .replace(/<form\b[^>]*>/gi, "").replace(/<\/form>/gi, "")
    .replace(/<button\b[^>]*>/gi, "").replace(/<\/button>/gi, "")
    // Process remaining tags: keep allowed (strip all attributes), remove unknown
    .replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_m, slash: string, tagName: string) => {
      const tag = tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (tag === "br") return "<br/>";
      return slash ? `</${tag}>` : `<${tag}>`;
    });
}

function buildMetaRow(data: LetterTemplateData): string {
  const letterTypeLabel = data.letterType
    .replace(/-/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());

  const parts: string[] = [
    `Type: ${escHtml(letterTypeLabel)}`,
    `Ref: #${data.letterId}`,
  ];

  if (data.jurisdictionState) {
    const jur = data.jurisdictionCountry
      ? `${data.jurisdictionState}, ${data.jurisdictionCountry}`
      : data.jurisdictionState;
    parts.push(`Jurisdiction: ${escHtml(jur)}`);
  }

  return parts.join(" &nbsp;&middot;&nbsp; ");
}

function buildSenderParty(data: LetterTemplateData, indent: string): string {
  const addrLines = splitAddress(data.senderAddress)
    .map(l => `${indent}  <div>${escHtml(l)}</div>`)
    .join("\n");

  const contactLine = data.senderEmail
    ? `${indent}  <div>${escHtml(data.senderEmail)}${data.senderPhone ? ` &nbsp;&middot;&nbsp; ${escHtml(data.senderPhone)}` : ""}</div>`
    : data.senderPhone
    ? `${indent}  <div>${escHtml(data.senderPhone)}</div>`
    : "";

  return [
    `${indent}<div class="party">`,
    `${indent}  <div class="name">${escHtml(data.senderName)}</div>`,
    addrLines,
    contactLine,
    `${indent}</div>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildRecipientParty(data: LetterTemplateData, indent: string): string {
  const addrLines = splitAddress(data.recipientAddress)
    .map(l => `${indent}  <div>${escHtml(l)}</div>`)
    .join("\n");

  return [
    `${indent}<div class="party">`,
    `${indent}  <div class="name">${escHtml(data.recipientName)}</div>`,
    addrLines,
    `${indent}</div>`,
  ]
    .filter(Boolean)
    .join("\n");
}

// @page :first { margin-top: 0 } collapses the header area on page 1 so the
// Puppeteer continuation header is invisible there — the full letterhead lives
// in the HTML body. Pages 2+ get a 72px header and 48px footer margin.
export const PAGE_CSS = `
  @page { margin-top: 72px; margin-bottom: 48px; margin-left: 0; margin-right: 0; }
  @page :first { margin-top: 0; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Puppeteer header / footer templates
// ─────────────────────────────────────────────────────────────────────────────

export function buildApprovedHeaderHtml(data: LetterTemplateData): string {
  return `<div style="width:100%;box-sizing:border-box;font-family:Helvetica,Arial,sans-serif;font-size:8pt;color:#64748b;display:flex;justify-content:space-between;align-items:center;padding:4px 64px;border-bottom:1px solid #e2e8f0;">
    <div style="font-weight:700;color:#1e3a8a;letter-spacing:0.3px;">TALK TO MY LAWYER</div>
    <div style="color:#94a3b8;">Letter #${data.letterId} &mdash; ${escHtml(data.subject)}</div>
  </div>`;
}

export function buildDraftHeaderHtml(data: LetterTemplateData): string {
  return `<div style="width:100%;box-sizing:border-box;font-family:Helvetica,Arial,sans-serif;font-size:8pt;color:#64748b;display:flex;justify-content:space-between;align-items:center;padding:4px 64px;border-bottom:2px solid #fde68a;">
    <div style="font-weight:700;color:#1e3a8a;letter-spacing:0.3px;">TALK TO MY LAWYER</div>
    <div style="color:#d97706;font-weight:600;">DRAFT &mdash; NOT APPROVED</div>
  </div>`;
}

export function buildApprovedFooterHtml(data: LetterTemplateData): string {
  return `<div style="width:100%;box-sizing:border-box;font-family:Helvetica,Arial,sans-serif;font-size:7pt;color:#64748b;display:flex;justify-content:space-between;align-items:flex-start;padding:6px 64px 0;border-top:1px solid #e2e8f0;">
    <div style="max-width:520px;line-height:1.5;"><span style="font-weight:700;color:#2563eb;">CONFIDENTIALITY NOTICE:</span> This communication is confidential and intended solely for the named addressee. Any unauthorized use, disclosure, or copying is strictly prohibited. Ref: #${data.letterId} &nbsp;&middot;&nbsp; &copy; ${new Date().getFullYear()} Talk to My Lawyer</div>
    <div style="white-space:nowrap;margin-left:16px;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
  </div>`;
}

export function buildDraftFooterHtml(data: LetterTemplateData): string {
  return `<div style="width:100%;box-sizing:border-box;font-family:Helvetica,Arial,sans-serif;font-size:7pt;color:#64748b;display:flex;justify-content:space-between;align-items:center;padding:6px 64px 0;border-top:2px solid #fde68a;">
    <div style="max-width:460px;line-height:1.5;"><span style="font-weight:700;color:#d97706;">UNREVIEWED DRAFT:</span> AI-generated and not yet reviewed or approved by a licensed attorney. For informational purposes only. Do not transmit to any third party. Ref: #${data.letterId} &nbsp;&middot;&nbsp; Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
    <div style="flex-shrink:0;margin-left:14px;background:#fef3c7;border:1px solid #f59e0b;border-radius:3px;padding:2px 8px;font-size:7pt;font-weight:700;color:#92400e;white-space:nowrap;">DRAFT &mdash; Not Approved</div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template transformation helpers
// ─────────────────────────────────────────────────────────────────────────────

function injectPageCss(html: string): string {
  return html.replace("</style>", `${PAGE_CSS}\n  .letter-body p{margin-bottom:14px;}\n</style>`);
}

function replaceMeta(html: string, data: LetterTemplateData): string {
  return html.replace(
    /(<div class="meta">)[^<]*(<\/div>)/,
    `$1${buildMetaRow(data)}$2`
  );
}

function replaceDate(html: string, data: LetterTemplateData): string {
  return html.replace(
    /(<div class="date">)[^<]*(<\/div>)/,
    `$1${escHtml(data.date)}$2`
  );
}

function replaceSenderParty(html: string, data: LetterTemplateData): string {
  return html.replace(
    /(\s*)<div class="party">\s*\n\s*<div class="name">\[SENDER FULL NAME\]<\/div>[\s\S]*?<\/div>\s*\n(\s*)<\/div>/,
    (_m, before: string) => {
      const indent = before.replace(/\n/g, "");
      return `\n${buildSenderParty(data, indent)}\n${indent}`;
    }
  );
}

function replaceRecipientParty(html: string, data: LetterTemplateData): string {
  return html.replace(
    /(\s*)<div class="party">\s*\n\s*<div class="name">\[RECIPIENT FULL NAME \/ COMPANY NAME\]<\/div>[\s\S]*?<\/div>\s*\n(\s*)<\/div>/,
    (_m, before: string) => {
      const indent = before.replace(/\n/g, "");
      return `\n${buildRecipientParty(data, indent)}\n${indent}`;
    }
  );
}

function replaceReBlock(html: string, data: LetterTemplateData): string {
  return html.replace(
    /(<div class="re-block"><strong>Re:<\/strong> )\[LETTER SUBJECT\] — Matter No\. #4821(<\/div>)/,
    `$1${escHtml(data.subject)} &mdash; Matter No. #${data.letterId}$2`
  );
}

function replaceSalutation(html: string, data: LetterTemplateData): string {
  return html.replace(
    /(<div class="salutation">Dear )\[RECIPIENT NAME\](,<\/div>)/,
    `$1${escHtml(data.recipientName)}$2`
  );
}

function replaceBody(html: string, data: LetterTemplateData): string {
  return html.replace(
    /<div class="lorem">[\s\S]*?<\/div>/,
    `<div class="lorem">\n      ${sanitizeBody(data.bodyHtml)}\n    </div>`
  );
}

function replaceOnBehalf(html: string, data: LetterTemplateData): string {
  return html.replace(
    /(<div class="on-behalf">On Behalf of )\[SENDER FULL NAME\](<\/div>)/,
    `$1${escHtml(data.senderName)}$2`
  );
}

/**
 * Replace the attorney stamp detail line (Template 1 only).
 */
function replaceStampDetail(html: string, data: LetterTemplateData): string {
  const approvedDate = data.approvedAt
    ? new Date(data.approvedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : data.date;

  const stampDetail = data.approvedBy
    ? `${approvedDate} &nbsp;&middot;&nbsp; Reviewed by ${escHtml(data.approvedBy)}`
    : `Approved on ${approvedDate}`;

  return html.replace(
    /(<div class="detail">)March 18, 2026 &nbsp;·&nbsp; Reviewed by \[ATTORNEY NAME\](<\/div>)/,
    `$1${stampDetail}$2`
  );
}

// Remove the static footer-rule and footer-bar from the template body.
// Depth-counting finds the true closing tag of the multi-nested footer-bar div.
function removeStaticFooter(html: string): string {
  html = html.replace(/[ \t]*<div class="footer-rule">.*?<\/div>[ \t]*\n?/g, "");

  // Remove footer-bar by depth-counting to find the real matching </div>
  const startTag = '<div class="footer-bar">';
  const startIdx = html.indexOf(startTag);
  if (startIdx !== -1) {
    let depth = 0;
    let i = startIdx;
    let endIdx = -1;
    while (i < html.length) {
      if (html.startsWith("<div", i)) {
        depth++;
        i += 4;
      } else if (html.startsWith("</div", i)) {
        depth--;
        if (depth === 0) {
          endIdx = html.indexOf(">", i) + 1;
          break;
        }
        i += 5;
      } else {
        i++;
      }
    }
    if (endIdx !== -1) {
      // Also eat any trailing newline/whitespace after the closing tag
      const tail = html.substring(endIdx);
      const trailingWs = tail.match(/^[ \t]*\n?/);
      html =
        html.substring(0, startIdx) +
        html.substring(endIdx + (trailingWs ? trailingWs[0].length : 0));
    }
  }
  return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public template builders
// ─────────────────────────────────────────────────────────────────────────────

// Known placeholder patterns that must be fully substituted before the HTML is
// handed to Puppeteer.  If any remain, the template has drifted from these
// replacements and we throw early rather than render visibly broken output.
const REQUIRED_ABSENT_PATTERNS: RegExp[] = [
  /\[SENDER FULL NAME\]/,
  /\[SENDER ADDRESS\]/,
  /\[SENDER EMAIL\]/,
  /\[SENDER PHONE\]/,
  /\[RECIPIENT FULL NAME\]/,
  /\[RECIPIENT ADDRESS\]/,
  /\[LETTER SUBJECT\]/,
  /\[ATTORNEY NAME\]/,
  /\[SALUTATION NAME\]/,
  /\[ON BEHALF OF\]/,
  /\[REF #\]/,
  /\[LETTER TYPE\]/,
  /\[JURISDICTION\]/,
];

function assertNoUnreplacedPlaceholders(html: string, template: string): void {
  const remaining = REQUIRED_ABSENT_PATTERNS.filter((re) => re.test(html));
  if (remaining.length > 0) {
    throw new Error(
      `[letterTemplates] ${template}: ${remaining.length} placeholder(s) remain unreplaced after substitution: ` +
        remaining.map((r) => r.source).join(", ")
    );
  }
}

export function buildApprovedLetterHtml(data: LetterTemplateData): string {
  let html = loadTemplate(TEMPLATE_1_PATH);

  html = injectPageCss(html);
  html = replaceMeta(html, data);
  html = replaceDate(html, data);
  html = replaceSenderParty(html, data);
  html = replaceRecipientParty(html, data);
  html = replaceReBlock(html, data);
  html = replaceSalutation(html, data);
  html = replaceBody(html, data);
  html = replaceOnBehalf(html, data);
  html = replaceStampDetail(html, data);
  html = removeStaticFooter(html);

  assertNoUnreplacedPlaceholders(html, "Template-1");
  return html;
}

export function buildDraftLetterHtml(data: LetterTemplateData): string {
  let html = loadTemplate(TEMPLATE_2_PATH);

  html = injectPageCss(html);
  html = replaceMeta(html, data);
  html = replaceDate(html, data);
  html = replaceSenderParty(html, data);
  html = replaceRecipientParty(html, data);
  html = replaceReBlock(html, data);
  html = replaceSalutation(html, data);
  // For draft: replace body content but keep the amber ⚠ notice from the template
  html = html.replace(
    /<div class="lorem">[\s\S]*?<\/div>/,
    `<div class="lorem">\n        ${sanitizeBody(data.bodyHtml)}\n        <br/><br/>\n        <strong style="color:#d97706;font-size:11px;">&#9888; This draft has not yet been reviewed or approved by a licensed attorney.</strong>\n      </div>`
  );
  html = replaceOnBehalf(html, data);
  html = removeStaticFooter(html);

  assertNoUnreplacedPlaceholders(html, "Template-2");
  return html;
}
