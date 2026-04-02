import { buildEmailHtml, buildPlainText, APP_NAME, BRAND_COLOR, BRAND_DARK } from "./templates";
import type { Env } from "./env";
import type {
  EmailPayload,
  LetterApprovedPayload,
  NeedsChangesPayload,
  LetterRejectedPayload,
  NewReviewNeededPayload,
  JobFailedAlertPayload,
  AdminAlertPayload,
  StatusUpdatePayload,
  LetterSubmissionPayload,
  LetterReadyPayload,
  LetterUnlockedPayload,
  VerificationPayload,
  WelcomePayload,
  DraftReminderPayload,
  EmployeeWelcomePayload,
  AttorneyWelcomePayload,
  ReviewAssignedPayload,
  ReviewCompletedPayload,
  EmployeeCommissionPayload,
  PayoutCompletedPayload,
  PayoutRejectedPayload,
  PaymentFailedPayload,
  AdminVerificationCodePayload,
  AttorneyInvitationPayload,
  LetterToRecipientPayload,
} from "./emailTypes";

export interface RenderedEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{ filename: string; content: ArrayBuffer }>;
}

function renderLetterApproved(p: LetterApprovedPayload): RenderedEmail {
  const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
  const pdfLine = p.pdfUrl
    ? `<p style="margin-top:12px;">📄 <a href="${p.pdfUrl}" style="color:${BRAND_DARK};font-weight:bold;">Download your Reviewed PDF</a></p>`
    : "";
  const body = `
    <p>Hello ${p.name},</p>
    <p>Great news! Your legal letter request has been <strong style="color:#059669;">approved</strong> by our attorney team.</p>
    <p><strong>Letter:</strong> ${p.subject}</p>
    <p>Your final approved letter is now available for download in your account. Click the button below to view and download it.</p>
    ${pdfLine}
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] Your letter has been approved`,
    html: buildEmailHtml({ preheader: "Your legal letter has been approved and is ready to download.", title: "Your Letter Has Been Approved ✓", body, ctaText: "View Your Approved Letter", ctaUrl, accentColor: "#059669" }),
    text: buildPlainText({ title: "Your Letter Has Been Approved", body: `Hello ${p.name}, your legal letter "${p.subject}" has been approved. View it at: ${ctaUrl}`, ctaText: "View Letter", ctaUrl }),
  };
}

function renderNeedsChanges(p: NeedsChangesPayload): RenderedEmail {
  const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
  const noteBlock = p.attorneyNote
    ? `<blockquote style="margin:16px 0;padding:12px 16px;background:#FEF3C7;border-left:4px solid #F59E0B;border-radius:4px;font-style:italic;color:#92400E;">${p.attorneyNote}</blockquote>`
    : "";
  const body = `
    <p>Hello ${p.name},</p>
    <p>Our attorney has reviewed your letter request and has requested some changes before it can be approved.</p>
    <p><strong>Letter:</strong> ${p.subject}</p>
    ${noteBlock}
    <p>Please review the feedback and update your request accordingly.</p>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] Changes requested for your letter`,
    html: buildEmailHtml({ preheader: "Your letter needs some changes before it can be approved.", title: "Changes Requested for Your Letter", body, ctaText: "View Feedback & Update", ctaUrl, accentColor: "#D97706" }),
    text: buildPlainText({ title: "Changes Requested", body: `Hello ${p.name}, your letter "${p.subject}" needs changes. ${p.attorneyNote ?? ""} View at: ${ctaUrl}`, ctaText: "View Letter", ctaUrl }),
  };
}

function renderLetterRejected(p: LetterRejectedPayload): RenderedEmail {
  const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
  const reasonBlock = p.reason
    ? `<blockquote style="margin:16px 0;padding:12px 16px;background:#FEE2E2;border-left:4px solid #EF4444;border-radius:4px;color:#991B1B;">${p.reason}</blockquote>`
    : "";
  const body = `
    <p>Hello ${p.name},</p>
    <p>After careful review, our attorney team has determined that your letter request cannot be processed at this time.</p>
    <p><strong>Letter:</strong> ${p.subject}</p>
    ${reasonBlock}
    <p>If you believe this is an error or have questions, please contact our support team.</p>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] Update on your letter request`,
    html: buildEmailHtml({ preheader: "Your letter request has been reviewed.", title: "Letter Request Update", body, ctaText: "View Details", ctaUrl, accentColor: "#DC2626" }),
    text: buildPlainText({ title: "Letter Request Update", body: `Hello ${p.name}, your letter "${p.subject}" could not be processed. ${p.reason ?? ""} View at: ${ctaUrl}`, ctaText: "View Details", ctaUrl }),
  };
}

function renderNewReviewNeeded(p: NewReviewNeededPayload): RenderedEmail {
  const ctaUrl = `${p.appUrl}/review/${p.letterId}`;
  const body = `
    <p>Hello ${p.name},</p>
    <p>A new letter request is ready for your review in the attorney queue.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F9FAFB;border-radius:8px;margin:16px 0;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;"><strong>Subject:</strong> ${p.letterSubject}</p>
        <p style="margin:0 0 8px;"><strong>Type:</strong> ${p.letterType}</p>
        <p style="margin:0;"><strong>Jurisdiction:</strong> ${p.jurisdiction}</p>
      </td></tr>
    </table>
    <p>Please log in to claim and review this letter at your earliest convenience.</p>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] New letter ready for review: ${p.letterSubject}`,
    html: buildEmailHtml({ preheader: "A new letter is waiting for your review.", title: "New Letter Ready for Review", body, ctaText: "Review Letter", ctaUrl, accentColor: "#7C3AED" }),
    text: buildPlainText({ title: "New Letter Ready for Review", body: `Hello ${p.name}, a new letter "${p.letterSubject}" (${p.letterType}, ${p.jurisdiction}) is ready for review. Claim it at: ${ctaUrl}`, ctaText: "Review Letter", ctaUrl }),
  };
}

function renderJobFailedAlert(p: JobFailedAlertPayload): RenderedEmail {
  const ctaUrl = `${p.appUrl}/admin/jobs`;
  const body = `
    <p>Hello ${p.name},</p>
    <p>An AI pipeline job has <strong style="color:#DC2626;">failed</strong> and requires your attention.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FEF2F2;border-radius:8px;margin:16px 0;border:1px solid #FECACA;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;"><strong>Letter ID:</strong> #${p.letterId}</p>
        <p style="margin:0 0 8px;"><strong>Job Type:</strong> ${p.jobType}</p>
        <p style="margin:0;"><strong>Error:</strong> <code style="font-size:13px;color:#991B1B;">${p.errorMessage}</code></p>
      </td></tr>
    </table>
    <p>Please review the failed job and retry if appropriate.</p>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] ALERT: Pipeline job failed for letter #${p.letterId}`,
    html: buildEmailHtml({ preheader: "An AI pipeline job has failed and needs attention.", title: "⚠️ Pipeline Job Failed", body, ctaText: "View Failed Jobs", ctaUrl, accentColor: "#DC2626" }),
    text: buildPlainText({ title: "Pipeline Job Failed", body: `Letter #${p.letterId}, Job: ${p.jobType}, Error: ${p.errorMessage}. Manage at: ${ctaUrl}`, ctaText: "View Jobs", ctaUrl }),
  };
}

function renderAdminAlert(p: AdminAlertPayload): RenderedEmail {
  return {
    to: p.to,
    subject: `[${APP_NAME}] ${p.subject}`,
    html: buildEmailHtml({ preheader: p.preheader, title: p.subject, body: p.bodyHtml, ctaText: p.ctaText, ctaUrl: p.ctaUrl, accentColor: BRAND_COLOR }),
    text: buildPlainText({ title: p.subject, body: p.preheader, ctaText: p.ctaText, ctaUrl: p.ctaUrl }),
  };
}

function renderStatusUpdate(p: StatusUpdatePayload): RenderedEmail {
  const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
  const statusMessages: Record<string, string> = {
    researching: "Our AI is now researching the applicable laws and regulations for your jurisdiction.",
    drafting: "Our AI is drafting your letter based on the legal research.",
    pending_review: "Your letter draft is complete and has been placed in the attorney review queue.",
    under_review: "An attorney has claimed your letter and is currently reviewing it.",
  };
  const message = statusMessages[p.newStatus] ?? "Your letter request has been updated.";
  const body = `
    <p>Hello ${p.name},</p>
    <p>${message}</p>
    <p><strong>Letter:</strong> ${p.subject}</p>
    <p>You can track the progress of your letter in your account.</p>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] Update on your letter: ${p.subject}`,
    html: buildEmailHtml({ preheader: `Update on your letter: ${p.subject}`, title: "Letter Status Update", body, ctaText: "Track Your Letter", ctaUrl }),
    text: buildPlainText({ title: "Letter Status Update", body: `Hello ${p.name}, ${message} Letter: "${p.subject}". Track at: ${ctaUrl}`, ctaText: "Track Letter", ctaUrl }),
  };
}

async function renderLetterToRecipient(p: LetterToRecipientPayload, env: Env): Promise<RenderedEmail> {
  const emailSubject = p.subjectOverride || p.letterSubject;
  const escapeHtml = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const noteBlock = p.note
    ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;margin:16px 0;">
        <tr><td style="padding:14px 18px;">
          <p style="margin:0 0 4px;font-family:Inter,Arial,sans-serif;font-size:12px;color:#92400E;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Note from sender</p>
          <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;line-height:1.6;">${escapeHtml(p.note)}</p>
        </td></tr>
      </table>`
    : "";

  const attachments: Array<{ filename: string; content: ArrayBuffer }> = [];
  let hasPdfAttachment = false;

  if (p.pdfUrl) {
    try {
      const pdfRes = await fetch(p.pdfUrl);
      if (pdfRes.ok) {
        const pdfBuffer = await pdfRes.arrayBuffer();
        attachments.push({ filename: "legal-letter.pdf", content: pdfBuffer });
        hasPdfAttachment = true;
      }
    } catch (err) {
      console.warn("[EmailWorker] Could not fetch PDF for attachment:", err);
    }
  }

  const showInlineContent = !hasPdfAttachment && !!p.htmlContent;
  const body = `
    <p>You have received a legal letter from <strong>${APP_NAME}</strong> on behalf of our client.</p>
    ${noteBlock}
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;margin:20px 0;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#0369A1;font-weight:700;">⚖️ Attorney-Reviewed Legal Correspondence</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Subject:</strong> ${p.letterSubject}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Prepared by:</strong> ${APP_NAME} Legal Team</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#6B7280;">This letter has been reviewed and approved by a licensed attorney.</p>
      </td></tr>
    </table>
    ${hasPdfAttachment ? `<p>Please find the attorney-reviewed legal letter attached to this email as a PDF.</p>` : `<p>Please find the attorney-reviewed legal letter content below.</p>`}
    ${showInlineContent ? `
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:8px;margin:20px 0;">
      <tr><td style="padding:24px;font-family:Georgia,'Times New Roman',Times,serif;font-size:13px;line-height:1.8;color:#111;">
        ${p.htmlContent}
      </td></tr>
    </table>` : ""}
    <p style="font-size:13px;color:#6B7280;margin-top:24px;">This letter was professionally drafted and approved by a licensed attorney through <strong>${APP_NAME}</strong>. If you have questions about this letter, please respond directly to the sender.</p>
  `;
  const notePlain = p.note ? `\nNote from sender: ${p.note}\n` : "";
  const plainBody = `You have received an attorney-reviewed legal letter via ${APP_NAME}.${notePlain}\n\nSubject: ${p.letterSubject}\nPrepared by: ${APP_NAME} Legal Team\n\nThis letter has been reviewed and approved by a licensed attorney.${showInlineContent ? `\n\n--- Letter Content ---\n${p.htmlContent!.replace(/<[^>]+>/g, "").trim()}\n--- End of Letter ---` : ""}`;

  return {
    to: p.recipientEmail,
    subject: emailSubject,
    html: buildEmailHtml({ preheader: `You have received a legal letter: ${p.letterSubject}`, title: "Legal Letter — Attorney Reviewed", body, accentColor: BRAND_DARK, footerNote: `This letter was sent via ${APP_NAME} on behalf of our client. This is a formal legal communication.` }),
    text: buildPlainText({ title: "Legal Letter — Attorney Reviewed", body: plainBody }),
    attachments,
  };
}

function renderLetterSubmission(p: LetterSubmissionPayload): RenderedEmail {
  const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
  const letterTypeLabel = p.letterType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const body = `
    <p>Hello ${p.name},</p>
    <p>We've received your letter intake and our team is now reviewing it. You'll receive a separate email with a direct link to your draft once it's ready — typically within 24 hours.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#0369A1;"><strong>📋 Submission Details</strong></p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Subject:</strong> ${p.subject}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${letterTypeLabel}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${p.jurisdictionState}</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
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
  return {
    to: p.to,
    subject: `[${APP_NAME}] Letter intake received — #${p.letterId}`,
    html: buildEmailHtml({ preheader: `We've received your letter intake #${p.letterId}. You'll hear from us within 24 hours.`, title: "Your Letter Intake Has Been Received ✓", body, ctaText: "View Your Letter", ctaUrl, accentColor: "#0284C7" }),
    text: buildPlainText({ title: "Your Letter Intake Has Been Received", body: `Hello ${p.name}, we've received your letter intake #${p.letterId} ("${p.subject}", ${letterTypeLabel}, ${p.jurisdictionState}). Our team is reviewing it now. You'll receive an email with a direct link to your draft within 24 hours. You can also check your letter status at: ${ctaUrl}`, ctaText: "View Your Letter", ctaUrl }),
  };
}

function renderLetterReady(p: LetterReadyPayload): RenderedEmail {
  const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
  const letterTypeLabel = p.letterType
    ? p.letterType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Legal Letter";
  const jurisdictionLine = p.jurisdictionState
    ? `<p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${p.jurisdictionState}</p>`
    : "";
  const body = `
    <p>Hello ${p.name},</p>
    <p>Your letter draft is ready for your review. Click the button below to view it and proceed to attorney review.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 10px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#92400E;font-weight:700;">📄 Draft Ready — Attorney Review Required</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${p.subject}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${letterTypeLabel}</p>
        ${jurisdictionLine}
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 12px;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:700;color:#0F2744;">What's included with attorney review ($200):</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
      <tr><td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">⚖️</td><td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;"><strong>Licensed attorney review</strong> — a qualified attorney reads every word of your draft</td></tr>
      <tr><td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">✏️</td><td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;"><strong>Professional edits included</strong> — the attorney corrects, strengthens, and finalises your letter</td></tr>
      <tr><td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">📑</td><td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;"><strong>PDF delivered to your account</strong> — download and send your professionally formatted letter</td></tr>
      <tr><td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">🔒</td><td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Legally sound and jurisdiction-specific</strong> — researched and drafted for your exact situation</td></tr>
    </table>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;margin:0 0 8px;">
      <tr><td style="padding:14px 18px;"><p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#1D4ED8;">Your draft is ready and waiting. Click the button below to view a preview and complete your payment to submit for attorney review.</p></td></tr>
    </table>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] Your letter draft is ready — submit for attorney review`,
    html: buildEmailHtml({ preheader: "Your letter draft is ready — submit for attorney review for $200.", title: "Your Letter Draft Is Ready", body, ctaText: "View Draft & Submit for Review — $200", ctaUrl, accentColor: "#D97706" }),
    text: buildPlainText({ title: "Your Letter Draft Is Ready", body: `Hello ${p.name},\n\nYour letter draft "${p.subject}" (Letter #${p.letterId}) is ready for attorney review.\n\nWhat's included with attorney review ($200):\n- Licensed attorney review\n- Professional edits included\n- PDF delivered to your account\n- Legally sound and jurisdiction-specific\n\nClick below to view a preview of your draft and submit for attorney review.`, ctaText: "View Draft & Submit for Review — $200", ctaUrl }),
  };
}

function renderLetterUnlocked(p: LetterUnlockedPayload): RenderedEmail {
  const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
  const body = `
    <p>Hello ${p.name},</p>
    <p>Payment confirmed! Your letter has been sent to our attorney team for review and approval.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#5B21B6;"><strong>⚖️ In Attorney Review</strong></p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${p.subject}</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
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
  return {
    to: p.to,
    subject: `[${APP_NAME}] Payment confirmed — your letter is in attorney review`,
    html: buildEmailHtml({ preheader: "Payment confirmed — your letter is now with our attorney team.", title: "Payment Confirmed — Letter In Review ✓", body, ctaText: "Track Review Status", ctaUrl, accentColor: "#7C3AED" }),
    text: buildPlainText({ title: "Payment Confirmed — Letter In Review", body: `Hello ${p.name}, your payment has been confirmed and your letter "${p.subject}" (Letter #${p.letterId}) is now in attorney review. You'll receive an email when it's approved. Track status at: ${ctaUrl}`, ctaText: "Track Review Status", ctaUrl }),
  };
}

function renderVerification(p: VerificationPayload): RenderedEmail {
  const body = `
    <p>Hello ${p.name},</p>
    <p>Thank you for creating an account with <strong>${APP_NAME}</strong>. To complete your registration and start using our service, please verify your email address.</p>
    <p style="font-size:13px;color:#6B7280;">This link expires in <strong>24 hours</strong>. If you did not create an account, you can safely ignore this email.</p>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] Please verify your email address`,
    html: buildEmailHtml({ preheader: "Verify your email address to activate your Talk to My Lawyer account.", title: "Verify Your Email Address 🔒", body, ctaText: "Verify My Email Address", ctaUrl: p.verifyUrl, accentColor: "#2563EB", footerNote: `You received this email because you signed up for ${APP_NAME}. If this wasn't you, please ignore this email.` }),
    text: buildPlainText({ title: "Verify Your Email Address", body: `Hello ${p.name}, please verify your email address to activate your account. This link expires in 24 hours.`, ctaText: "Verify Email", ctaUrl: p.verifyUrl }),
  };
}

function renderWelcome(p: WelcomePayload): RenderedEmail {
  const body = `
    <p>Hello ${p.name},</p>
    <p>Your email has been verified and your account is now fully active. Welcome to <strong>${APP_NAME}</strong>!</p>
    <p>You can now:</p>
    <ul style="margin:8px 0;padding-left:20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.8;">
      <li>Submit letter requests for attorney review</li>
      <li>Track the status of your letters in real time</li>
      <li>Download approved letters as PDFs</li>
    </ul>
    <p>Get started by creating your first letter request.</p>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] Welcome — your account is ready!`,
    html: buildEmailHtml({ preheader: "Your account is verified and ready to use.", title: "Welcome to Talk to My Lawyer! 🎉", body, ctaText: "Go to My Dashboard", ctaUrl: p.dashboardUrl, accentColor: "#059669" }),
    text: buildPlainText({ title: "Welcome to Talk to My Lawyer!", body: `Hello ${p.name}, your email has been verified and your account is now active. Start creating legal letters at:`, ctaText: "Go to Dashboard", ctaUrl: p.dashboardUrl }),
  };
}

function renderDraftReminder(p: DraftReminderPayload): RenderedEmail {
  const ctaUrl = `${p.appUrl}/letters/${p.letterId}`;
  const letterTypeLabel = p.letterType
    ? p.letterType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Legal Letter";
  const jurisdictionLine = p.jurisdictionState
    ? `<p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${p.jurisdictionState}</p>`
    : "";
  const hoursLabel = p.hoursWaiting ? `${Math.round(p.hoursWaiting)} hours` : "48 hours";
  const body = `
    <p>Hello ${p.name},</p>
    <p>Your legal letter draft has been ready for <strong>${hoursLabel}</strong> and is still waiting for attorney review. Don't let your work go to waste — submit it today for just <strong>$200</strong>.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 10px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#9A3412;font-weight:700;">⏰ Your Draft Is Still Waiting</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${p.subject}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${letterTypeLabel}</p>
        ${jurisdictionLine}
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${p.letterId}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 12px;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:700;color:#0F2744;">Why submit for attorney review now?</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
      <tr><td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">⚖️</td><td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;"><strong>Legal matters are time-sensitive</strong> — deadlines and statutes of limitations can affect your case</td></tr>
      <tr><td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">✏️</td><td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;"><strong>A licensed attorney reviews every word</strong> — ensuring your letter is accurate and professionally formatted</td></tr>
      <tr><td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">📑</td><td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>PDF ready to send</strong> — once approved, download and use your letter immediately</td></tr>
    </table>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;margin:0 0 8px;">
      <tr><td style="padding:14px 18px;"><p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#1D4ED8;"><strong>Attorney review — $200 one-time payment.</strong> No subscription required. Your draft is ready and waiting.</p></td></tr>
    </table>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] Reminder: your letter draft is ready — submit for attorney review`,
    html: buildEmailHtml({ preheader: `Your letter draft has been waiting ${hoursLabel} — submit for attorney review today.`, title: "Your Draft Is Still Waiting for Review", body, ctaText: "Submit for Attorney Review — $200", ctaUrl, accentColor: "#EA580C" }),
    text: buildPlainText({ title: "Your Draft Is Still Waiting for Review", body: `Hello ${p.name},\n\nYour letter draft "${p.subject}" (Letter #${p.letterId}) has been ready for ${hoursLabel} and is still waiting for attorney review.\n\nLegal matters are time-sensitive. Submit for attorney review today for $200 — a licensed attorney will review, edit, and approve your letter.\n\nView your draft at: ${ctaUrl}`, ctaText: "Submit for Attorney Review — $200", ctaUrl }),
  };
}

function renderEmployeeWelcome(p: EmployeeWelcomePayload): RenderedEmail {
  const codeBlock = p.discountCode
    ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#EFF6FF;border-radius:8px;margin:16px 0;border:1px solid #BFDBFE;">
        <tr><td style="padding:16px;">
          <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#1E40AF;font-weight:700;">Your Affiliate Discount Code</p>
          <p style="margin:0;font-family:'Courier New',monospace;font-size:20px;color:#1D4ED8;font-weight:700;letter-spacing:2px;">${p.discountCode}</p>
          <p style="margin:8px 0 0;font-family:Inter,Arial,sans-serif;font-size:12px;color:#6B7280;">Share this code with clients to earn a 5% commission on every subscription payment.</p>
        </td></tr>
      </table>`
    : "";
  const body = `
    <p>Hello ${p.name},</p>
    <p>Welcome to the <strong>${APP_NAME}</strong> team! Your employee account has been verified and is now active.</p>
    ${codeBlock}
    <p>As an employee, you can:</p>
    <ul style="margin:8px 0;padding-left:20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.8;">
      <li>Share your personal discount code with potential clients</li>
      <li>Track referrals and see who signed up using your code</li>
      <li>Monitor your commission earnings in real time</li>
      <li>Access the employee dashboard for operational support</li>
    </ul>
    <p>Get started by visiting your employee dashboard below.</p>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] Welcome to the team!`,
    html: buildEmailHtml({ preheader: "Your employee account is active.", title: "Welcome to the Team!", body, ctaText: "Go to Employee Dashboard", ctaUrl: p.dashboardUrl, accentColor: "#2563EB" }),
    text: buildPlainText({ title: "Welcome to the Team!", body: `Hello ${p.name}, your employee account is now active.${p.discountCode ? ` Your affiliate discount code is: ${p.discountCode}.` : ""} Visit your dashboard to get started.`, ctaText: "Go to Employee Dashboard", ctaUrl: p.dashboardUrl }),
  };
}

function renderAttorneyWelcome(p: AttorneyWelcomePayload): RenderedEmail {
  const body = `
    <p>Hello ${p.name},</p>
    <p>Welcome to <strong>${APP_NAME}</strong>. Your attorney account has been verified and you now have access to the <strong>Letter Review Center</strong>.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F3FF;border-radius:8px;margin:16px 0;border:1px solid #DDD6FE;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#5B21B6;font-weight:700;">Letter Review Center</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#6B7280;">The Review Center is where you will claim, edit, and approve or reject AI-generated legal letter drafts. Each letter includes jurisdiction research, a structured draft, and the subscriber intake details.</p>
      </td></tr>
    </table>
    <p>As a reviewing attorney, you can:</p>
    <ul style="margin:8px 0;padding-left:20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.8;">
      <li>Claim letters from the review queue</li>
      <li>Edit AI-generated drafts using the in-app editor</li>
      <li>Approve, reject, or request changes with detailed notes</li>
      <li>View full audit trails and letter history</li>
    </ul>
    <p>You will receive email notifications when new letters are ready for review.</p>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] Welcome — your attorney account is ready!`,
    html: buildEmailHtml({ preheader: "Your attorney account is active.", title: "Welcome, Counselor!", body, ctaText: "Go to Attorney Dashboard", ctaUrl: p.dashboardUrl, accentColor: "#7C3AED" }),
    text: buildPlainText({ title: "Welcome to Talk to My Lawyer!", body: `Hello ${p.name}, your attorney account is now active. You have access to the Letter Review Center where you can claim, edit, and approve legal letter drafts.`, ctaText: "Go to Attorney Dashboard", ctaUrl: p.dashboardUrl }),
  };
}

function renderReviewAssigned(p: ReviewAssignedPayload): RenderedEmail {
  const ctaUrl = `${p.appUrl}/review/${p.letterId}`;
  const body = `
    <p>Hello ${p.name},</p>
    <p>A letter has been assigned to you for review. Please review it at your earliest convenience.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F3FF;border-radius:8px;margin:16px 0;border:1px solid #DDD6FE;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#5B21B6;font-weight:700;">Letter Details</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Subject:</strong> ${p.letterSubject}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${p.letterType}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${p.jurisdiction}</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Client:</strong> ${p.subscriberName}</p>
      </td></tr>
    </table>
    <p style="font-size:13px;color:#6B7280;">Review typically involves reading the AI draft, making edits as needed, and approving or rejecting the letter.</p>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] Letter assigned to you: ${p.letterSubject} (#${p.letterId})`,
    html: buildEmailHtml({ preheader: `Letter #${p.letterId} has been assigned to you for review.`, title: "Letter Assigned for Review", body, ctaText: "Open Letter Review", ctaUrl, accentColor: "#7C3AED" }),
    text: buildPlainText({ title: "Letter Assigned for Review", body: `Hello ${p.name}, letter #${p.letterId} "${p.letterSubject}" (${p.letterType}, ${p.jurisdiction}) from ${p.subscriberName} has been assigned to you.`, ctaText: "Open Letter Review", ctaUrl }),
  };
}

function renderReviewCompleted(p: ReviewCompletedPayload): RenderedEmail {
  const ctaUrl = `${p.appUrl}/review/${p.letterId}`;
  const actionLabels: Record<string, { label: string; color: string }> = {
    approved: { label: "Approved", color: "#059669" },
    rejected: { label: "Rejected", color: "#DC2626" },
    needs_changes: { label: "Changes Requested", color: "#D97706" },
  };
  const { label, color } = actionLabels[p.action] || actionLabels.approved;
  const body = `
    <p>Hello ${p.name},</p>
    <p>Your review action has been recorded for the following letter:</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F9FAFB;border-radius:8px;margin:16px 0;border:1px solid #E5E7EB;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${p.letterSubject} (#${p.letterId})</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:${color};font-weight:700;">Status: ${label}</p>
      </td></tr>
    </table>
    <p style="font-size:13px;color:#6B7280;">The subscriber has been notified of your decision. You can view the full audit trail in the Review Center.</p>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] Review recorded: ${p.letterSubject} — ${label}`,
    html: buildEmailHtml({ preheader: `Letter #${p.letterId} review ${label.toLowerCase()}.`, title: `Review ${label}`, body, ctaText: "View Letter Details", ctaUrl, accentColor: color }),
    text: buildPlainText({ title: `Review ${label}`, body: `Hello ${p.name}, your review action (${label}) has been recorded for letter "${p.letterSubject}" (#${p.letterId}). The subscriber has been notified.`, ctaText: "View Letter", ctaUrl }),
  };
}

function renderEmployeeCommission(p: EmployeeCommissionPayload): RenderedEmail {
  const body = `
    <p>Hello ${p.name},</p>
    <p>Great news — a client you referred just made a payment using your discount code!</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#ECFDF5;border-radius:8px;margin:16px 0;border:1px solid #A7F3D0;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#047857;font-weight:700;">Commission Earned</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Client:</strong> ${p.subscriberName}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Plan:</strong> ${p.planName}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Discount Code Used:</strong> ${p.discountCode}</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:20px;color:#059669;font-weight:700;">+${p.commissionAmount}</p>
      </td></tr>
    </table>
    <p>Your commission has been recorded and is visible in your earnings dashboard. Keep sharing your code to earn more!</p>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] Commission earned: ${p.commissionAmount} from ${p.subscriberName}`,
    html: buildEmailHtml({ preheader: `You earned ${p.commissionAmount} in commission!`, title: "Commission Earned!", body, ctaText: "View My Earnings", ctaUrl: p.dashboardUrl, accentColor: "#059669" }),
    text: buildPlainText({ title: "Commission Earned!", body: `Hello ${p.name}, a client (${p.subscriberName}) just paid for the ${p.planName} plan using your discount code (${p.discountCode}). You earned ${p.commissionAmount} in commission.`, ctaText: "View My Earnings", ctaUrl: p.dashboardUrl }),
  };
}

function renderPayoutCompleted(p: PayoutCompletedPayload): RenderedEmail {
  const methodLabel = p.paymentMethod.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const body = `
    <p>Hello ${p.name},</p>
    <p>Your payout request has been <strong style="color:#059669;">approved</strong> and processed.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#ECFDF5;border-radius:8px;margin:16px 0;border:1px solid #A7F3D0;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#047857;font-weight:700;">Payout Approved</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Amount:</strong> ${p.amount}</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Method:</strong> ${methodLabel}</p>
      </td></tr>
    </table>
    <p>The funds will be sent to you via your selected payment method. If you have any questions, please contact your administrator.</p>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] Payout approved: ${p.amount}`,
    html: buildEmailHtml({ preheader: `Your payout of ${p.amount} has been approved!`, title: "Payout Approved", body, accentColor: "#059669" }),
    text: buildPlainText({ title: "Payout Approved", body: `Hello ${p.name}, your payout request of ${p.amount} via ${methodLabel} has been approved and processed.` }),
  };
}

function renderPayoutRejected(p: PayoutRejectedPayload): RenderedEmail {
  const body = `
    <p>Hello ${p.name},</p>
    <p>Unfortunately, your payout request has been <strong style="color:#DC2626;">rejected</strong>.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FEF2F2;border-radius:8px;margin:16px 0;border:1px solid #FECACA;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#DC2626;font-weight:700;">Payout Rejected</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Amount Requested:</strong> ${p.amount}</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Reason:</strong> ${p.reason}</p>
      </td></tr>
    </table>
    <p>Your pending balance has not been affected. If you believe this was in error, please contact your administrator.</p>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] Payout rejected: ${p.amount}`,
    html: buildEmailHtml({ preheader: `Your payout request of ${p.amount} was rejected`, title: "Payout Rejected", body, accentColor: "#DC2626" }),
    text: buildPlainText({ title: "Payout Rejected", body: `Hello ${p.name}, your payout request of ${p.amount} was rejected. Reason: ${p.reason}. Your pending balance has not been affected.` }),
  };
}

function renderPaymentFailed(p: PaymentFailedPayload): RenderedEmail {
  const body = `
    <p>Hello ${p.name},</p>
    <p>We were unable to process your most recent payment${p.letterSubject ? ` for "<strong>${p.letterSubject}</strong>"` : ""}.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FEF2F2;border-radius:8px;margin:16px 0;border:1px solid #FECACA;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#DC2626;font-weight:700;">Payment Failed</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;">Please update your payment method to continue using ${APP_NAME}. If your payment method is not updated, your subscription may be canceled.</p>
      </td></tr>
    </table>
    <p>If you believe this is an error, please check with your bank or try a different payment method.</p>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] Payment failed — please update your payment method`,
    html: buildEmailHtml({ preheader: "Your payment could not be processed. Please update your payment method.", title: "Payment Failed", body, ctaText: "Update Payment Method", ctaUrl: p.billingUrl, accentColor: "#DC2626" }),
    text: buildPlainText({ title: "Payment Failed", body: `Hello ${p.name}, your payment${p.letterSubject ? ` for "${p.letterSubject}"` : ""} could not be processed. Please update your payment method at: ${p.billingUrl}`, ctaText: "Update Payment Method", ctaUrl: p.billingUrl }),
  };
}

function renderAdminVerificationCode(p: AdminVerificationCodePayload): RenderedEmail {
  const codeDisplay = p.code.split("").join(" ");
  const BRAND_DARK = "#0F2744";
  const html = buildEmailHtml({
    preheader: `Your admin verification code: ${p.code}`,
    title: "Admin Verification Code",
    body: `
      <p style="margin:0 0 16px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;">Hello ${p.name},</p>
      <p style="margin:0 0 16px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;">A login attempt was made to your admin account. Enter the code below to verify your identity:</p>
      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;padding:16px 32px;background:#F1F5F9;border-radius:12px;border:2px solid #E2E8F0;">
          <span style="font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:${BRAND_DARK};">${codeDisplay}</span>
        </div>
      </div>
      <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#6B7280;">This code expires in <strong>10 minutes</strong>.</p>
      <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#6B7280;">If you did not attempt to sign in, please secure your account immediately.</p>
    `,
    footerNote: "This is an automated security notification. Do not share this code with anyone.",
    accentColor: "#DC2626",
  });
  return {
    to: p.to,
    subject: `[${APP_NAME}] Admin Verification Code: ${p.code}`,
    html,
    text: buildPlainText({ title: "Admin Verification Code", body: `Hello ${p.name}, your admin verification code is: ${p.code}. This code expires in 10 minutes. If you did not attempt to sign in, please secure your account immediately.` }),
  };
}

function renderAttorneyInvitation(p: AttorneyInvitationPayload): RenderedEmail {
  const body = `
    <p>Hello ${p.name},</p>
    <p>You have been invited to join <strong>${APP_NAME}</strong> as a <strong>Reviewing Attorney</strong>${p.invitedByName ? ` by ${p.invitedByName}` : ""}.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F3FF;border-radius:8px;margin:16px 0;border:1px solid #DDD6FE;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#5B21B6;font-weight:700;">What is the Letter Review Center?</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#6B7280;">The Review Center is where you will claim, edit, and approve or reject AI-generated legal letter drafts. Each letter includes jurisdiction research, a structured draft, and the subscriber intake details.</p>
      </td></tr>
    </table>
    <p>As a reviewing attorney, you will be able to:</p>
    <ul style="margin:8px 0;padding-left:20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.8;">
      <li>Claim letters from the review queue</li>
      <li>Edit AI-generated drafts using the in-app editor</li>
      <li>Approve, reject, or request changes with detailed notes</li>
      <li>View full audit trails and letter history</li>
    </ul>
    <p>To get started, click the button below to set your password and access your attorney dashboard.</p>
  `;
  return {
    to: p.to,
    subject: `[${APP_NAME}] You've been invited as a Reviewing Attorney`,
    html: buildEmailHtml({ preheader: "You've been invited as a reviewing attorney.", title: "Attorney Invitation", body, ctaText: "Set Your Password", ctaUrl: p.setPasswordUrl, accentColor: "#7C3AED" }),
    text: buildPlainText({ title: "Attorney Invitation", body: `Hello ${p.name}, you have been invited to join ${APP_NAME} as a Reviewing Attorney. Set your password to get started and access the Letter Review Center.`, ctaText: "Set Your Password", ctaUrl: p.setPasswordUrl }),
  };
}

function assertNever(x: never): never {
  throw new Error(`Unhandled email type: ${(x as { type: string }).type}`);
}

export async function renderEmail(payload: EmailPayload, env: Env): Promise<RenderedEmail> {
  switch (payload.type) {
    case "letter_approved": return renderLetterApproved(payload);
    case "needs_changes": return renderNeedsChanges(payload);
    case "letter_rejected": return renderLetterRejected(payload);
    case "new_review_needed": return renderNewReviewNeeded(payload);
    case "job_failed_alert": return renderJobFailedAlert(payload);
    case "admin_alert": return renderAdminAlert(payload);
    case "status_update": return renderStatusUpdate(payload);
    case "letter_to_recipient": return renderLetterToRecipient(payload, env);
    case "letter_submission": return renderLetterSubmission(payload);
    case "letter_ready": return renderLetterReady(payload);
    case "letter_unlocked": return renderLetterUnlocked(payload);
    case "verification": return renderVerification(payload);
    case "welcome": return renderWelcome(payload);
    case "draft_reminder": return renderDraftReminder(payload);
    case "employee_welcome": return renderEmployeeWelcome(payload);
    case "attorney_welcome": return renderAttorneyWelcome(payload);
    case "review_assigned": return renderReviewAssigned(payload);
    case "review_completed": return renderReviewCompleted(payload);
    case "employee_commission": return renderEmployeeCommission(payload);
    case "payout_completed": return renderPayoutCompleted(payload);
    case "payout_rejected": return renderPayoutRejected(payload);
    case "payment_failed": return renderPaymentFailed(payload);
    case "admin_verification_code": return renderAdminVerificationCode(payload);
    case "attorney_invitation": return renderAttorneyInvitation(payload);
    default: return assertNever(payload);
  }
}
