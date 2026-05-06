/**
 * Dev-only Email Preview Route
 *
 * Renders any transactional email template directly in the browser for visual QA.
 * ONLY active when NODE_ENV !== "production".
 *
 * Routes:
 *   GET /api/dev/email-preview          → index page listing all templates
 *   GET /api/dev/email-preview?type=X   → renders template X as HTML
 *
 * Query params (all optional, sensible defaults provided):
 *   type        submission | letter_ready | unlocked | approved | rejected |
 *               needs_changes | new_review | job_failed | status_update
 *   name        Subscriber or employee name (default: "Jane Smith")
 *   subject     Letter subject line (default: "Breach of Lease Agreement — 123 Main St")
 *   letterId    Letter ID number (default: 42)
 *   state       Jurisdiction state abbreviation (default: "CA")
 *   letterType  Letter type slug (default: "demand-letter")
 *   mode        "html" (default) | "plain" — render HTML or plain-text version
 */

import type { Express, Request, Response } from "express";

// ─── Inline template builders ─────────────────────────────────────────────────
// We duplicate the builder here so the preview route has zero dependency on
// the Resend client and can render templates without any API calls.

const APP_NAME = "Talk to My Lawyer";
const BRAND_COLOR = "#1D4ED8";
const BRAND_DARK = "#1E3A5F";

function buildEmailHtml(opts: {
  preheader: string;
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const cta =
    opts.ctaText && opts.ctaUrl
      ? `
    <tr>
      <td align="center" style="padding: 24px 0 8px;">
        <table border="0" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" bgcolor="${BRAND_COLOR}" style="border-radius: 8px;">
              <a href="${opts.ctaUrl}" target="_blank"
                style="display:inline-block;padding:14px 32px;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                ${opts.ctaText}
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:12px 0 0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#6B7280;">
          Or copy this link: <a href="${opts.ctaUrl}" style="color:${BRAND_COLOR};">${opts.ctaUrl}</a>
        </p>
      </td>
    </tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:Inter,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F3F4F6;">
    ${opts.preheader}
  </div>
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#F3F4F6;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:${BRAND_DARK};padding:24px 32px;">
              <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
                ⚖️ ${APP_NAME}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <h1 style="margin:0 0 16px;font-family:Inter,Arial,sans-serif;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">
                      ${opts.title}
                    </h1>
                    <div style="font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.6;">
                      ${opts.body}
                    </div>
                  </td>
                </tr>
                ${cta}
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#F9FAFB;padding:20px 32px;border-top:1px solid #E5E7EB;">
              <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:12px;color:#9CA3AF;line-height:1.5;">
                ${opts.footerNote ?? `You received this email because you have an account with ${APP_NAME}.`}
                <br>This is an automated notification — please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Template definitions ─────────────────────────────────────────────────────

interface PreviewParams {
  name: string;
  subject: string;
  letterId: number;
  state: string;
  letterType: string;
  appUrl: string;
}

type TemplateKey =
  | "submission"
  | "letter_ready"
  | "unlocked"
  | "approved"
  | "rejected"
  | "needs_changes"
  | "new_review"
  | "job_failed"
  | "status_update";

interface TemplateDefinition {
  label: string;
  description: string;
  render: (p: PreviewParams) => { html: string; plain: string; subject: string };
}

const TEMPLATES: Record<TemplateKey, TemplateDefinition> = {
  submission: {
    label: "Submission Confirmation",
    description: "Sent to subscriber immediately after they submit a new letter request.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
      const letterTypeLabel = p.letterType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const body = `
        <p>Hello ${p.name},</p>
        <p>We've received your legal letter request and our AI pipeline is already working on it. You'll receive another email as soon as your draft is ready to review.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#0369A1;"><strong>📋 Submission Details</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Subject:</strong> ${p.subject}</p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${letterTypeLabel}</p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${p.state}</p>
            <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
          </td></tr>
        </table>
        <p><strong>What happens next?</strong></p>
        <ol style="margin:8px 0;padding-left:20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.8;">
          <li>Our AI conducts jurisdiction-specific legal research</li>
          <li>A professional draft letter is generated</li>
          <li>You'll be notified to review and unlock your letter</li>
          <li>A licensed attorney reviews and approves your final letter</li>
        </ol>
        <p style="font-size:13px;color:#6B7280;">This typically takes 2–5 minutes. You can track progress in your account at any time.</p>
      `;
      return {
        subject: `[${APP_NAME}] Letter request received — #${p.letterId}`,
        html: buildEmailHtml({ preheader: `We've received your letter request #${p.letterId}.`, title: "Your Letter Request Has Been Received ✓", body, ctaText: "Track Your Letter", ctaUrl }),
        plain: `Your letter request #${p.letterId} ("${p.subject}") has been received. Track at: ${ctaUrl}`,
      };
    },
  },

  letter_ready: {
    label: "Letter Ready — Unlock Now",
    description: "Sent to subscriber when the AI pipeline completes and the letter is in generated_locked status.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
      const body = `
        <p>Hello ${p.name},</p>
        <p>Your AI-drafted legal letter is ready! Our system has completed the research and drafting stages for your request.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#166534;"><strong>✅ Your Draft Is Ready</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${p.subject}</p>
            <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
          </td></tr>
        </table>
        <p>To send your letter for licensed attorney review and final approval, click the button below to view your draft and complete the unlock payment.</p>
        <p style="font-size:13px;color:#6B7280;">Attorney review ensures your letter is legally sound and professionally formatted before it's sent.</p>
      `;
      return {
        subject: `[${APP_NAME}] Your letter draft is ready — unlock for attorney review`,
        html: buildEmailHtml({ preheader: "Your AI-drafted letter is ready — unlock it for attorney review.", title: "Your Letter Draft Is Ready 🎉", body, ctaText: "View & Unlock Your Letter — $29", ctaUrl }),
        plain: `Your letter "${p.subject}" (#${p.letterId}) is ready. Unlock it at: ${ctaUrl}`,
      };
    },
  },

  unlocked: {
    label: "Payment Confirmed — In Review",
    description: "Sent to subscriber after Stripe payment is confirmed and letter moves to pending_review.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
      const body = `
        <p>Hello ${p.name},</p>
        <p>Payment confirmed! Your letter has been sent to our attorney team for review and approval.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#5B21B6;"><strong>⚖️ In Attorney Review</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${p.subject}</p>
            <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
          </td></tr>
        </table>
        <p><strong>What happens next?</strong></p>
        <ol style="margin:8px 0;padding-left:20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.8;">
          <li>A licensed attorney reviews your letter for legal accuracy</li>
          <li>They may request minor changes or approve it as-is</li>
          <li>You'll receive an email when your letter is approved and ready</li>
        </ol>
        <p style="font-size:13px;color:#6B7280;">Attorney review typically takes 1–2 business days.</p>
      `;
      return {
        subject: `[${APP_NAME}] Payment confirmed — your letter is in attorney review`,
        html: buildEmailHtml({ preheader: "Payment confirmed — your letter is now with our attorney team.", title: "Payment Confirmed — Letter In Review ✓", body, ctaText: "Track Review Status", ctaUrl }),
        plain: `Payment confirmed. Your letter "${p.subject}" (#${p.letterId}) is in attorney review. Track at: ${ctaUrl}`,
      };
    },
  },

  approved: {
    label: "Letter Approved",
    description: "Sent to subscriber when an attorney approves their letter.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
      const body = `
        <p>Hello ${p.name},</p>
        <p>Great news! A licensed attorney has reviewed and approved your legal letter. It is now ready for you to download and send.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#166534;"><strong>✅ Letter Approved</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${p.subject}</p>
            <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
          </td></tr>
        </table>
        <p>Your letter has been professionally reviewed and is ready to send. Log in to download your approved letter.</p>
      `;
      return {
        subject: `[${APP_NAME}] Your letter has been approved`,
        html: buildEmailHtml({ preheader: "Your legal letter has been approved by a licensed attorney.", title: "Your Letter Has Been Approved ✓", body, ctaText: "Download Your Letter", ctaUrl }),
        plain: `Your letter "${p.subject}" (#${p.letterId}) has been approved. Download at: ${ctaUrl}`,
      };
    },
  },

  rejected: {
    label: "Letter Rejected",
    description: "Sent to subscriber when an attorney cannot process their letter.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
      const reason = "After careful review, our attorney determined that this letter cannot be processed as submitted due to insufficient factual basis for the legal claims asserted.";
      const body = `
        <p>Hello ${p.name},</p>
        <p>We regret to inform you that your letter request could not be processed after attorney review.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#9A3412;"><strong>⚠️ Letter Not Approved</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${p.subject}</p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Reason:</strong> ${reason}</p>
          </td></tr>
        </table>
        <p>If you believe this decision was made in error, or if you have additional information to provide, please contact our support team.</p>
      `;
      return {
        subject: `[${APP_NAME}] Update on your letter request`,
        html: buildEmailHtml({ preheader: "An update on your letter request is available.", title: "Update on Your Letter Request", body, ctaText: "View Details", ctaUrl }),
        plain: `Your letter "${p.subject}" (#${p.letterId}) could not be processed. Reason: ${reason}. View at: ${ctaUrl}`,
      };
    },
  },

  needs_changes: {
    label: "Changes Requested",
    description: "Sent to subscriber when an attorney requests changes before approval.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
      const note = "Please provide the specific dates of each missed payment and the total amount owed. Also clarify whether a written lease agreement exists and attach a copy if available.";
      const body = `
        <p>Hello ${p.name},</p>
        <p>Our reviewing attorney has requested some changes to your letter before it can be approved. Please review the feedback below and update your submission.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#92400E;"><strong>📝 Attorney Feedback</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${p.subject}</p>
            <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Requested changes:</strong> ${note}</p>
          </td></tr>
        </table>
        <p>Once you've provided the requested information, our attorney will complete the review promptly.</p>
      `;
      return {
        subject: `[${APP_NAME}] Changes requested for your letter`,
        html: buildEmailHtml({ preheader: "Your attorney has requested some changes to your letter.", title: "Changes Requested for Your Letter", body, ctaText: "Update Your Letter", ctaUrl }),
        plain: `Changes requested for your letter "${p.subject}" (#${p.letterId}). Feedback: ${note}. Update at: ${ctaUrl}`,
      };
    },
  },

  new_review: {
    label: "New Review Needed (Employee)",
    description: "Sent to attorneys/employees when a new letter enters the review queue.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/review/${p.letterId}`;
      const letterTypeLabel = p.letterType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const body = `
        <p>Hello ${p.name},</p>
        <p>A new legal letter is ready for attorney review in the review queue.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#1D4ED8;"><strong>📬 New Letter for Review</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Subject:</strong> ${p.subject}</p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${letterTypeLabel}</p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${p.state}</p>
            <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
          </td></tr>
        </table>
        <p>Please claim this letter in the review center to begin your review.</p>
      `;
      return {
        subject: `[${APP_NAME}] New letter ready for review: ${p.subject}`,
        html: buildEmailHtml({ preheader: `New letter ready for review: ${p.subject}`, title: "New Letter Ready for Review", body, ctaText: "Claim & Review Letter", ctaUrl }),
        plain: `New letter for review: "${p.subject}" (#${p.letterId}, ${letterTypeLabel}, ${p.state}). Claim at: ${ctaUrl}`,
      };
    },
  },

  job_failed: {
    label: "Pipeline Job Failed (Admin Alert)",
    description: "Sent to admins when the AI pipeline fails for a letter.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/admin/jobs`;
      const errorMsg = "OpenAI API returned a 503 Service Unavailable error after 3 retry attempts. The pipeline has been halted and the letter reverted to submitted status for manual retry.";
      const body = `
        <p>Hello ${p.name},</p>
        <p>An automated pipeline job has failed and requires your attention.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FFF1F2;border:1px solid #FECDD3;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#BE123C;"><strong>🚨 Pipeline Failure Alert</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Job Type:</strong> generation_pipeline</p>
            <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Error:</strong> ${errorMsg}</p>
          </td></tr>
        </table>
        <p>Please review the failed job and retry or escalate as needed.</p>
      `;
      return {
        subject: `[${APP_NAME}] ALERT: Pipeline job failed for letter #${p.letterId}`,
        html: buildEmailHtml({ preheader: `Pipeline job failed for letter #${p.letterId}.`, title: "⚠️ Pipeline Job Failed", body, ctaText: "View Failed Jobs", ctaUrl }),
        plain: `Pipeline failed for letter #${p.letterId}. Error: ${errorMsg}. Manage at: ${ctaUrl}`,
      };
    },
  },

  status_update: {
    label: "Generic Status Update",
    description: "General-purpose status update email sent for miscellaneous status changes.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
      const body = `
        <p>Hello ${p.name},</p>
        <p>There has been an update on your legal letter request.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#0369A1;"><strong>📋 Status Update</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${p.subject}</p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>New Status:</strong> Under Review</p>
            <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
          </td></tr>
        </table>
        <p>Log in to your account to view the latest status and any notes from the review team.</p>
      `;
      return {
        subject: `[${APP_NAME}] Update on your letter: ${p.subject}`,
        html: buildEmailHtml({ preheader: `Status update for your letter "${p.subject}".`, title: "Your Letter Status Has Been Updated", body, ctaText: "Track Your Letter", ctaUrl }),
        plain: `Status update for your letter "${p.subject}" (#${p.letterId}). Track at: ${ctaUrl}`,
      };
    },
  },
};

// ─── Index page ───────────────────────────────────────────────────────────────

function buildIndexPage(baseUrl: string): string {
  const rows = (Object.entries(TEMPLATES) as [TemplateKey, TemplateDefinition][])
    .map(([key, def]) => {
      const previewUrl = `${baseUrl}?type=${key}`;
      const plainUrl = `${baseUrl}?type=${key}&mode=plain`;
      return `
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid #E5E7EB;">
            <strong style="font-size:15px;color:#111827;">${def.label}</strong>
            <br><span style="font-size:13px;color:#6B7280;">${def.description}</span>
          </td>
          <td style="padding:14px 16px;border-bottom:1px solid #E5E7EB;white-space:nowrap;">
            <a href="${previewUrl}" target="_blank"
              style="display:inline-block;padding:6px 14px;background:#1D4ED8;color:#fff;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;margin-right:8px;">
              HTML
            </a>
            <a href="${plainUrl}" target="_blank"
              style="display:inline-block;padding:6px 14px;background:#374151;color:#fff;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;">
              Plain
            </a>
          </td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Template Preview — ${APP_NAME}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px 24px; background: #F3F4F6; font-family: Inter, system-ui, Arial, sans-serif; color: #111827; }
    h1 { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
    .subtitle { font-size: 14px; color: #6B7280; margin: 0 0 32px; }
    .badge { display: inline-block; padding: 3px 10px; background: #FEF3C7; color: #92400E; border-radius: 99px; font-size: 12px; font-weight: 600; margin-left: 10px; vertical-align: middle; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 12px 16px; background: #F9FAFB; font-size: 12px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #E5E7EB; }
    .params { margin-top: 24px; background: #fff; border-radius: 12px; padding: 20px 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .params h2 { font-size: 16px; font-weight: 600; margin: 0 0 12px; }
    code { background: #F3F4F6; padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: 'JetBrains Mono', 'Fira Code', monospace; }
    .param-row { display: flex; gap: 16px; margin-bottom: 8px; font-size: 14px; }
    .param-name { font-weight: 600; min-width: 100px; color: #1D4ED8; }
    .param-desc { color: #374151; }
  </style>
</head>
<body>
  <h1>⚖️ ${APP_NAME} <span class="badge">DEV ONLY</span></h1>
  <p class="subtitle">Email template preview — not accessible in production</p>

  <div class="card">
    <table>
      <thead>
        <tr>
          <th>Template</th>
          <th>Preview</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div class="params">
    <h2>Customise preview data</h2>
    <p style="font-size:14px;color:#6B7280;margin:0 0 16px;">Append any of these query params to the preview URL to use custom data:</p>
    <div class="param-row"><span class="param-name">name</span><span class="param-desc">Recipient name &nbsp;<code>?name=John+Doe</code></span></div>
    <div class="param-row"><span class="param-name">subject</span><span class="param-desc">Letter subject &nbsp;<code>?subject=Breach+of+Contract</code></span></div>
    <div class="param-row"><span class="param-name">letterId</span><span class="param-desc">Letter ID &nbsp;<code>?letterId=99</code></span></div>
    <div class="param-row"><span class="param-name">state</span><span class="param-desc">Jurisdiction state &nbsp;<code>?state=TX</code></span></div>
    <div class="param-row"><span class="param-name">letterType</span><span class="param-desc">Letter type slug &nbsp;<code>?letterType=cease-and-desist</code></span></div>
    <div class="param-row"><span class="param-name">mode</span><span class="param-desc">Output mode &nbsp;<code>?mode=plain</code> (default: html)</span></div>
  </div>
</body>
</html>`;
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerEmailPreviewRoute(app: Express): void {
  if (process.env.NODE_ENV === "production") return;

  app.get("/api/dev/email-preview", (req: Request, res: Response) => {
    const type = req.query.type as string | undefined;
    const mode = (req.query.mode as string | undefined) ?? "html";

    // Build preview params from query string with sensible defaults
    const params: PreviewParams = {
      name: (req.query.name as string) || "Jane Smith",
      subject: (req.query.subject as string) || "Breach of Lease Agreement — 123 Main St",
      letterId: parseInt((req.query.letterId as string) || "42", 10),
      state: (req.query.state as string) || "CA",
      letterType: (req.query.letterType as string) || "demand-letter",
      appUrl: `${req.protocol}://${req.headers.host}`,
    };

    // No type → render index
    if (!type) {
      const baseUrl = `${params.appUrl}/api/dev/email-preview`;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(buildIndexPage(baseUrl));
      return;
    }

    const template = TEMPLATES[type as TemplateKey];
    if (!template) {
      res.status(404).send(`Unknown template type "${type}". Available: ${Object.keys(TEMPLATES).join(", ")}`);
      return;
    }

    const rendered = template.render(params);

    if (mode === "plain") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(`Subject: ${rendered.subject}\n\n${rendered.plain}`);
      return;
    }

    // Wrap HTML output in a dev toolbar so the subject line is visible
    const toolbar = `
      <div style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#1E3A5F;color:#fff;padding:10px 20px;font-family:Inter,system-ui,sans-serif;font-size:13px;display:flex;align-items:center;gap:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
        <span style="font-weight:700;font-size:14px;">⚖️ Email Preview</span>
        <span style="background:#FEF3C7;color:#92400E;padding:2px 10px;border-radius:99px;font-weight:600;">DEV ONLY</span>
        <span style="color:#93C5FD;">Template: <strong style="color:#fff;">${template.label}</strong></span>
        <span style="color:#93C5FD;">Subject: <em style="color:#E0F2FE;">${rendered.subject}</em></span>
        <span style="margin-left:auto;">
          <a href="?type=${type}&mode=plain${buildQuerySuffix(req.query, ["type", "mode"])}" style="color:#93C5FD;text-decoration:none;margin-right:12px;">View Plain Text</a>
          <a href="?" style="color:#93C5FD;text-decoration:none;">← All Templates</a>
        </span>
      </div>
      <div style="height:44px;"></div>`;

    const finalHtml = rendered.html.replace("<body", `<body`).replace(
      /(<body[^>]*>)/,
      `$1${toolbar}`
    );

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(finalHtml);
  });
}

function buildQuerySuffix(
  query: Record<string, unknown>,
  exclude: string[]
): string {
  return Object.entries(query)
    .filter(([k]) => !exclude.includes(k))
    .map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(String(v ?? ""))}`)
    .join("");
}
