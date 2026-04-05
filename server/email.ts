/**
 * Email notification service.
 *
 * When EMAIL_WORKER_URL and EMAIL_WORKER_SECRET are configured, all email
 * sending is delegated to the Cloudflare Worker (fire-and-forget). The Worker
 * renders templates and sends via Resend, handling retries and logging.
 *
 * If the Worker is not configured, email is sent directly via Resend (legacy
 * fallback path with local template rendering).
 *
 * All public `send*Email` function signatures are unchanged so callers need no updates.
 */

import { Resend } from "resend";
import { ENV } from "./_core/env";

type EmailPayload = { type: string; [key: string]: unknown };

// Lazy-init Resend client for fallback path
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}
const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@talk-to-my-lawyer.com";
const APP_NAME = "Talk to My Lawyer";
const BRAND_COLOR = "#2563EB";
const BRAND_DARK = "#0F2744";
const BRAND_ACCENT = "#1D4ED8";
const LOGO_URL = "https://www.talk-to-my-lawyer.com/images/logo.png";

// ─── Worker Dispatch ──────────────────────────────────────────────────────────

/**
 * Fire-and-forget dispatch to the Cloudflare Email Worker.
 * Returns true if the request was accepted (2xx), false on error.
 * Never throws — failures are logged and the caller can decide to fallback.
 */
const WORKER_DISPATCH_TIMEOUT_MS = 5_000;

async function dispatchToWorker(payload: EmailPayload): Promise<boolean> {
  const workerUrl = ENV.emailWorkerUrl;
  const workerSecret = ENV.emailWorkerSecret;
  if (!workerUrl || !workerSecret) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORKER_DISPATCH_TIMEOUT_MS);

  try {
    const res = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workerSecret}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[Email] Worker returned ${res.status} for type=${payload.type}: ${body}`);
      return false;
    }
    console.log(`[Email] Dispatched to Worker, type=${payload.type}`);
    return true;
  } catch (err) {
    clearTimeout(timer);
    const label = (err as { name?: string }).name === "AbortError" ? "timed out" : "failed";
    console.error(`[Email] Worker dispatch ${label} for type=${payload.type}:`, err);
    return false;
  }
}

// ─── HTML Template Builder (fallback path) ────────────────────────────────────

function buildEmailHtml(opts: {
  preheader: string;
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
  accentColor?: string;
}): string {
  const accent = opts.accentColor ?? BRAND_COLOR;
  const cta =
    opts.ctaText && opts.ctaUrl
      ? `
    <tr>
      <td align="center" style="padding:28px 0 8px;">
        <table border="0" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="border-radius:8px;background:linear-gradient(135deg,${accent} 0%,${BRAND_ACCENT} 100%);">
              <a href="${opts.ctaUrl}" target="_blank"
                style="display:inline-block;padding:15px 36px;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.2px;">
                ${opts.ctaText} &rarr;
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:14px 0 0;font-family:Inter,Arial,sans-serif;font-size:12px;color:#9CA3AF;">
          Button not working? <a href="${opts.ctaUrl}" style="color:${accent};text-decoration:underline;">Click here</a>
        </p>
      </td>
    </tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${opts.title}</title>
  <!--[if mso]><style>table{border-collapse:collapse;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#EEF2F7;font-family:Inter,Arial,sans-serif;-webkit-text-size-adjust:100%;">
  <!-- Preheader (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#EEF2F7;">
    ${opts.preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <!-- Outer wrapper -->
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#EEF2F7;">
    <tr>
      <td align="center" style="padding:40px 16px 48px;">

        <!-- Email card -->
        <table border="0" cellpadding="0" cellspacing="0" width="600"
          style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;
                 overflow:hidden;box-shadow:0 4px 24px rgba(15,39,68,0.12);">

          <!-- ═══ HEADER BAND ═══ -->
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND_DARK} 0%,#1A3A6B 60%,#1D4ED8 100%);padding:0;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <!-- Logo badge -->
                  <td width="80" style="padding:24px 0 24px 32px;vertical-align:middle;">
                    <img src="${LOGO_URL}" alt="Talk to My Lawyer" width="64" height="64"
                      style="display:block;border-radius:50%;border:2px solid rgba(255,255,255,0.25);
                             background:#0F2744;" />
                  </td>
                  <!-- Brand name -->
                  <td style="padding:24px 32px 24px 16px;vertical-align:middle;">
                    <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:18px;
                               font-weight:800;color:#ffffff;letter-spacing:-0.4px;line-height:1.2;">
                      Talk to My Lawyer
                    </p>
                    <p style="margin:4px 0 0;font-family:Inter,Arial,sans-serif;font-size:12px;
                               color:rgba(255,255,255,0.65);letter-spacing:0.5px;text-transform:uppercase;">
                      Attorney-Reviewed Legal Letters
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ═══ ACCENT STRIPE ═══ -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,${accent} 0%,#60A5FA 100%);"></td>
          </tr>

          <!-- ═══ BODY ═══ -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <h1 style="margin:0 0 18px;font-family:Inter,Arial,sans-serif;font-size:24px;
                               font-weight:700;color:#0F2744;line-height:1.25;letter-spacing:-0.4px;">
                      ${opts.title}
                    </h1>
                    <div style="font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7;">
                      ${opts.body}
                    </div>
                  </td>
                </tr>
                ${cta}
              </table>
            </td>
          </tr>

          <!-- ═══ DIVIDER ═══ -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #E5E7EB;margin:0;" />
            </td>
          </tr>

          <!-- ═══ FOOTER ═══ -->
          <tr>
            <td style="background-color:#F8FAFC;padding:20px 40px 24px;border-radius:0 0 16px 16px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding-bottom:10px;">
                    <img src="${LOGO_URL}" alt="" width="28" height="28"
                      style="display:inline-block;vertical-align:middle;border-radius:50%;opacity:0.6;" />
                    <span style="font-family:Inter,Arial,sans-serif;font-size:12px;font-weight:600;
                                 color:#6B7280;vertical-align:middle;margin-left:6px;">Talk to My Lawyer</span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:11px;color:#9CA3AF;line-height:1.6;">
                      ${opts.footerNote ?? `You received this email because you have an account with ${APP_NAME}.`}
                      <br>This is an automated notification — please do not reply directly to this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- End email card -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildPlainText(opts: {
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
}): string {
  let text = `${APP_NAME}\n${"=".repeat(40)}\n\n${opts.title}\n\n${opts.body
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim()}`;
  if (opts.ctaText && opts.ctaUrl)
    text += `\n\n${opts.ctaText}: ${opts.ctaUrl}`;
  text += `\n\n---\nThis is an automated notification from ${APP_NAME}.`;
  return text;
}

// ─── Fallback Email Sending Helpers ──────────────────────────────────────────

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  try {
    const { error } = await getResend().emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (error) console.error("[Email] Resend error:", error);
  } catch (err) {
    console.error("[Email] Failed to send:", err);
  }
}

async function sendWithRetry(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const delays = [2000, 5000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const result = await getResend().emails.send({
        from: FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      });
      if (result.error) {
        console.error(`[Email] Resend API error (attempt ${attempt + 1}), from=${FROM}, to=${opts.to}:`, JSON.stringify(result.error));
        lastErr = result.error;
      } else {
        console.log(`[Email] Sent successfully (attempt ${attempt + 1}), from=${FROM}, to=${opts.to}, id=${result.data?.id ?? "unknown"}`);
        return;
      }
    } catch (err) {
      lastErr = err;
      console.error(`[Email] Send exception (attempt ${attempt + 1}), from=${FROM}, to=${opts.to}:`, err);
    }
    if (attempt < delays.length) {
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
  console.error(`[Email] All retry attempts exhausted, from=${FROM}, to=${opts.to}:`, lastErr);
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ─── Transactional Email Templates ───────────────────────────────────────────

/** Notify subscriber when their letter has been approved */
export async function sendLetterApprovedEmail(opts: {
  to: string;
  name: string;
  subject: string;
  letterId: number;
  appUrl: string;
  pdfUrl?: string;
}) {
  const dispatched = await dispatchToWorker({ type: "letter_approved", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/letters/${opts.letterId}`;
  const pdfLine = opts.pdfUrl
    ? `<p style="margin-top:12px;">📄 <a href="${opts.pdfUrl}" style="color:${BRAND_DARK};font-weight:bold;">Download your Reviewed PDF</a></p>`
    : "";
  const body = `
    <p>Hello ${opts.name},</p>
    <p>Great news! Your legal letter request has been <strong style="color:#059669;">approved</strong> by our attorney team.</p>
    <p><strong>Letter:</strong> ${opts.subject}</p>
    <p>Your final approved letter is now available for download in your account. Click the button below to view and download it.</p>
    ${pdfLine}
  `;
  const html = buildEmailHtml({
    preheader: "Your legal letter has been approved and is ready to download.",
    title: "Your Letter Has Been Approved ✓",
    body,
    ctaText: "View Your Approved Letter",
    ctaUrl,
    accentColor: "#059669",
  });
  await sendWithRetry({
    to: opts.to,
    subject: `[${APP_NAME}] Your letter has been approved`,
    html,
    text: buildPlainText({
      title: "Your Letter Has Been Approved",
      body: `Hello ${opts.name}, your legal letter "${opts.subject}" has been approved. View it at: ${ctaUrl}`,
      ctaText: "View Letter",
      ctaUrl,
    }),
  });
}

/** Notify subscriber when their letter needs changes */
export async function sendNeedsChangesEmail(opts: {
  to: string;
  name: string;
  subject: string;
  letterId: number;
  attorneyNote?: string;
  appUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "needs_changes", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/letters/${opts.letterId}`;
  const noteBlock = opts.attorneyNote
    ? `<blockquote style="margin:16px 0;padding:12px 16px;background:#FEF3C7;border-left:4px solid #F59E0B;border-radius:4px;font-style:italic;color:#92400E;">${opts.attorneyNote}</blockquote>`
    : "";
  const body = `
    <p>Hello ${opts.name},</p>
    <p>Our attorney has reviewed your letter request and has requested some changes before it can be approved.</p>
    <p><strong>Letter:</strong> ${opts.subject}</p>
    ${noteBlock}
    <p>Please review the feedback and update your request accordingly.</p>
  `;
  const html = buildEmailHtml({
    preheader: "Your letter needs some changes before it can be approved.",
    title: "Changes Requested for Your Letter",
    body,
    ctaText: "View Feedback & Update",
    ctaUrl,
    accentColor: "#D97706",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Changes requested for your letter`,
    html,
    text: buildPlainText({
      title: "Changes Requested",
      body: `Hello ${opts.name}, your letter "${opts.subject}" needs changes. ${opts.attorneyNote ?? ""} View at: ${ctaUrl}`,
      ctaText: "View Letter",
      ctaUrl,
    }),
  });
}

/** Notify subscriber when their letter has been rejected */
export async function sendLetterRejectedEmail(opts: {
  to: string;
  name: string;
  subject: string;
  letterId: number;
  reason?: string;
  appUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "letter_rejected", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/letters/${opts.letterId}`;
  const reasonBlock = opts.reason
    ? `<blockquote style="margin:16px 0;padding:12px 16px;background:#FEE2E2;border-left:4px solid #EF4444;border-radius:4px;color:#991B1B;">${opts.reason}</blockquote>`
    : "";
  const body = `
    <p>Hello ${opts.name},</p>
    <p>After careful review, our attorney team has determined that your letter request cannot be processed at this time.</p>
    <p><strong>Letter:</strong> ${opts.subject}</p>
    ${reasonBlock}
    <p>If you believe this is an error or have questions, please contact our support team.</p>
  `;
  const html = buildEmailHtml({
    preheader: "Your letter request has been reviewed.",
    title: "Letter Request Update",
    body,
    ctaText: "View Details",
    ctaUrl,
    accentColor: "#DC2626",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Update on your letter request`,
    html,
    text: buildPlainText({
      title: "Letter Request Update",
      body: `Hello ${opts.name}, your letter "${opts.subject}" could not be processed. ${opts.reason ?? ""} View at: ${ctaUrl}`,
      ctaText: "View Details",
      ctaUrl,
    }),
  });
}

/** Notify attorney/employee when a new letter is ready for review */
export async function sendNewReviewNeededEmail(opts: {
  to: string;
  name: string;
  letterSubject: string;
  letterId: number;
  letterType: string;
  jurisdiction: string;
  appUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "new_review_needed", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/review/${opts.letterId}`;
  const body = `
    <p>Hello ${opts.name},</p>
    <p>A new letter request is ready for your review in the attorney queue.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F9FAFB;border-radius:8px;margin:16px 0;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;"><strong>Subject:</strong> ${opts.letterSubject}</p>
        <p style="margin:0 0 8px;"><strong>Type:</strong> ${opts.letterType}</p>
        <p style="margin:0;"><strong>Jurisdiction:</strong> ${opts.jurisdiction}</p>
      </td></tr>
    </table>
    <p>Please log in to claim and review this letter at your earliest convenience.</p>
  `;
  const html = buildEmailHtml({
    preheader: `A new letter is waiting for your review.`,
    title: "New Letter Ready for Review",
    body,
    ctaText: "Review Letter",
    ctaUrl,
    accentColor: "#7C3AED",
  });
  await sendWithRetry({
    to: opts.to,
    subject: `[${APP_NAME}] New letter ready for review: ${opts.letterSubject}`,
    html,
    text: buildPlainText({
      title: "New Letter Ready for Review",
      body: `Hello ${opts.name}, a new letter "${opts.letterSubject}" (${opts.letterType}, ${opts.jurisdiction}) is ready for review. Claim it at: ${ctaUrl}`,
      ctaText: "Review Letter",
      ctaUrl,
    }),
  });
}

/** Notify attorney when subscriber requests revisions on an approved letter */
export async function sendClientRevisionRequestEmail(opts: {
  to: string;
  name: string;
  letterSubject: string;
  letterId: number;
  subscriberNotes: string;
  appUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "client_revision_request", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/review/${opts.letterId}`;
  const body = `
    <p>Hello ${opts.name},</p>
    <p>A subscriber has reviewed your approved letter and is <strong>requesting revisions</strong> before they will approve delivery.</p>
    <p><strong>Letter:</strong> ${opts.letterSubject}</p>
    <blockquote style="margin:16px 0;padding:12px 16px;background:#F3E8FF;border-left:4px solid #8B5CF6;border-radius:4px;color:#5B21B6;">${opts.subscriberNotes}</blockquote>
    <p>The letter has been returned to the review queue. Please review the subscriber's feedback and make the requested changes.</p>
  `;
  const html = buildEmailHtml({
    preheader: `A subscriber has requested revisions on letter "${opts.letterSubject}".`,
    title: "Client Revision Requested",
    body,
    ctaText: "Review Letter",
    ctaUrl,
    accentColor: "#7C3AED",
  });
  await sendWithRetry({
    to: opts.to,
    subject: `[${APP_NAME}] Client revision requested: ${opts.letterSubject}`,
    html,
    text: buildPlainText({
      title: "Client Revision Requested",
      body: `Hello ${opts.name}, a subscriber has requested revisions on "${opts.letterSubject}". Notes: ${opts.subscriberNotes}. Review at: ${ctaUrl}`,
      ctaText: "Review Letter",
      ctaUrl,
    }),
  });
}

/** Notify admin when an AI pipeline job fails */
export async function sendJobFailedAlertEmail(opts: {
  to: string;
  name: string;
  letterId: number;
  jobType: string;
  errorMessage: string;
  appUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "job_failed_alert", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/admin/jobs`;
  const body = `
    <p>Hello ${opts.name},</p>
    <p>An AI pipeline job has <strong style="color:#DC2626;">failed</strong> and requires your attention.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FEF2F2;border-radius:8px;margin:16px 0;border:1px solid #FECACA;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;"><strong>Letter ID:</strong> #${opts.letterId}</p>
        <p style="margin:0 0 8px;"><strong>Job Type:</strong> ${opts.jobType}</p>
        <p style="margin:0;"><strong>Error:</strong> <code style="font-size:13px;color:#991B1B;">${opts.errorMessage}</code></p>
      </td></tr>
    </table>
    <p>Please review the failed job and retry if appropriate.</p>
  `;
  const html = buildEmailHtml({
    preheader: "An AI pipeline job has failed and needs attention.",
    title: "⚠️ Pipeline Job Failed",
    body,
    ctaText: "View Failed Jobs",
    ctaUrl,
    accentColor: "#DC2626",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] ALERT: Pipeline job failed for letter #${opts.letterId}`,
    html,
    text: buildPlainText({
      title: "Pipeline Job Failed",
      body: `Letter #${opts.letterId}, Job: ${opts.jobType}, Error: ${opts.errorMessage}. Manage at: ${ctaUrl}`,
      ctaText: "View Jobs",
      ctaUrl,
    }),
  });
}

export async function sendAdminAlertEmail(opts: {
  to: string;
  name: string;
  subject: string;
  preheader: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
}) {
  const dispatched = await dispatchToWorker({ type: "admin_alert", ...opts });
  if (dispatched) return;

  const html = buildEmailHtml({
    preheader: opts.preheader,
    title: opts.subject,
    body: opts.bodyHtml,
    ctaText: opts.ctaText,
    ctaUrl: opts.ctaUrl,
    accentColor: BRAND_COLOR,
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] ${opts.subject}`,
    html,
    text: buildPlainText({
      title: opts.subject,
      body: opts.preheader,
      ctaText: opts.ctaText,
      ctaUrl: opts.ctaUrl,
    }),
  });
}

/** Notify subscriber when their letter enters a new processing stage */
export async function sendStatusUpdateEmail(opts: {
  to: string;
  name: string;
  subject: string;
  letterId: number;
  newStatus: string;
  appUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "status_update", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/letters/${opts.letterId}`;
  const statusMessages: Record<string, string> = {
    researching:
      "Our AI is now researching the applicable laws and regulations for your jurisdiction.",
    drafting: "Our AI is drafting your letter based on the legal research.",
    pending_review:
      "Your letter draft is complete and has been placed in the attorney review queue.",
    under_review:
      "An attorney has claimed your letter and is currently reviewing it.",
  };
  const message =
    statusMessages[opts.newStatus] ?? "Your letter request has been updated.";
  const body = `
    <p>Hello ${opts.name},</p>
    <p>${message}</p>
    <p><strong>Letter:</strong> ${opts.subject}</p>
    <p>You can track the progress of your letter in your account.</p>
  `;
  const html = buildEmailHtml({
    preheader: `Update on your letter: ${opts.subject}`,
    title: "Letter Status Update",
    body,
    ctaText: "Track Your Letter",
    ctaUrl,
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Update on your letter: ${opts.subject}`,
    html,
    text: buildPlainText({
      title: "Letter Status Update",
      body: `Hello ${opts.name}, ${message} Letter: "${opts.subject}". Track at: ${ctaUrl}`,
      ctaText: "Track Letter",
      ctaUrl,
    }),
  });
}

/**
 * Send the approved letter directly to a recipient email address.
 * Attaches the PDF if available, otherwise embeds the HTML letter content inline.
 */
export async function sendLetterToRecipient(opts: {
  recipientEmail: string;
  letterSubject: string;
  subjectOverride?: string;
  note?: string;
  pdfUrl?: string;
  htmlContent?: string;
}): Promise<void> {
  const dispatched = await dispatchToWorker({ type: "letter_to_recipient", ...opts });
  if (dispatched) return;

  const emailSubject = opts.subjectOverride || opts.letterSubject;
  const escapeHtml = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const noteBlock = opts.note
    ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;margin:16px 0;">
        <tr><td style="padding:14px 18px;">
          <p style="margin:0 0 4px;font-family:Inter,Arial,sans-serif;font-size:12px;color:#92400E;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Note from sender</p>
          <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;line-height:1.6;">${escapeHtml(opts.note)}</p>
        </td></tr>
      </table>`
    : "";
  const attachments: Array<{ filename: string; content: Buffer }> = [];
  let hasPdfAttachment = false;

  if (opts.pdfUrl) {
    try {
      const pdfRes = await fetch(opts.pdfUrl);
      if (pdfRes.ok) {
        const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
        attachments.push({ filename: "legal-letter.pdf", content: pdfBuffer });
        hasPdfAttachment = true;
      }
    } catch (err) {
      console.warn("[Email] Could not fetch PDF for attachment, falling back to inline HTML:", err);
    }
  }

  const showInlineContent = !hasPdfAttachment && !!opts.htmlContent;
  const body = `
    <p>You have received a legal letter from <strong>${APP_NAME}</strong> on behalf of our client.</p>
    ${noteBlock}
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;margin:20px 0;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#0369A1;font-weight:700;">⚖️ Attorney-Reviewed Legal Correspondence</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Subject:</strong> ${opts.letterSubject}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Prepared by:</strong> ${APP_NAME} Legal Team</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#6B7280;">This letter has been reviewed and approved by a licensed attorney.</p>
      </td></tr>
    </table>
    ${hasPdfAttachment ? `<p>Please find the attorney-reviewed legal letter attached to this email as a PDF.</p>` : `<p>Please find the attorney-reviewed legal letter content below.</p>`}
    ${showInlineContent ? `
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:8px;margin:20px 0;">
      <tr><td style="padding:24px;font-family:Georgia,'Times New Roman',Times,serif;font-size:13px;line-height:1.8;color:#111;">
        ${opts.htmlContent}
      </td></tr>
    </table>` : ""}
    <p style="font-size:13px;color:#6B7280;margin-top:24px;">This letter was professionally drafted and approved by a licensed attorney through <strong>${APP_NAME}</strong>. If you have questions about this letter, please respond directly to the sender.</p>
  `;

  const html = buildEmailHtml({
    preheader: `You have received a legal letter: ${opts.letterSubject}`,
    title: "Legal Letter — Attorney Reviewed",
    body,
    accentColor: BRAND_DARK,
    footerNote: `This letter was sent via ${APP_NAME} on behalf of our client. This is a formal legal communication.`,
  });

  const notePlain = opts.note ? `\nNote from sender: ${opts.note}\n` : "";
  const plainText = buildPlainText({
    title: "Legal Letter — Attorney Reviewed",
    body: `You have received an attorney-reviewed legal letter via ${APP_NAME}.${notePlain}\n\nSubject: ${opts.letterSubject}\nPrepared by: ${APP_NAME} Legal Team\n\nThis letter has been reviewed and approved by a licensed attorney.${showInlineContent ? `\n\n--- Letter Content ---\n${opts.htmlContent!.replace(/<[^>]+>/g, "").trim()}\n--- End of Letter ---` : ""}`,
  });

  const delays = [2000, 5000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const { error } = await getResend().emails.send({
        from: FROM,
        to: opts.recipientEmail,
        subject: emailSubject,
        html,
        text: plainText,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      if (error) throw new Error(error.message);
      return;
    } catch (err) {
      lastErr = err;
      console.error(`[Email] sendLetterToRecipient attempt ${attempt + 1} failed:`, err);
      if (attempt < delays.length) {
        await new Promise(r => setTimeout(r, delays[attempt]));
      }
    }
  }
  console.error("[Email] sendLetterToRecipient all retry attempts exhausted:", lastErr);
  throw lastErr;
}

/** Validate Resend credentials (used in tests) */
export async function validateResendCredentials(): Promise<boolean> {
  try {
    const r = getResend();
    const { error } = await r.domains.list();
    return !error;
  } catch (err) {
    console.warn("[Email] Resend credential validation failed:", err);
    return false;
  }
}

/** Confirm to subscriber that their letter intake has been received */
export async function sendLetterSubmissionEmail(opts: {
  to: string;
  name: string;
  subject: string;
  letterId: number;
  letterType: string;
  jurisdictionState: string;
  appUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "letter_submission", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/letters/${opts.letterId}`;
  const letterTypeLabel = opts.letterType
    .replace(/-/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
  const body = `
    <p>Hello ${opts.name},</p>
    <p>We've received your letter intake and our team is now reviewing it. You'll receive a separate email with a direct link to your draft once it's ready — typically within 24 hours.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#0369A1;"><strong>📋 Submission Details</strong></p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Subject:</strong> ${opts.subject}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${letterTypeLabel}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${opts.jurisdictionState}</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${opts.letterId}</p>
      </td></tr>
    </table>
    <p><strong>What happens next?</strong></p>
    <ol style="margin:8px 0;padding-left:20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.8;">
      <li>Our team reviews your intake and details</li>
      <li>A draft letter is prepared for your situation</li>
      <li>You'll receive an email with a direct link to your draft</li>
      <li>A licensed attorney reviews and approves your final letter</li>
    </ol>
    <p style="font-size:13px;color:#6B7280;">You'll hear from us within 24 hours. You can also check your letter status in your account at any time.</p>
  `;
  const html = buildEmailHtml({
    preheader: `We've received your letter intake #${opts.letterId}. You'll hear from us within 24 hours.`,
    title: "Your Letter Intake Has Been Received ✓",
    body,
    ctaText: "View Your Letter",
    ctaUrl,
    accentColor: "#0284C7",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Letter intake received — #${opts.letterId}`,
    html,
    text: buildPlainText({
      title: "Your Letter Intake Has Been Received",
      body: `Hello ${opts.name}, we've received your letter intake #${opts.letterId} ("${opts.subject}", ${letterTypeLabel}, ${opts.jurisdictionState}). Our team is reviewing it now. You'll receive an email with a direct link to your draft within 24 hours. You can also check your letter status at: ${ctaUrl}`,
      ctaText: "View Your Letter",
      ctaUrl,
    }),
  });
}

/** Notify subscriber that their draft is ready and they can submit it for $299 attorney review */
export async function sendLetterReadyEmail(opts: {
  to: string;
  name: string;
  subject: string;
  letterId: number;
  appUrl: string;
  letterType?: string;
  jurisdictionState?: string;
}) {
  const dispatched = await dispatchToWorker({ type: "letter_ready", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/letters/${opts.letterId}`;
  const letterTypeLabel = opts.letterType
    ? opts.letterType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Legal Letter";
  const jurisdictionLine = opts.jurisdictionState
    ? `<p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${opts.jurisdictionState}</p>`
    : "";

  const body = `
    <p>Hello ${opts.name},</p>
    <p>Your letter draft is ready for your review. Click the button below to view it and proceed to attorney review.</p>

    <!-- Letter summary card -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 10px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#92400E;font-weight:700;">📄 Draft Ready — Attorney Review Required</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${opts.subject}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${letterTypeLabel}</p>
        ${jurisdictionLine}
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${opts.letterId}</p>
      </td></tr>
    </table>

    <!-- What's included -->
    <p style="margin:0 0 12px;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:700;color:#0F2744;">What's included with attorney review ($299):</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">⚖️</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>Licensed attorney review</strong> — a qualified attorney reads every word of your draft
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">✏️</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>Professional edits included</strong> — the attorney corrects, strengthens, and finalises your letter
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">📑</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>PDF delivered to your account</strong> — download and send your professionally formatted letter
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">🔒</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;">
          <strong>Legally sound and jurisdiction-specific</strong> — researched and drafted for your exact situation
        </td>
      </tr>
    </table>

    <!-- Urgency note -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;margin:0 0 8px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#1D4ED8;">
          Your draft is ready and waiting. Click the button below to view a preview and complete your payment to submit for attorney review.
        </p>
      </td></tr>
    </table>
  `;

  const html = buildEmailHtml({
    preheader: `Your letter draft is ready — submit for attorney review for $299.`,
    title: "Your Letter Draft Is Ready",
    body,
    ctaText: "View Draft & Submit for Review — $299",
    ctaUrl,
    accentColor: "#D97706",
  });

  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Your letter draft is ready — submit for attorney review`,
    html,
    text: buildPlainText({
      title: "Your Letter Draft Is Ready",
      body: `Hello ${opts.name},\n\nYour letter draft "${opts.subject}" (Letter #${opts.letterId}) is ready for attorney review.\n\nWhat's included with attorney review ($299):\n- Licensed attorney review\n- Professional edits included\n- PDF delivered to your account\n- Legally sound and jurisdiction-specific\n\nClick below to view a preview of your draft and submit for attorney review.`,
      ctaText: "View Draft & Submit for Review — $299",
      ctaUrl,
    }),
  });
}

/**
 * Initial timed paywall notification email — sent 10–15 minutes after draft generation.
 * Informs the subscriber their letter is ready, explains the paywall, and drives them
 * back to the platform to unlock via payment or free trial.
 *
 * Distinct from sendLetterReadyEmail (immediate pipeline notification) and
 * sendDraftReminderEmail (48-hour follow-up). This is the primary conversion email.
 */
export async function sendPaywallNotificationEmail(opts: {
  to: string;
  name: string;
  subject: string;
  letterId: number;
  appUrl: string;
  letterType?: string;
  jurisdictionState?: string;
}) {
  const dispatched = await dispatchToWorker({ type: "paywall_notification", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/letters/${opts.letterId}`;
  const letterTypeLabel = opts.letterType
    ? opts.letterType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Legal Letter";
  const jurisdictionLine = opts.jurisdictionState
    ? `<p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${opts.jurisdictionState}</p>`
    : "";

  const body = `
    <p>Hello ${opts.name},</p>
    <p>Great news — your AI-drafted legal letter is ready and waiting for you. A licensed attorney is standing by to review, strengthen, and approve it.</p>

    <!-- Letter summary card -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:10px;margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 10px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#0369A1;font-weight:700;">📋 Your Draft is Ready — Unlock for Attorney Review</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${opts.subject}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${letterTypeLabel}</p>
        ${jurisdictionLine}
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${opts.letterId}</p>
      </td></tr>
    </table>

    <!-- What happens next -->
    <p style="margin:0 0 12px;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:700;color:#0F2744;">What happens next?</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">🔒</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>View your locked draft</strong> — click below to see a preview of your letter
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">💳</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>Unlock for attorney review</strong> — $299 one-time, or subscribe for unlimited letters
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">⚖️</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>Licensed attorney reviews every word</strong> — edits, strengthens, and approves your letter
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">📄</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;">
          <strong>Download your approved PDF</strong> — professionally formatted and ready to send
        </td>
      </tr>
    </table>

    <!-- Pricing callout -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;margin:0 0 8px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#1D4ED8;">
          <strong>Attorney review — $299 one-time payment</strong> or subscribe for unlimited letters.
          Legal matters are time-sensitive — your draft is ready right now.
        </p>
      </td></tr>
    </table>
  `;

  const html = buildEmailHtml({
    preheader: `Your letter draft is ready — unlock it for attorney review.`,
    title: "Your Letter Draft Is Ready! 🎉",
    body,
    ctaText: "View & Unlock Your Letter",
    ctaUrl,
    accentColor: "#2563EB",
  });

  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Your letter is ready — view and unlock for attorney review`,
    html,
    text: buildPlainText({
      title: "Your Letter Draft Is Ready!",
      body: `Hello ${opts.name},\n\nYour AI-drafted legal letter is ready and waiting for you.\n\nLetter: "${opts.subject}"\nType: ${letterTypeLabel}\nLetter ID: #${opts.letterId}\n\nClick the link below to view a preview of your letter and unlock it for attorney review.\n\nUnlock options:\n- $299 one-time payment for attorney review\n- Subscribe for unlimited letters\n\nA licensed attorney will review, edit, and approve your letter. Legal matters are time-sensitive — act now.`,
      ctaText: "View & Unlock Your Letter",
      ctaUrl,
    }),
  });
}

/** Confirm to subscriber that their payment was received and letter is now in attorney review */
export async function sendLetterUnlockedEmail(opts: {
  to: string;
  name: string;
  subject: string;
  letterId: number;
  appUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "letter_unlocked", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/letters/${opts.letterId}`;
  const body = `
    <p>Hello ${opts.name},</p>
    <p>Payment confirmed! Your letter has been sent to our attorney team for review and approval.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#5B21B6;"><strong>⚖️ In Attorney Review</strong></p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${opts.subject}</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${opts.letterId}</p>
      </td></tr>
    </table>
    <p><strong>What happens next?</strong></p>
    <ol style="margin:8px 0;padding-left:20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.8;">
      <li>A licensed attorney reviews your letter for legal accuracy</li>
      <li>They may request minor changes or approve it as-is</li>
      <li>You'll receive an email when your letter is approved and ready</li>
    </ol>
    <p style="font-size:13px;color:#6B7280;">Attorney review typically takes 1–2 business days. You can check the status of your letter at any time in your account.</p>
  `;
  const html = buildEmailHtml({
    preheader: `Payment confirmed — your letter is now with our attorney team.`,
    title: "Payment Confirmed — Letter In Review ✓",
    body,
    ctaText: "Track Review Status",
    ctaUrl,
    accentColor: "#7C3AED",
  });
  await sendWithRetry({
    to: opts.to,
    subject: `[${APP_NAME}] Payment confirmed — your letter is in attorney review`,
    html,
    text: buildPlainText({
      title: "Payment Confirmed — Letter In Review",
      body: `Hello ${opts.name}, your payment has been confirmed and your letter "${opts.subject}" (Letter #${opts.letterId}) is now in attorney review. You'll receive an email when it's approved. Track status at: ${ctaUrl}`,
      ctaText: "Track Review Status",
      ctaUrl,
    }),
  });
}

/** Send email verification link to new user */
export async function sendVerificationEmail(opts: {
  to: string;
  name: string;
  verifyUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "verification", ...opts });
  if (dispatched) return;

  const body = `
    <p>Hello ${opts.name},</p>
    <p>Thank you for creating an account with <strong>${APP_NAME}</strong>. To complete your registration and start using our service, please verify your email address.</p>
    <p style="font-size:13px;color:#6B7280;">This link expires in <strong>24 hours</strong>. If you did not create an account, you can safely ignore this email.</p>
  `;
  const html = buildEmailHtml({
    preheader:
      "Verify your email address to activate your Talk to My Lawyer account.",
    title: "Verify Your Email Address 🔒",
    body,
    ctaText: "Verify My Email Address",
    ctaUrl: opts.verifyUrl,
    accentColor: "#2563EB",
    footerNote: `You received this email because you signed up for ${APP_NAME}. If this wasn't you, please ignore this email.`,
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Please verify your email address`,
    html,
    text: buildPlainText({
      title: "Verify Your Email Address",
      body: `Hello ${opts.name}, please verify your email address to activate your account. This link expires in 24 hours.`,
      ctaText: "Verify Email",
      ctaUrl: opts.verifyUrl,
    }),
  });
}

/** Send welcome email after successful email verification */
export async function sendWelcomeEmail(opts: {
  to: string;
  name: string;
  dashboardUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "welcome", ...opts });
  if (dispatched) return;

  const body = `
    <p>Hello ${opts.name},</p>
    <p>Your email has been verified and your account is now fully active. Welcome to <strong>${APP_NAME}</strong>!</p>
    <p>You can now:</p>
    <ul style="margin:8px 0;padding-left:20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.8;">
      <li>Submit letter requests for attorney review</li>
      <li>Track the status of your letters in real time</li>
      <li>Download approved letters as PDFs</li>
    </ul>
    <p>Get started by creating your first letter request.</p>
  `;
  const html = buildEmailHtml({
    preheader: "Your account is verified and ready to use.",
    title: "Welcome to Talk to My Lawyer! 🎉",
    body,
    ctaText: "Go to My Dashboard",
    ctaUrl: opts.dashboardUrl,
    accentColor: "#059669",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Welcome — your account is ready!`,
    html,
    text: buildPlainText({
      title: "Welcome to Talk to My Lawyer!",
      body: `Hello ${opts.name}, your email has been verified and your account is now active. Start creating legal letters at:`,
      ctaText: "Go to Dashboard",
      ctaUrl: opts.dashboardUrl,
    }),
  });
}

/**
 * 48-hour reminder: subscriber has a draft waiting but hasn't paid for attorney review.
 * Sent once per letter (idempotency enforced by draft_reminder_sent_at column).
 */
export async function sendDraftReminderEmail(opts: {
  to: string;
  name: string;
  subject: string;
  letterId: number;
  appUrl: string;
  letterType?: string;
  jurisdictionState?: string;
  hoursWaiting?: number;
}) {
  const dispatched = await dispatchToWorker({ type: "draft_reminder", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/letters/${opts.letterId}`;
  const letterTypeLabel = opts.letterType
    ? opts.letterType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Legal Letter";
  const jurisdictionLine = opts.jurisdictionState
    ? `<p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${opts.jurisdictionState}</p>`
    : "";
  const hoursLabel = opts.hoursWaiting
    ? `${Math.round(opts.hoursWaiting)} hours`
    : "48 hours";

  const body = `
    <p>Hello ${opts.name},</p>
    <p>Your legal letter draft has been ready for <strong>${hoursLabel}</strong> and is still waiting for attorney review. Don't let your work go to waste — submit it today for just <strong>$299</strong>.</p>

    <!-- Letter summary card — red-tinted for urgency -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 10px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#9A3412;font-weight:700;">⏰ Your Draft Is Still Waiting</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${opts.subject}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${letterTypeLabel}</p>
        ${jurisdictionLine}
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${opts.letterId}</p>
      </td></tr>
    </table>

    <!-- Why act now -->
    <p style="margin:0 0 12px;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:700;color:#0F2744;">Why submit for attorney review now?</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">⚖️</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>Legal matters are time-sensitive</strong> — deadlines and statutes of limitations can affect your case
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">✏️</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>A licensed attorney reviews every word</strong> — ensuring your letter is accurate and professionally formatted
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">📑</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;">
          <strong>PDF ready to send</strong> — once approved, download and use your letter immediately
        </td>
      </tr>
    </table>

    <!-- Pricing callout -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;margin:0 0 8px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#1D4ED8;">
          <strong>Attorney review — $299 one-time payment.</strong> No subscription required. Your draft is ready and waiting.
        </p>
      </td></tr>
    </table>
  `;

  const html = buildEmailHtml({
    preheader: `Your letter draft has been waiting ${hoursLabel} — submit for attorney review today.`,
    title: "Your Draft Is Still Waiting for Review",
    body,
    ctaText: "Submit for Attorney Review — $299",
    ctaUrl,
    accentColor: "#EA580C",
  });

  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Reminder: your letter draft is ready — submit for attorney review`,
    html,
    text: buildPlainText({
      title: "Your Draft Is Still Waiting for Review",
      body: `Hello ${opts.name},\n\nYour letter draft "${opts.subject}" (Letter #${opts.letterId}) has been ready for ${hoursLabel} and is still waiting for attorney review.\n\nLegal matters are time-sensitive. Submit for attorney review today for $299 — a licensed attorney will review, edit, and approve your letter.\n\nView your draft at: ${ctaUrl}`,
      ctaText: "Submit for Attorney Review — $299",
      ctaUrl,
    }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE & ATTORNEY EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Welcome email for new employees — includes discount code info and affiliate dashboard link.
 */
export async function sendEmployeeWelcomeEmail(opts: {
  to: string;
  name: string;
  discountCode?: string;
  dashboardUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "employee_welcome", ...opts });
  if (dispatched) return;

  const codeBlock = opts.discountCode
    ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#EFF6FF;border-radius:8px;margin:16px 0;border:1px solid #BFDBFE;">
        <tr><td style="padding:16px;">
          <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#1E40AF;font-weight:700;">Your Affiliate Discount Code</p>
          <p style="margin:0;font-family:'Courier New',monospace;font-size:20px;color:#1D4ED8;font-weight:700;letter-spacing:2px;">${opts.discountCode}</p>
          <p style="margin:8px 0 0;font-family:Inter,Arial,sans-serif;font-size:12px;color:#6B7280;">Share this code with clients to earn a 5% commission on every subscription payment.</p>
        </td></tr>
      </table>`
    : "";
  const body = `
    <p>Hello ${opts.name},</p>
    <p>Welcome to the <strong>${APP_NAME}</strong> team! Your employee account has been verified and is now active.</p>
    ${codeBlock}
    <p>As an employee, you can:</p>
    <ul style="margin:8px 0;padding-left:20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.8;">
      <li>Share your personal discount code with potential clients</li>
      <li>Track referrals and see who signed up using your code</li>
      <li>Monitor your commission earnings in real time</li>
      <li>Access the employee dashboard for operational support</li>
    </ul>
    <p>Get started by visiting your employee dashboard below.</p>
  `;
  const html = buildEmailHtml({
    preheader: "Your employee account is active.",
    title: "Welcome to the Team!",
    body,
    ctaText: "Go to Employee Dashboard",
    ctaUrl: opts.dashboardUrl,
    accentColor: "#2563EB",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Welcome to the team!`,
    html,
    text: buildPlainText({
      title: "Welcome to the Team!",
      body: `Hello ${opts.name}, your employee account is now active.${opts.discountCode ? ` Your affiliate discount code is: ${opts.discountCode}.` : ""} Visit your dashboard to get started.`,
      ctaText: "Go to Employee Dashboard",
      ctaUrl: opts.dashboardUrl,
    }),
  });
}

/**
 * Welcome email for new attorneys — includes review center info and attorney dashboard link.
 */
export async function sendAttorneyWelcomeEmail(opts: {
  to: string;
  name: string;
  dashboardUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "attorney_welcome", ...opts });
  if (dispatched) return;

  const body = `
    <p>Hello ${opts.name},</p>
    <p>Welcome to <strong>${APP_NAME}</strong>. Your attorney account has been verified and you now have access to the <strong>Letter Review Center</strong>.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F3FF;border-radius:8px;margin:16px 0;border:1px solid #DDD6FE;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#5B21B6;font-weight:700;">Letter Review Center</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#6B7280;">
          The Review Center is where you will claim, edit, and approve or reject AI-generated legal letter drafts. Each letter includes jurisdiction research, a structured draft, and the subscriber intake details.
        </p>
      </td></tr>
    </table>
    <p>As a reviewing attorney, you can:</p>
    <ul style="margin:8px 0;padding-left:20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.8;">
      <li>Claim letters from the review queue</li>
      <li>Edit AI-generated drafts using the in-app editor</li>
      <li>Approve, reject, or request changes with detailed notes</li>
      <li>View full audit trails and letter history</li>
    </ul>
    <p>You will receive email notifications when new letters are ready for review.</p>
  `;
  const html = buildEmailHtml({
    preheader: "Your attorney account is active.",
    title: "Welcome, Counselor!",
    body,
    ctaText: "Go to Attorney Dashboard",
    ctaUrl: opts.dashboardUrl,
    accentColor: "#7C3AED",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Welcome — your attorney account is ready!`,
    html,
    text: buildPlainText({
      title: "Welcome to Talk to My Lawyer!",
      body: `Hello ${opts.name}, your attorney account is now active. You have access to the Letter Review Center where you can claim, edit, and approve legal letter drafts.`,
      ctaText: "Go to Attorney Dashboard",
      ctaUrl: opts.dashboardUrl,
    }),
  });
}

/**
 * Notify an attorney when a letter has been assigned/claimed to them for review.
 */
export async function sendReviewAssignedEmail(opts: {
  to: string;
  name: string;
  letterSubject: string;
  letterId: number;
  letterType: string;
  jurisdiction: string;
  subscriberName: string;
  appUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "review_assigned", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/review/${opts.letterId}`;
  const body = `
    <p>Hello ${opts.name},</p>
    <p>A letter has been assigned to you for review. Please review it at your earliest convenience.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F3FF;border-radius:8px;margin:16px 0;border:1px solid #DDD6FE;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#5B21B6;font-weight:700;">Letter Details</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Subject:</strong> ${opts.letterSubject}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${opts.letterType}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${opts.jurisdiction}</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Client:</strong> ${opts.subscriberName}</p>
      </td></tr>
    </table>
    <p style="font-size:13px;color:#6B7280;">Review typically involves reading the AI draft, making edits as needed, and approving or rejecting the letter.</p>
  `;
  const html = buildEmailHtml({
    preheader: `Letter #${opts.letterId} has been assigned to you for review.`,
    title: "Letter Assigned for Review",
    body,
    ctaText: "Open Letter Review",
    ctaUrl,
    accentColor: "#7C3AED",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Letter assigned to you: ${opts.letterSubject} (#${opts.letterId})`,
    html,
    text: buildPlainText({
      title: "Letter Assigned for Review",
      body: `Hello ${opts.name}, letter #${opts.letterId} "${opts.letterSubject}" (${opts.letterType}, ${opts.jurisdiction}) from ${opts.subscriberName} has been assigned to you.`,
      ctaText: "Open Letter Review",
      ctaUrl,
    }),
  });
}

/**
 * Confirm to the attorney that their review action (approve/reject/needs_changes) was recorded.
 */
export async function sendReviewCompletedEmail(opts: {
  to: string;
  name: string;
  letterSubject: string;
  letterId: number;
  action: "approved" | "rejected" | "needs_changes";
  appUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "review_completed", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/review/${opts.letterId}`;
  const actionLabels: Record<string, { label: string; color: string }> = {
    approved: { label: "Approved", color: "#059669" },
    rejected: { label: "Rejected", color: "#DC2626" },
    needs_changes: { label: "Changes Requested", color: "#D97706" },
  };
  const { label, color } = actionLabels[opts.action] || actionLabels.approved;
  const body = `
    <p>Hello ${opts.name},</p>
    <p>Your review action has been recorded for the following letter:</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F9FAFB;border-radius:8px;margin:16px 0;border:1px solid #E5E7EB;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${opts.letterSubject} (#${opts.letterId})</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:${color};font-weight:700;">Status: ${label}</p>
      </td></tr>
    </table>
    <p style="font-size:13px;color:#6B7280;">The subscriber has been notified of your decision. You can view the full audit trail in the Review Center.</p>
  `;
  const html = buildEmailHtml({
    preheader: `Letter #${opts.letterId} review ${label.toLowerCase()}.`,
    title: `Review ${label}`,
    body,
    ctaText: "View Letter Details",
    ctaUrl,
    accentColor: color,
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Review recorded: ${opts.letterSubject} — ${label}`,
    html,
    text: buildPlainText({
      title: `Review ${label}`,
      body: `Hello ${opts.name}, your review action (${label}) has been recorded for letter "${opts.letterSubject}" (#${opts.letterId}). The subscriber has been notified.`,
      ctaText: "View Letter",
      ctaUrl,
    }),
  });
}

/**
 * Notify an employee when one of their referrals converts (subscription payment with their discount code).
 */
export async function sendEmployeeCommissionEmail(opts: {
  to: string;
  name: string;
  subscriberName: string;
  planName: string;
  commissionAmount: string;
  discountCode: string;
  dashboardUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "employee_commission", ...opts });
  if (dispatched) return;

  const body = `
    <p>Hello ${opts.name},</p>
    <p>Great news — a client you referred just made a payment using your discount code!</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#ECFDF5;border-radius:8px;margin:16px 0;border:1px solid #A7F3D0;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#047857;font-weight:700;">Commission Earned</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Client:</strong> ${opts.subscriberName}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Plan:</strong> ${opts.planName}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Discount Code Used:</strong> ${opts.discountCode}</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:20px;color:#059669;font-weight:700;">+${opts.commissionAmount}</p>
      </td></tr>
    </table>
    <p>Your commission has been recorded and is visible in your earnings dashboard. Keep sharing your code to earn more!</p>
  `;
  const html = buildEmailHtml({
    preheader: `You earned ${opts.commissionAmount} in commission!`,
    title: "Commission Earned!",
    body,
    ctaText: "View My Earnings",
    ctaUrl: opts.dashboardUrl,
    accentColor: "#059669",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Commission earned: ${opts.commissionAmount} from ${opts.subscriberName}`,
    html,
    text: buildPlainText({
      title: "Commission Earned!",
      body: `Hello ${opts.name}, a client (${opts.subscriberName}) just paid for the ${opts.planName} plan using your discount code (${opts.discountCode}). You earned ${opts.commissionAmount} in commission.`,
      ctaText: "View My Earnings",
      ctaUrl: opts.dashboardUrl,
    }),
  });
}

export async function sendPayoutCompletedEmail(opts: {
  to: string;
  name: string;
  amount: string;
  paymentMethod: string;
}) {
  const dispatched = await dispatchToWorker({ type: "payout_completed", ...opts });
  if (dispatched) return;

  const methodLabel = opts.paymentMethod.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const body = `
    <p>Hello ${opts.name},</p>
    <p>Your payout request has been <strong style="color:#059669;">approved</strong> and processed.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#ECFDF5;border-radius:8px;margin:16px 0;border:1px solid #A7F3D0;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#047857;font-weight:700;">Payout Approved</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Amount:</strong> ${opts.amount}</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Method:</strong> ${methodLabel}</p>
      </td></tr>
    </table>
    <p>The funds will be sent to you via your selected payment method. If you have any questions, please contact your administrator.</p>
  `;
  const html = buildEmailHtml({
    preheader: `Your payout of ${opts.amount} has been approved!`,
    title: "Payout Approved",
    body,
    accentColor: "#059669",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Payout approved: ${opts.amount}`,
    html,
    text: buildPlainText({
      title: "Payout Approved",
      body: `Hello ${opts.name}, your payout request of ${opts.amount} via ${methodLabel} has been approved and processed.`,
    }),
  });
}

export async function sendPayoutRejectedEmail(opts: {
  to: string;
  name: string;
  amount: string;
  reason: string;
}) {
  const dispatched = await dispatchToWorker({ type: "payout_rejected", ...opts });
  if (dispatched) return;

  const body = `
    <p>Hello ${opts.name},</p>
    <p>Unfortunately, your payout request has been <strong style="color:#DC2626;">rejected</strong>.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FEF2F2;border-radius:8px;margin:16px 0;border:1px solid #FECACA;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#DC2626;font-weight:700;">Payout Rejected</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Amount Requested:</strong> ${opts.amount}</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Reason:</strong> ${opts.reason}</p>
      </td></tr>
    </table>
    <p>Your pending balance has not been affected. If you believe this was in error, please contact your administrator.</p>
  `;
  const html = buildEmailHtml({
    preheader: `Your payout request of ${opts.amount} was rejected`,
    title: "Payout Rejected",
    body,
    accentColor: "#DC2626",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Payout rejected: ${opts.amount}`,
    html,
    text: buildPlainText({
      title: "Payout Rejected",
      body: `Hello ${opts.name}, your payout request of ${opts.amount} was rejected. Reason: ${opts.reason}. Your pending balance has not been affected.`,
    }),
  });
}

export async function sendPaymentFailedEmail(opts: {
  to: string;
  name: string;
  letterSubject?: string;
  billingUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "payment_failed", ...opts });
  if (dispatched) return;

  const body = `
    <p>Hello ${opts.name},</p>
    <p>We were unable to process your most recent payment${opts.letterSubject ? ` for "<strong>${opts.letterSubject}</strong>"` : ""}.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FEF2F2;border-radius:8px;margin:16px 0;border:1px solid #FECACA;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#DC2626;font-weight:700;">Payment Failed</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;">Please update your payment method to continue using ${APP_NAME}. If your payment method is not updated, your subscription may be canceled.</p>
      </td></tr>
    </table>
    <p>If you believe this is an error, please check with your bank or try a different payment method.</p>
  `;
  const html = buildEmailHtml({
    preheader: "Your payment could not be processed. Please update your payment method.",
    title: "Payment Failed",
    body,
    ctaText: "Update Payment Method",
    ctaUrl: opts.billingUrl,
    accentColor: "#DC2626",
  });
  await sendWithRetry({
    to: opts.to,
    subject: `[${APP_NAME}] Payment failed — please update your payment method`,
    html,
    text: buildPlainText({
      title: "Payment Failed",
      body: `Hello ${opts.name}, your payment${opts.letterSubject ? ` for "${opts.letterSubject}"` : ""} could not be processed. Please update your payment method at: ${opts.billingUrl}`,
      ctaText: "Update Payment Method",
      ctaUrl: opts.billingUrl,
    }),
  });
}

export async function sendAdminVerificationCodeEmail(opts: {
  to: string;
  name: string;
  code: string;
}) {
  console.log(`[Email] Sending admin 2FA code to=${opts.to}, from=${FROM}`);

  const dispatched = await dispatchToWorker({ type: "admin_verification_code", ...opts });
  if (dispatched) {
    console.log(`[Email] Admin 2FA code dispatched to Worker for to=${opts.to}`);
    return;
  }

  const codeDisplay = opts.code.split("").join(" ");
  const html = buildEmailHtml({
    preheader: `Your admin verification code: ${opts.code}`,
    title: "Admin Verification Code",
    body: `
      <p style="margin:0 0 16px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;">
        Hello ${opts.name},
      </p>
      <p style="margin:0 0 16px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;">
        A login attempt was made to your admin account. Enter the code below to verify your identity:
      </p>
      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;padding:16px 32px;background:#F1F5F9;border-radius:12px;border:2px solid #E2E8F0;">
          <span style="font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:${BRAND_DARK};">
            ${codeDisplay}
          </span>
        </div>
      </div>
      <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#6B7280;">
        This code expires in <strong>10 minutes</strong>.
      </p>
      <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#6B7280;">
        If you did not attempt to sign in, please secure your account immediately.
      </p>
    `,
    footerNote: "This is an automated security notification. Do not share this code with anyone.",
    accentColor: "#DC2626",
  });
  try {
    await sendWithRetry({
      to: opts.to,
      subject: `[${APP_NAME}] Admin Verification Code: ${opts.code}`,
      html,
      text: buildPlainText({
        title: "Admin Verification Code",
        body: `Hello ${opts.name}, your admin verification code is: ${opts.code}. This code expires in 10 minutes. If you did not attempt to sign in, please secure your account immediately.`,
      }),
    });
    console.log(`[Email] Admin 2FA code sent successfully to=${opts.to}`);
  } catch (err) {
    console.error(`[Email] Admin 2FA code FAILED to=${opts.to}, from=${FROM}, error:`, err);
    throw err;
  }
}

export async function sendAttorneyInvitationEmail(opts: {
  to: string;
  name: string;
  setPasswordUrl: string;
  invitedByName?: string;
}) {
  const dispatched = await dispatchToWorker({ type: "attorney_invitation", ...opts });
  if (dispatched) return;

  const body = `
    <p>Hello ${opts.name},</p>
    <p>You have been invited to join <strong>${APP_NAME}</strong> as a <strong>Reviewing Attorney</strong>${opts.invitedByName ? ` by ${opts.invitedByName}` : ""}.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F3FF;border-radius:8px;margin:16px 0;border:1px solid #DDD6FE;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#5B21B6;font-weight:700;">What is the Letter Review Center?</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#6B7280;">
          The Review Center is where you will claim, edit, and approve or reject AI-generated legal letter drafts. Each letter includes jurisdiction research, a structured draft, and the subscriber intake details.
        </p>
      </td></tr>
    </table>
    <p>As a reviewing attorney, you will be able to:</p>
    <ul style="margin:8px 0;padding-left:20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.8;">
      <li>Claim letters from the review queue</li>
      <li>Edit AI-generated drafts using the in-app editor</li>
      <li>Approve, reject, or request changes with detailed notes</li>
      <li>View full audit trails and letter history</li>
    </ul>
    <p>To get started, click the button below to set your password and access your attorney dashboard.</p>
  `;
  const html = buildEmailHtml({
    preheader: "You've been invited as a reviewing attorney.",
    title: "Attorney Invitation",
    body,
    ctaText: "Set Your Password",
    ctaUrl: opts.setPasswordUrl,
    accentColor: "#7C3AED",
  });
  await sendWithRetry({
    to: opts.to,
    subject: `[${APP_NAME}] You've been invited as a Reviewing Attorney`,
    html,
    text: buildPlainText({
      title: "Attorney Invitation",
      body: `Hello ${opts.name}, you have been invited to join ${APP_NAME} as a Reviewing Attorney. Set your password to get started and access the Letter Review Center.`,
      ctaText: "Set Your Password",
      ctaUrl: opts.setPasswordUrl,
    }),
  });
}
