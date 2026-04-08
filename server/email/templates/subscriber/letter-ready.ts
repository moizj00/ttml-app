import { dispatchToWorker, buildEmailHtml, buildPlainText, sendEmail, APP_NAME } from "../../core";

/** Notify subscriber that their draft is ready and they can submit it for attorney review */
export async function sendLetterReadyEmail(opts: {
  to: string;
  name: string;
  subject: string;
  letterId: number;
  appUrl: string;
  letterType?: string;
  jurisdictionState?: string;
  isFirstLetter?: boolean;
}) {
  const dispatched = await dispatchToWorker({ type: "letter_ready", ...opts });
  if (dispatched) return;

  const ctaUrl = `${opts.appUrl}/letters/${opts.letterId}`;
  const letterTypeLabel = opts.letterType
    ? opts.letterType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Legal Letter";
  const jurisdictionLine = opts.jurisdictionState
    ? `<p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Jurisdiction:</strong> ${opts.jurisdictionState}</p>`
    : "";

  const priceLabel = opts.isFirstLetter ? "$50" : "$299";
  const firstLetterBadge = opts.isFirstLetter
    ? `<table border="0" cellpadding="0" cellspacing="0" width="100%"
        style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;margin:0 0 16px;">
        <tr><td style="padding:14px 18px;">
          <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#065F46;font-weight:700;">
            🎉 First Letter Special — Only $50 for Attorney Review
          </p>
          <p style="margin:6px 0 0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#047857;">
            As a first-time user, you get attorney review at a reduced rate of $50 (normally $299). Or subscribe to a plan and get it included free.
          </p>
        </td></tr>
      </table>`
    : "";

  const body = `
    <p>Hello ${opts.name},</p>
    <p>Your letter draft is ready for your review. Click the button below to view it and proceed to attorney review.</p>

    ${firstLetterBadge}

    <!-- Letter summary card -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 10px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#92400E;font-weight:700;">📄 Draft Ready — Attorney Review Required</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter:</strong> ${opts.subject}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Type:</strong> ${letterTypeLabel}</p>
        ${jurisdictionLine}
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Letter ID:</strong> #${opts.letterId}</p>
      </td></tr>
    </table>

    <!-- What's included -->
    <p style="margin:0 0 12px;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:700;color:#0F2744;">What's included with attorney review (${priceLabel}):</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">⚖️</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>Licensed attorney review</strong> — a qualified attorney reads every word of your draft
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">✏️</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>Professional edits included</strong> — the attorney corrects, strengthens, and finalises your letter
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">📑</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;padding-bottom:8px;">
          <strong>PDF delivered to your account</strong> — download and send your professionally formatted letter
        </td>
      </tr>
      <tr>
        <td width="28" valign="top" style="padding:4px 8px 8px 0;font-size:16px;">🔒</td>
        <td style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;">
          <strong>Legally sound and jurisdiction-specific</strong> — researched and drafted for your exact situation
        </td>
      </tr>
    </table>

    <!-- Urgency note -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;margin:0 0 8px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#1D4ED8;">
          Your draft is ready and waiting. Click the button below to view a preview and submit for attorney review.
        </p>
      </td></tr>
    </table>
  `;

  const emailSubjectLine = opts.isFirstLetter
    ? `[${APP_NAME}] Your first letter draft is ready — attorney review for just $50`
    : `[${APP_NAME}] Your letter draft is ready — submit for attorney review`;
  const preheaderText = opts.isFirstLetter
    ? `Your first letter draft is ready — get attorney review for just $50 (or subscribe to waive the fee).`
    : `Your letter draft is ready — submit for attorney review for $299.`;
  const ctaButtonText = opts.isFirstLetter
    ? "View Draft & Get Attorney Review — $50"
    : "View Draft & Submit for Review — $299";

  const html = buildEmailHtml({
    preheader: preheaderText,
    title: "Your Letter Draft Is Ready",
    body,
    ctaText: ctaButtonText,
    ctaUrl,
    accentColor: "#D97706",
  });

  await sendEmail({
    to: opts.to,
    subject: emailSubjectLine,
    html,
    text: buildPlainText({
      title: "Your Letter Draft Is Ready",
      body: `Hello ${opts.name},\n\nYour letter draft "${opts.subject}" (Letter #${opts.letterId}) is ready for attorney review.\n\n${opts.isFirstLetter ? "As a first-time user, you get attorney review for just $50 (normally $299). Or subscribe to a plan to get it included free.\n\n" : ""}What's included with attorney review (${priceLabel}):\n- Licensed attorney review\n- Professional edits included\n- PDF delivered to your account\n- Legally sound and jurisdiction-specific\n\nClick below to view a preview of your draft and submit for attorney review.`,
      ctaText: ctaButtonText,
      ctaUrl,
    }),
  });
}
