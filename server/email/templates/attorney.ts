/**
 * Attorney and review-team email templates.
 * Covers: new review needed, client revision request, review assigned, review completed.
 */

import { dispatchToWorker, buildEmailHtml, buildPlainText, sendEmail, sendWithRetry, APP_NAME } from "../core";

/** Notify attorney/employee when a new letter is ready for review */
export async function sendNewReviewNeededEmail(opts: {
  to: string;
  name: string;
  letterSubject: string;
  letterId: number;
  letterType: string;
  jurisdiction: string;
  appUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "new_review_needed", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/review/${opts.letterId}`;
  const body = `
    <p>Hello ${opts.name},</p>
    <p>A new letter request is ready for your review in the attorney queue.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F9FAFB;border-radius:8px;margin:16px 0;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;"><strong>Subject:</strong> ${opts.letterSubject}</p>
        <p style="margin:0 0 8px;"><strong>Type:</strong> ${opts.letterType}</p>
        <p style="margin:0;"><strong>Jurisdiction:</strong> ${opts.jurisdiction}</p>
      </td></tr>
    </table>
    <p>Please log in to claim and review this letter at your earliest convenience.</p>
  `;
  const html = buildEmailHtml({
    preheader: `A new letter is waiting for your review.`,
    title: "New Letter Ready for Review",
    body,
    ctaText: "Review Letter",
    ctaUrl,
    accentColor: "#7C3AED",
  });
  await sendWithRetry({
    to: opts.to,
    subject: `[${APP_NAME}] New letter ready for review: ${opts.letterSubject}`,
    html,
    text: buildPlainText({
      title: "New Letter Ready for Review",
      body: `Hello ${opts.name}, a new letter "${opts.letterSubject}" (${opts.letterType}, ${opts.jurisdiction}) is ready for review. Claim it at: ${ctaUrl}`,
      ctaText: "Review Letter",
      ctaUrl,
    }),
  });
}

/** Notify attorney when subscriber requests revisions on an approved letter */
export async function sendClientRevisionRequestEmail(opts: {
  to: string;
  name: string;
  letterSubject: string;
  letterId: number;
  subscriberNotes: string;
  appUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "client_revision_request", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/review/${opts.letterId}`;
  const body = `
    <p>Hello ${opts.name},</p>
    <p>A subscriber has reviewed your approved letter and is <strong>requesting revisions</strong> before they will approve delivery.</p>
    <p><strong>Letter:</strong> ${opts.letterSubject}</p>
    <blockquote style="margin:16px 0;padding:12px 16px;background:#F3E8FF;border-left:4px solid #8B5CF6;border-radius:4px;color:#5B21B6;">${opts.subscriberNotes}</blockquote>
    <p>The letter has been returned to the review queue. Please review the subscriber's feedback and make the requested changes.</p>
  `;
  const html = buildEmailHtml({
    preheader: `A subscriber has requested revisions on letter "${opts.letterSubject}".`,
    title: "Client Revision Requested",
    body,
    ctaText: "Review Letter",
    ctaUrl,
    accentColor: "#7C3AED",
  });
  await sendWithRetry({
    to: opts.to,
    subject: `[${APP_NAME}] Client revision requested: ${opts.letterSubject}`,
    html,
    text: buildPlainText({
      title: "Client Revision Requested",
      body: `Hello ${opts.name}, a subscriber has requested revisions on "${opts.letterSubject}". Notes: ${opts.subscriberNotes}. Review at: ${ctaUrl}`,
      ctaText: "Review Letter",
      ctaUrl,
    }),
  });
}

/**
 * Notify an attorney when a letter has been assigned/claimed to them for review.
 */
export async function sendReviewAssignedEmail(opts: {
  to: string;
  name: string;
  letterSubject: string;
  letterId: number;
  letterType: string;
  jurisdiction: string;
  subscriberName: string;
  appUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "review_assigned", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/review/${opts.letterId}`;
  const body = `
    <p>Hello ${opts.name},</p>
    <p>A letter has been assigned to you for review. Please review it at your earliest convenience.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F3FF;border-radius:8px;margin:16px 0;border:1px solid #DDD6FE;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#5B21B6;font-weight:700;">Letter Details</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Subject:</strong> ${opts.letterSubject}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${opts.letterType}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${opts.jurisdiction}</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Client:</strong> ${opts.subscriberName}</p>
      </td></tr>
    </table>
    <p style="font-size:13px;color:#6B7280;">Review typically involves reading the AI draft, making edits as needed, and approving or rejecting the letter.</p>
  `;
  const html = buildEmailHtml({
    preheader: `Letter #${opts.letterId} has been assigned to you for review.`,
    title: "Letter Assigned for Review",
    body,
    ctaText: "Open Letter Review",
    ctaUrl,
    accentColor: "#7C3AED",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Letter assigned to you: ${opts.letterSubject} (#${opts.letterId})`,
    html,
    text: buildPlainText({
      title: "Letter Assigned for Review",
      body: `Hello ${opts.name}, letter #${opts.letterId} "${opts.letterSubject}" (${opts.letterType}, ${opts.jurisdiction}) from ${opts.subscriberName} has been assigned to you.`,
      ctaText: "Open Letter Review",
      ctaUrl,
    }),
  });
}

/**
 * Confirm to the attorney that their review action was recorded.
 */
export async function sendReviewCompletedEmail(opts: {
  to: string;
  name: string;
  letterSubject: string;
  letterId: number;
  action: "approved" | "rejected" | "needs_changes";
  appUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "review_completed", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/review/${opts.letterId}`;
  const actionLabels: Record<string, { label: string; color: string }> = {
    approved: { label: "Approved", color: "#059669" },
    rejected: { label: "Rejected", color: "#DC2626" },
    needs_changes: { label: "Changes Requested", color: "#D97706" },
  };
  const { label, color } = actionLabels[opts.action] || actionLabels.approved;
  const body = `
    <p>Hello ${opts.name},</p>
    <p>Your review action has been recorded for the following letter:</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F9FAFB;border-radius:8px;margin:16px 0;border:1px solid #E5E7EB;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${opts.letterSubject} (#${opts.letterId})</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:${color};font-weight:700;">Status: ${label}</p>
      </td></tr>
    </table>
    <p style="font-size:13px;color:#6B7280;">The subscriber has been notified of your decision. You can view the full audit trail in the Review Center.</p>
  `;
  const html = buildEmailHtml({
    preheader: `Letter #${opts.letterId} review ${label.toLowerCase()}.`,
    title: `Review ${label}`,
    body,
    ctaText: "View Letter Details",
    ctaUrl,
    accentColor: color,
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Review recorded: ${opts.letterSubject} — ${label}`,
    html,
    text: buildPlainText({
      title: `Review ${label}`,
      body: `Hello ${opts.name}, your review action (${label}) has been recorded for letter "${opts.letterSubject}" (#${opts.letterId}). The subscriber has been notified.`,
      ctaText: "View Letter",
      ctaUrl,
    }),
  });
}
