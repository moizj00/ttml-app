import { dispatchToWorker, buildEmailHtml, buildPlainText, sendEmail, APP_NAME } from "../../core";

/**
 * 48-hour reminder: subscriber has a draft waiting but hasn't paid for attorney review.
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
