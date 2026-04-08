import { dispatchToWorker, buildEmailHtml, buildPlainText, sendEmail, APP_NAME } from "../../core";

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
