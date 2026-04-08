/**
 * Admin email templates.
 * Covers: pipeline job failure alerts, generic admin alerts, 2FA verification codes.
 */

import { dispatchToWorker, buildEmailHtml, buildPlainText, sendEmail, sendWithRetry, APP_NAME, BRAND_COLOR, BRAND_DARK, FROM } from "../core";
import { logger } from "../../logger";

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

/** Generic admin alert email */
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

/** Send 2FA verification code to admin during login */
export async function sendAdminVerificationCodeEmail(opts: {
  to: string;
  name: string;
  code: string;
}) {
  logger.info(`[Email] Sending admin 2FA code to=${opts.to}, from=${FROM}`);

  const dispatched = await dispatchToWorker({ type: "admin_verification_code", ...opts });
  if (dispatched) {
    logger.info(`[Email] Admin 2FA code dispatched to Worker for to=${opts.to}`);
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
    logger.info(`[Email] Admin 2FA code sent successfully to=${opts.to}`);
  } catch (err) {
    logger.error(`[Email] Admin 2FA code FAILED to=${opts.to}, from=${FROM}, error:`, err);
    throw err;
  }
}
