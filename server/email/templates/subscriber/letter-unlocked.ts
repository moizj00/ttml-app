import { dispatchToWorker, buildEmailHtml, buildPlainText, sendWithRetry, APP_NAME } from "../../core";

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
      body: `Hello ${opts.name}, payment confirmed! Your letter "${opts.subject}" (#${opts.letterId}) is now in attorney review. You'll receive an email when it's approved. Track at: ${ctaUrl}`,
      ctaText: "Track Review Status",
      ctaUrl,
    }),
  });
}
