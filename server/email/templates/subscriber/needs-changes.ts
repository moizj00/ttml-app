import { dispatchToWorker, buildEmailHtml, buildPlainText, sendEmail, APP_NAME } from "../../core";

/** Notify subscriber when their letter needs changes */
export async function sendNeedsChangesEmail(opts: {
  to: string;
  name: string;
  subject: string;
  letterId: number;
  attorneyNote?: string;
  appUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "needs_changes", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/letters/${opts.letterId}`;
  const noteBlock = opts.attorneyNote
    ? `<blockquote style="margin:16px 0;padding:12px 16px;background:#FEF3C7;border-left:4px solid #F59E0B;border-radius:4px;font-style:italic;color:#92400E;">${opts.attorneyNote}</blockquote>`
    : "";
  const body = `
    <p>Hello ${opts.name},</p>
    <p>Our attorney has reviewed your letter request and has requested some changes before it can be approved.</p>
    <p><strong>Letter:</strong> ${opts.subject}</p>
    ${noteBlock}
    <p>Please review the feedback and update your request accordingly.</p>
  `;
  const html = buildEmailHtml({
    preheader: "Your letter needs some changes before it can be approved.",
    title: "Changes Requested for Your Letter",
    body,
    ctaText: "View Feedback & Update",
    ctaUrl,
    accentColor: "#D97706",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Changes requested for your letter`,
    html,
    text: buildPlainText({
      title: "Changes Requested",
      body: `Hello ${opts.name}, your letter "${opts.subject}" needs changes. ${opts.attorneyNote ?? ""} View at: ${ctaUrl}`,
      ctaText: "View Letter",
      ctaUrl,
    }),
  });
}
