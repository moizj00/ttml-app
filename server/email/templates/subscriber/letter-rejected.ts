import { dispatchToWorker, buildEmailHtml, buildPlainText, sendEmail, APP_NAME } from "../../core";

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
