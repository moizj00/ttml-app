/**
 * Email infrastructure — Resend client, Worker dispatch, HTML/plain-text builders,
 * and low-level send helpers.
 *
 * This module contains no template logic. All public send*Email functions live
 * in ./templates.ts, which imports from here.
 */

import { Resend } from "resend";
import { ENV } from "../_core/env";
import { createLogger } from "../logger";

const emailLogger = createLogger({ module: "Email" });

export type EmailPayload = { type: string; [key: string]: unknown };

export const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@talk-to-my-lawyer.com";
export const APP_NAME = "Talk to My Lawyer";
export const BRAND_COLOR = "#2563EB";
export const BRAND_DARK = "#0F2744";
export const BRAND_ACCENT = "#1D4ED8";
const LOGO_URL = "https://www.talk-to-my-lawyer.com/images/logo.png";

// ─── Resend client ─────────────────────────────────────────────────────────

let _resend: Resend | null = null;
export function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

// ─── Worker Dispatch ──────────────────────────────────────────────────────

const WORKER_DISPATCH_TIMEOUT_MS = 5_000;

/**
 * Fire-and-forget dispatch to the Cloudflare Email Worker.
 * Returns true if the request was accepted (2xx), false on error.
 * Never throws — failures are logged and the caller can decide to fallback.
 */
export async function dispatchToWorker(payload: EmailPayload): Promise<boolean> {
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
      emailLogger.error({ status: res.status, type: payload.type, body }, "[Email] Worker returned error");
      return false;
    }
    emailLogger.info({ type: payload.type }, "[Email] Dispatched to Worker");
    return true;
  } catch (err) {
    clearTimeout(timer);
    const label = (err as { name?: string }).name === "AbortError" ? "timed out" : "failed";
    emailLogger.error({ err, type: payload.type, label }, "[Email] Worker dispatch failed");
    return false;
  }
}

// ─── HTML Template Builder (fallback path) ─────────────────────────────────

export function buildEmailHtml(opts: {
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

export function buildPlainText(opts: {
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

// ─── Fallback Email Sending Helpers ────────────────────────────────────────

export async function sendEmail(opts: {
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
    if (error) emailLogger.error({ err: error }, "[Email] Resend error");
  } catch (err) {
    emailLogger.error({ err }, "[Email] Failed to send");
  }
}

export async function sendWithRetry(opts: {
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
        emailLogger.error({ attempt: attempt + 1, to: opts.to, err: result.error }, "[Email] Resend API error");
        lastErr = result.error;
      } else {
        emailLogger.info({ attempt: attempt + 1, to: opts.to, id: result.data?.id ?? "unknown" }, "[Email] Sent successfully");
        return;
      }
    } catch (err) {
      lastErr = err;
      emailLogger.error({ attempt: attempt + 1, to: opts.to, err }, "[Email] Send exception");
    }
    if (attempt < delays.length) {
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
  emailLogger.error({ to: opts.to, err: lastErr }, "[Email] All retry attempts exhausted");
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
