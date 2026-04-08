import { dispatchToWorker, buildEmailHtml, buildPlainText, sendEmail, APP_NAME } from "../../core";

/** Notify subscriber when their letter enters a new processing stage */
export async function sendStatusUpdateEmail(opts: {
  to: string;
  name: string;
  subject: string;
  letterId: number;
  newStatus: string;
  appUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "status_update", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/letters/${opts.letterId}`;
  const statusMessages: Record<string, string> = {
    researching:
      "Our system is now researching the applicable laws and regulations for your jurisdiction.",
    drafting: "Your letter is being drafted based on the legal research.",
    pending_review:
      "Your letter draft is complete and has been placed in the attorney review queue.",
    under_review:
      "An attorney has claimed your letter and is currently reviewing it.",
    pipeline_failed:
      "We encountered an issue while generating your letter draft. Our team has been notified and is looking into it. You can try resubmitting your letter, or contact our support team if you need assistance.",
  };
  const message =
    statusMessages[opts.newStatus] ?? "Your letter request has been updated.";
  const body = `
    <p>Hello ${opts.name},</p>
    <p>${message}</p>
    <p><strong>Letter:</strong> ${opts.subject}</p>
    <p>You can track the progress of your letter in your account.</p>
  `;
  const html = buildEmailHtml({
    preheader: `Update on your letter: ${opts.subject}`,
    title: "Letter Status Update",
    body,
    ctaText: "Track Your Letter",
    ctaUrl,
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Update on your letter: ${opts.subject}`,
    html,
    text: buildPlainText({
      title: "Letter Status Update",
      body: `Hello ${opts.name}, ${message} Letter: "${opts.subject}". Track at: ${ctaUrl}`,
      ctaText: "Track Letter",
      ctaUrl,
    }),
  });
}
