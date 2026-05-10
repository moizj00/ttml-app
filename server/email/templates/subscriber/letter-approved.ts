import { dispatchToWorker, buildEmailHtml, buildPlainText, sendWithRetry, APP_NAME, BRAND_DARK } from "../../core";

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

  const ctaUrl = `${opts.appUrl}/dashboard?approved=${opts.letterId}`;
  const pdfLine = opts.pdfUrl
    ? `<p style="margin-top:16px;font-size:16px;">📄 <a href="${opts.pdfUrl}" style="color:${BRAND_DARK};font-weight:bold;text-decoration:underline;">Download your Attorney-Approved Lawyer Letter PDF</a></p>`
    : "";
  const body = `
    <p>Hello ${opts.name},</p>
    <p>Great news! Your legal letter has been <strong style="color:#059669;">approved</strong> by our attorney team.</p>
    <p><strong>Letter:</strong> ${opts.subject}</p>
    <p>Here is your Attorney approved Lawyer Letter:</p>
    ${pdfLine}
    <p style="margin-top:12px;">You can also view and manage your letter in your account at any time.</p>
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
