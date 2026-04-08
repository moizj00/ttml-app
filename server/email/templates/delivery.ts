/**
 * Letter delivery email — sends the approved letter to an external recipient.
 */

import { dispatchToWorker, buildEmailHtml, buildPlainText, getResend, APP_NAME, BRAND_DARK } from "../core";
import { logger } from "../../logger";

/**
 * Send the approved letter directly to a recipient email address.
 */
export async function sendLetterToRecipient(opts: {
  recipientEmail: string;
  letterSubject: string;
  subjectOverride?: string;
  note?: string;
  pdfUrl?: string;
  htmlContent?: string;
}): Promise<void> {
  const dispatched = await dispatchToWorker({ type: "letter_to_recipient", ...opts });
  if (dispatched) return;

  const emailSubject = opts.subjectOverride || opts.letterSubject;
  const escapeHtml = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const noteBlock = opts.note
    ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;margin:16px 0;">
        <tr><td style="padding:14px 18px;">
          <p style="margin:0 0 4px;font-family:Inter,Arial,sans-serif;font-size:12px;color:#92400E;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Note from sender</p>
          <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;line-height:1.6;">${escapeHtml(opts.note)}</p>
        </td></tr>
      </table>`
    : "";
  const attachments: Array<{ filename: string; content: Buffer }> = [];
  let hasPdfAttachment = false;

  if (opts.pdfUrl) {
    try {
      const pdfRes = await fetch(opts.pdfUrl);
      if (pdfRes.ok) {
        const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
        attachments.push({ filename: "legal-letter.pdf", content: pdfBuffer });
        hasPdfAttachment = true;
      }
    } catch (err) {
      logger.warn({ err: err }, "[Email] Could not fetch PDF for attachment, falling back to inline HTML:");
    }
  }

  const showInlineContent = !hasPdfAttachment && !!opts.htmlContent;
  const body = `
    <p>You have received a legal letter from <strong>${APP_NAME}</strong> on behalf of our client.</p>
    ${noteBlock}
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;margin:20px 0;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#0369A1;font-weight:700;">⚖️ Attorney-Reviewed Legal Correspondence</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Subject:</strong> ${opts.letterSubject}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Prepared by:</strong> ${APP_NAME} Legal Team</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#6B7280;">This letter has been reviewed and approved by a licensed attorney.</p>
      </td></tr>
    </table>
    ${hasPdfAttachment ? `<p>Please find the attorney-reviewed legal letter attached to this email as a PDF.</p>` : `<p>Please find the attorney-reviewed legal letter content below.</p>`}
    ${showInlineContent ? `
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:8px;margin:20px 0;">
      <tr><td style="padding:24px;font-family:Georgia,'Times New Roman',Times,serif;font-size:13px;line-height:1.8;color:#111;">
        ${opts.htmlContent}
      </td></tr>
    </table>` : ""}
    <p style="font-size:13px;color:#6B7280;margin-top:24px;">This letter was professionally drafted and approved by a licensed attorney through <strong>${APP_NAME}</strong>. If you have questions about this letter, please respond directly to the sender.</p>
  `;

  const html = buildEmailHtml({
    preheader: `You have received a legal letter: ${opts.letterSubject}`,
    title: "Legal Letter — Attorney Reviewed",
    body,
    accentColor: BRAND_DARK,
    footerNote: `This letter was sent via ${APP_NAME} on behalf of our client. This is a formal legal communication.`,
  });

  const notePlain = opts.note ? `\nNote from sender: ${opts.note}\n` : "";
  const plainText = buildPlainText({
    title: "Legal Letter — Attorney Reviewed",
    body: `You have received an attorney-reviewed legal letter via ${APP_NAME}.${notePlain}\n\nSubject: ${opts.letterSubject}\nPrepared by: ${APP_NAME} Legal Team\n\nThis letter has been reviewed and approved by a licensed attorney.${showInlineContent ? `\n\n--- Letter Content ---\n${opts.htmlContent!.replace(/<[^>]+>/g, "").trim()}\n--- End of Letter ---` : ""}`,
  });

  const delays = [2000, 5000];
  let lastErr: unknown;
  const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@talk-to-my-lawyer.com";
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const { error } = await getResend().emails.send({
        from: FROM,
        to: opts.recipientEmail,
        subject: emailSubject,
        html,
        text: plainText,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      if (error) throw new Error(error.message);
      return;
    } catch (err) {
      lastErr = err;
      logger.error({ err: err }, `[Email] sendLetterToRecipient attempt ${attempt + 1} failed:`);
      if (attempt < delays.length) {
        await new Promise(r => setTimeout(r, delays[attempt]));
      }
    }
  }
  logger.error({ err: lastErr }, "[Email] sendLetterToRecipient all retry attempts exhausted:");
  throw lastErr;
}
