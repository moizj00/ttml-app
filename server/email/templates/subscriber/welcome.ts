import { dispatchToWorker, buildEmailHtml, buildPlainText, sendEmail, APP_NAME } from "../../core";

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
