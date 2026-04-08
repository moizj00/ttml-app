import { dispatchToWorker, buildEmailHtml, buildPlainText, sendEmail, APP_NAME } from "../../core";

/** Send email verification link to new user */
export async function sendVerificationEmail(opts: {
  to: string;
  name: string;
  verifyUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "verification", ...opts });
  if (dispatched) return;

  const body = `
    <p>Hello ${opts.name},</p>
    <p>Thank you for creating an account with <strong>${APP_NAME}</strong>. To complete your registration and start using our service, please verify your email address.</p>
    <p style="font-size:13px;color:#6B7280;">This link expires in <strong>24 hours</strong>. If you did not create an account, you can safely ignore this email.</p>
  `;
  const html = buildEmailHtml({
    preheader:
      "Verify your email address to activate your Talk to My Lawyer account.",
    title: "Verify Your Email Address 🔒",
    body,
    ctaText: "Verify My Email Address",
    ctaUrl: opts.verifyUrl,
    accentColor: "#2563EB",
    footerNote: `You received this email because you signed up for ${APP_NAME}. If this wasn't you, please ignore this email.`,
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Please verify your email address`,
    html,
    text: buildPlainText({
      title: "Verify Your Email Address",
      body: `Hello ${opts.name}, please verify your email address to activate your account. This link expires in 24 hours.`,
      ctaText: "Verify Email",
      ctaUrl: opts.verifyUrl,
    }),
  });
}
