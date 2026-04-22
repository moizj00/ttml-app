import { dispatchToWorker, buildEmailHtml, buildPlainText, sendWithRetry, APP_NAME } from "../../core";

/**
 * Notify subscriber that their FIRST letter's free-preview draft is now
 * available to view. This email is sent by the `free-preview-scheduler` cron
 * 24 hours after the subscriber submits their first letter via the free-trial
 * path.
 *
 * The draft is NOT attorney-reviewed. Clicking the CTA opens the letter page
 * where the full ai_draft is rendered with a DRAFT watermark and disabled
 * text selection. The only action available there is "Submit For Attorney
 * Review", which routes the subscriber to the subscription flow.
 */
export async function sendFreePreviewReadyEmail(opts: {
  to: string;
  name: string;
  subject: string;
  letterId: number;
  appUrl: string;
  letterType?: string;
  jurisdictionState?: string;
}) {
  const dispatched = await dispatchToWorker({ type: "free_preview_ready", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/letters/${opts.letterId}?preview=1`;
  const letterTypeLabel = opts.letterType
    ? opts.letterType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Legal Letter";
  const jurisdictionLine = opts.jurisdictionState
    ? `<p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${opts.jurisdictionState}</p>`
    : "";

  const body = `
    <p>Hello ${opts.name},</p>
    <p>Your first letter draft is ready to preview. This is a complimentary first look — you can read the full draft, then decide whether to submit it for licensed attorney review.</p>

    <!-- Letter summary card -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 10px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#92400E;font-weight:700;">📄 Draft Preview — Not Yet Attorney Reviewed</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${opts.subject}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${letterTypeLabel}</p>
        ${jurisdictionLine}
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${opts.letterId}</p>
      </td></tr>
    </table>

    <!-- What you'll see vs. what attorney review adds -->
    <p style="margin:0 0 12px;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:700;color:#0F2744;">What you get in the preview:</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:16px;">
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">📝</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>The full draft</strong> — read every word before deciding how to proceed
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">🔍</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>No attorney review yet</strong> — this draft has not been reviewed, edited, or approved by a licensed attorney
        </td>
      </tr>
    </table>

    <p style="margin:0 0 12px;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:700;color:#0F2744;">Ready to send it? Subscribe to unlock attorney review:</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">⚖️</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>Licensed attorney review</strong> — reviewed, edited, and approved before you send it
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">📑</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>Professional PDF</strong> delivered to your account, formatted and ready to send
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">🔒</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;">
          <strong>Jurisdiction-specific</strong> — researched and drafted for your state
        </td>
      </tr>
    </table>

    <!-- Disclaimer -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;margin:0 0 8px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#1D4ED8;">
          The preview draft is provided as-is and has not been reviewed by an attorney. Do not rely on it as legal advice or send it without attorney review.
        </p>
      </td></tr>
    </table>
  `;

  const html = buildEmailHtml({
    preheader: `Your first letter draft is ready to preview — full draft, not yet attorney-reviewed.`,
    title: "Your Draft Is Ready to Preview",
    body,
    ctaText: "Preview My Draft",
    ctaUrl,
    accentColor: "#D97706",
  });

  // Use sendWithRetry (throws on exhausted retries) so the atomic-claim rollback
  // in freePreviewEmailCron.dispatchFreePreviewIfReady actually fires when Resend
  // is flaky — sendEmail is fire-and-forget and would swallow the error.
  await sendWithRetry({
    to: opts.to,
    subject: `[${APP_NAME}] Your first letter draft is ready to preview`,
    html,
    text: buildPlainText({
      title: "Your Draft Is Ready to Preview",
      body:
        `Hello ${opts.name},\n\n` +
        `Your first letter draft "${opts.subject}" (Letter #${opts.letterId}) is ready to preview.\n\n` +
        `This draft has not been reviewed by an attorney. You can read the full draft, then decide whether to submit it for licensed attorney review.\n\n` +
        `To submit it for attorney review, you'll be asked to choose a subscription plan.\n\n` +
        `Attorney review includes:\n- Licensed attorney review, edits, and approval\n- Professional PDF delivered to your account\n- Jurisdiction-specific\n\n` +
        `Click below to preview your draft.`,
      ctaText: "Preview My Draft",
      ctaUrl,
    }),
  });
}
