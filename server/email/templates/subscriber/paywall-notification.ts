import { dispatchToWorker, buildEmailHtml, buildPlainText, sendEmail, APP_NAME } from "../../core";

/**
 * Initial timed paywall notification email — sent 10–15 minutes after draft generation.
 */
export async function sendPaywallNotificationEmail(opts: {
  to: string;
  name: string;
  subject: string;
  letterId: number;
  appUrl: string;
  letterType?: string;
  jurisdictionState?: string;
  isFirstLetter?: boolean;
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

  const priceLabel = opts.isFirstLetter ? "$50" : "$299";
  const firstLetterBanner = opts.isFirstLetter
    ? `<table border="0" cellpadding="0" cellspacing="0" width="100%"
        style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;margin:0 0 16px;">
        <tr><td style="padding:14px 18px;">
          <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#065F46;font-weight:700;">
            🎉 First Letter Special — Only $50 for Attorney Review
          </p>
          <p style="margin:6px 0 0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#047857;">
            Your first letter gets attorney review for just $50 instead of $299. Or subscribe to a plan and get it included free.
          </p>
        </td></tr>
      </table>`
    : "";

  const body = `
    <p>Hello ${opts.name},</p>
    <p>Great news — your legal letter draft is ready and waiting for you. A licensed attorney is standing by to review, strengthen, and approve it.</p>

    ${firstLetterBanner}

    <!-- Letter summary card -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:10px;margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 10px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#0369A1;font-weight:700;">📋 Your Draft is Ready — Submit for Attorney Review</p>
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
          <strong>View your draft preview</strong> — click below to see your letter
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">💳</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>Submit for attorney review</strong> — ${priceLabel} one-time, or subscribe for unlimited letters
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
          <strong>Attorney review — ${priceLabel} one-time payment</strong> or subscribe for unlimited letters.
          Legal matters are time-sensitive — your draft is ready right now.
        </p>
      </td></tr>
    </table>
  `;

  const emailSubjectLine = opts.isFirstLetter
    ? `[${APP_NAME}] Your first draft is ready — get attorney review for $50`
    : `[${APP_NAME}] Your letter is ready — view and unlock for attorney review`;

  const html = buildEmailHtml({
    preheader: opts.isFirstLetter
      ? `Your first letter draft is ready — attorney review for just $50.`
      : `Your letter draft is ready — unlock it for attorney review.`,
    title: "Your Letter Draft Is Ready!",
    body,
    ctaText: "View Draft & Submit for Review",
    ctaUrl,
    accentColor: "#2563EB",
  });

  await sendEmail({
    to: opts.to,
    subject: emailSubjectLine,
    html,
    text: buildPlainText({
      title: "Your Letter Draft Is Ready!",
      body: `Hello ${opts.name},\n\nYour legal letter draft is ready and waiting for you.\n\nLetter: "${opts.subject}"\nType: ${letterTypeLabel}\nLetter ID: #${opts.letterId}\n\n${opts.isFirstLetter ? "First Letter Special: Attorney review for just $50 (normally $299). Or subscribe to get it free.\n\n" : ""}Click the link below to view a preview of your letter and submit for attorney review.\n\nOptions:\n- ${priceLabel} one-time payment for attorney review\n- Subscribe for unlimited letters\n\nA licensed attorney will review, edit, and approve your letter. Legal matters are time-sensitive — act now.`,
      ctaText: "View Draft & Submit for Review",
      ctaUrl,
    }),
  });
}
