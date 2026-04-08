/**
 * Email Preview — Template definitions
 */
import {
  APP_NAME,
  buildEmailHtml,
  type PreviewParams,
  type TemplateKey,
  type TemplateDefinition,
} from "./builder";

export const TEMPLATES: Record<TemplateKey, TemplateDefinition> = {
  submission: {
    label: "Submission Confirmation",
    description:
      "Sent to subscriber immediately after they submit a new letter request.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
      const letterTypeLabel = p.letterType
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const body = `
        <p>Hello ${p.name},</p>
        <p>We've received your legal letter request and our system is already working on it. You'll receive another email as soon as your draft is ready to review.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#0369A1;"><strong>📋 Submission Details</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Subject:</strong> ${p.subject}</p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${letterTypeLabel}</p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${p.state}</p>
            <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
          </td></tr>
        </table>
        <p><strong>What happens next?</strong></p>
        <ol style="margin:8px 0;padding-left:20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.8;">
          <li>Our system conducts jurisdiction-specific legal research</li>
          <li>A professional draft letter is generated</li>
          <li>You'll be notified to review and unlock your letter</li>
          <li>A licensed attorney reviews and approves your final letter</li>
        </ol>
        <p style="font-size:13px;color:#6B7280;">This typically takes 2–5 minutes. You can track progress in your account at any time.</p>
      `;
      return {
        subject: `[${APP_NAME}] Letter request received — #${p.letterId}`,
        html: buildEmailHtml({
          preheader: `We've received your letter request #${p.letterId}.`,
          title: "Your Letter Request Has Been Received ✓",
          body,
          ctaText: "Track Your Letter",
          ctaUrl,
        }),
        plain: `Your letter request #${p.letterId} ("${p.subject}") has been received. Track at: ${ctaUrl}`,
      };
    },
  },
  letter_ready: {
    label: "Letter Ready — Unlock Now",
    description:
      "Sent to subscriber when the drafting pipeline completes and the letter is in generated_locked status.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
      const body = `
        <p>Hello ${p.name},</p>
        <p>Your legal letter draft is ready! Our system has completed the research and drafting stages for your request.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#166534;"><strong>✅ Your Draft Is Ready</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${p.subject}</p>
            <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
          </td></tr>
        </table>
        <p>To send your letter for licensed attorney review and final approval, click the button below to view your draft and complete the unlock payment.</p>
        <p style="font-size:13px;color:#6B7280;">Attorney review ensures your letter is legally sound and professionally formatted before it's sent.</p>
      `;
      return {
        subject: `[${APP_NAME}] Your letter draft is ready — unlock for attorney review`,
        html: buildEmailHtml({
          preheader: "Your legal letter draft is ready to unlock and send for attorney review.",
          title: "Your Letter Draft Is Ready ✓",
          body,
          ctaText: "View & Unlock Your Letter",
          ctaUrl,
        }),
        plain: `Your letter "${p.subject}" (#${p.letterId}) is ready. Unlock at: ${ctaUrl}`,
      };
    },
  },
  unlocked: {
    label: "Letter Unlocked — In Attorney Review",
    description:
      "Sent to subscriber after they complete the unlock payment and the letter enters pending_review.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
      const body = `
        <p>Hello ${p.name},</p>
        <p>Payment confirmed! Your letter has been sent to our attorney team for review.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#166534;"><strong>✅ Payment Confirmed</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${p.subject}</p>
            <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
          </td></tr>
        </table>
        <p><strong>What happens next?</strong></p>
        <ol style="margin:8px 0;padding-left:20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.8;">
          <li>A licensed attorney will claim your letter from the review queue</li>
          <li>They will review, edit if needed, and approve your letter</li>
          <li>You'll be notified when your letter is approved and ready</li>
        </ol>
        <p style="font-size:13px;color:#6B7280;">Attorney review typically takes 1–2 business days.</p>
      `;
      return {
        subject: `[${APP_NAME}] Payment confirmed — your letter is in attorney review`,
        html: buildEmailHtml({
          preheader: "Payment confirmed — your letter is now with our attorney team.",
          title: "Payment Confirmed — Letter In Review ✓",
          body,
          ctaText: "Track Review Status",
          ctaUrl,
        }),
        plain: `Payment confirmed. Your letter "${p.subject}" (#${p.letterId}) is in attorney review. Track at: ${ctaUrl}`,
      };
    },
  },
  approved: {
    label: "Letter Approved",
    description: "Sent to subscriber when an attorney approves their letter.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
      const body = `
        <p>Hello ${p.name},</p>
        <p>Great news! A licensed attorney has reviewed and approved your legal letter. It is now ready for you to download and send.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#166534;"><strong>✅ Letter Approved</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${p.subject}</p>
            <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
          </td></tr>
        </table>
        <p>Your letter has been professionally reviewed and is ready to send. Log in to download your approved letter.</p>
      `;
      return {
        subject: `[${APP_NAME}] Your letter has been approved`,
        html: buildEmailHtml({
          preheader: "Your legal letter has been approved by a licensed attorney.",
          title: "Your Letter Has Been Approved ✓",
          body,
          ctaText: "Download Your Letter",
          ctaUrl,
        }),
        plain: `Your letter "${p.subject}" (#${p.letterId}) has been approved. Download at: ${ctaUrl}`,
      };
    },
  },
  rejected: {
    label: "Letter Rejected",
    description:
      "Sent to subscriber when an attorney cannot process their letter.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
      const reason =
        "After careful review, our attorney determined that this letter cannot be processed as submitted due to insufficient factual basis for the legal claims asserted.";
      const body = `
        <p>Hello ${p.name},</p>
        <p>We regret to inform you that your letter request could not be processed after attorney review.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#9A3412;"><strong>⚠️ Letter Not Approved</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${p.subject}</p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Reason:</strong> ${reason}</p>
          </td></tr>
        </table>
        <p>If you believe this decision was made in error, or if you have additional information to provide, please contact our support team.</p>
      `;
      return {
        subject: `[${APP_NAME}] Update on your letter request`,
        html: buildEmailHtml({
          preheader: "An update on your letter request is available.",
          title: "Update on Your Letter Request",
          body,
          ctaText: "View Details",
          ctaUrl,
        }),
        plain: `Your letter "${p.subject}" (#${p.letterId}) could not be processed. Reason: ${reason}. View at: ${ctaUrl}`,
      };
    },
  },
  needs_changes: {
    label: "Changes Requested",
    description:
      "Sent to subscriber when an attorney requests changes before approval.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
      const note =
        "Please provide the specific dates of each missed payment and the total amount owed. Also clarify whether a written lease agreement exists and attach a copy if available.";
      const body = `
        <p>Hello ${p.name},</p>
        <p>Our reviewing attorney has requested some changes to your letter before it can be approved. Please review the feedback below and update your submission.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#92400E;"><strong>📝 Attorney Feedback</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${p.subject}</p>
            <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Requested changes:</strong> ${note}</p>
          </td></tr>
        </table>
        <p>Once you've provided the requested information, our attorney will complete the review promptly.</p>
      `;
      return {
        subject: `[${APP_NAME}] Changes requested for your letter`,
        html: buildEmailHtml({
          preheader: "Your attorney has requested some changes to your letter.",
          title: "Changes Requested for Your Letter",
          body,
          ctaText: "Update Your Letter",
          ctaUrl,
        }),
        plain: `Changes requested for your letter "${p.subject}" (#${p.letterId}). Feedback: ${note}. Update at: ${ctaUrl}`,
      };
    },
  },
  new_review: {
    label: "New Review Needed (Employee)",
    description:
      "Sent to attorneys/employees when a new letter enters the review queue.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/review/${p.letterId}`;
      const letterTypeLabel = p.letterType
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const body = `
        <p>Hello ${p.name},</p>
        <p>A new legal letter is ready for attorney review in the review queue.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#1D4ED8;"><strong>📬 New Letter for Review</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Subject:</strong> ${p.subject}</p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${letterTypeLabel}</p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${p.state}</p>
            <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
          </td></tr>
        </table>
        <p>Please claim this letter in the review center to begin your review.</p>
      `;
      return {
        subject: `[${APP_NAME}] New letter ready for review: ${p.subject}`,
        html: buildEmailHtml({
          preheader: `New letter ready for review: ${p.subject}`,
          title: "New Letter Ready for Review",
          body,
          ctaText: "Claim & Review Letter",
          ctaUrl,
        }),
        plain: `New letter for review: "${p.subject}" (#${p.letterId}, ${letterTypeLabel}, ${p.state}). Claim at: ${ctaUrl}`,
      };
    },
  },
  job_failed: {
    label: "Pipeline Job Failed (Admin Alert)",
    description:
      "Sent to admins when the drafting pipeline fails for a letter.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/admin/jobs`;
      const errorMsg =
        "OpenAI API returned a 503 Service Unavailable error after 3 retry attempts. The pipeline has been halted and the letter reverted to submitted status for manual retry.";
      const body = `
        <p>Hello ${p.name},</p>
        <p>An automated pipeline job has failed and requires your attention.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FFF1F2;border:1px solid #FECDD3;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#BE123C;"><strong>🚨 Pipeline Failure Alert</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Job Type:</strong> generation_pipeline</p>
            <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Error:</strong> ${errorMsg}</p>
          </td></tr>
        </table>
        <p>Please review the failed job and retry or escalate as needed.</p>
      `;
      return {
        subject: `[${APP_NAME}] ALERT: Pipeline job failed for letter #${p.letterId}`,
        html: buildEmailHtml({
          preheader: `Pipeline job failed for letter #${p.letterId}.`,
          title: "⚠️ Pipeline Job Failed",
          body,
          ctaText: "View Failed Jobs",
          ctaUrl,
        }),
        plain: `Pipeline failed for letter #${p.letterId}. Error: ${errorMsg}. Manage at: ${ctaUrl}`,
      };
    },
  },
  status_update: {
    label: "Generic Status Update",
    description:
      "General-purpose status update email sent for miscellaneous status changes.",
    render: (p) => {
      const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
      const body = `
        <p>Hello ${p.name},</p>
        <p>There has been an update on your legal letter request.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;margin:20px 0;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#0369A1;"><strong>📋 Status Update</strong></p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${p.subject}</p>
            <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>New Status:</strong> Under Review</p>
            <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
          </td></tr>
        </table>
        <p>Log in to your account to view the latest status and any notes from the review team.</p>
      `;
      return {
        subject: `[${APP_NAME}] Update on your letter: ${p.subject}`,
        html: buildEmailHtml({
          preheader: `Status update for your letter "${p.subject}".`,
          title: "Your Letter Status Has Been Updated",
          body,
          ctaText: "Track Your Letter",
          ctaUrl,
        }),
        plain: `Status update for your letter "${p.subject}" (#${p.letterId}). Track at: ${ctaUrl}`,
      };
    },
  },
};
