/**
 * Employee, affiliate, and attorney onboarding email templates.
 * Covers: employee welcome, attorney welcome, attorney invitation,
 * employee commission, payout completed, payout rejected.
 */

import { dispatchToWorker, buildEmailHtml, buildPlainText, sendEmail, sendWithRetry, APP_NAME } from "../core";

/**
 * Welcome email for new employees — includes discount code info and affiliate dashboard link.
 */
export async function sendEmployeeWelcomeEmail(opts: {
  to: string;
  name: string;
  discountCode?: string;
  dashboardUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "employee_welcome", ...opts });
  if (dispatched) return;

  const codeBlock = opts.discountCode
    ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#EFF6FF;border-radius:8px;margin:16px 0;border:1px solid #BFDBFE;">
        <tr><td style="padding:16px;">
          <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#1E40AF;font-weight:700;">Your Affiliate Discount Code</p>
          <p style="margin:0;font-family:'Courier New',monospace;font-size:20px;color:#1D4ED8;font-weight:700;letter-spacing:2px;">${opts.discountCode}</p>
          <p style="margin:8px 0 0;font-family:Inter,Arial,sans-serif;font-size:12px;color:#6B7280;">Share this code with clients to earn a 5% commission on every subscription payment.</p>
        </td></tr>
      </table>`
    : "";
  const body = `
    <p>Hello ${opts.name},</p>
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
  const html = buildEmailHtml({
    preheader: "Your employee account is active.",
    title: "Welcome to the Team!",
    body,
    ctaText: "Go to Employee Dashboard",
    ctaUrl: opts.dashboardUrl,
    accentColor: "#2563EB",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Welcome to the team!`,
    html,
    text: buildPlainText({
      title: "Welcome to the Team!",
      body: `Hello ${opts.name}, your employee account is now active.${opts.discountCode ? ` Your affiliate discount code is: ${opts.discountCode}.` : ""} Visit your dashboard to get started.`,
      ctaText: "Go to Employee Dashboard",
      ctaUrl: opts.dashboardUrl,
    }),
  });
}

/**
 * Welcome email for new attorneys — includes review center info and attorney dashboard link.
 */
export async function sendAttorneyWelcomeEmail(opts: {
  to: string;
  name: string;
  dashboardUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "attorney_welcome", ...opts });
  if (dispatched) return;

  const body = `
    <p>Hello ${opts.name},</p>
    <p>Welcome to <strong>${APP_NAME}</strong>. Your attorney account has been verified and you now have access to the <strong>Letter Review Center</strong>.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F3FF;border-radius:8px;margin:16px 0;border:1px solid #DDD6FE;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#5B21B6;font-weight:700;">Letter Review Center</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#6B7280;">
          The Review Center is where you will claim, edit, and approve or reject AI-generated legal letter drafts. Each letter includes jurisdiction research, a structured draft, and the subscriber intake details.
        </p>
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
  const html = buildEmailHtml({
    preheader: "Your attorney account is active.",
    title: "Welcome, Counselor!",
    body,
    ctaText: "Go to Attorney Dashboard",
    ctaUrl: opts.dashboardUrl,
    accentColor: "#7C3AED",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Welcome — your attorney account is ready!`,
    html,
    text: buildPlainText({
      title: "Welcome to Talk to My Lawyer!",
      body: `Hello ${opts.name}, your attorney account is now active. You have access to the Letter Review Center where you can claim, edit, and approve legal letter drafts.`,
      ctaText: "Go to Attorney Dashboard",
      ctaUrl: opts.dashboardUrl,
    }),
  });
}

/** Invitation email for new attorneys to set their password and join the platform */
export async function sendAttorneyInvitationEmail(opts: {
  to: string;
  name: string;
  setPasswordUrl: string;
  invitedByName?: string;
}) {
  const dispatched = await dispatchToWorker({ type: "attorney_invitation", ...opts });
  if (dispatched) return;

  const body = `
    <p>Hello ${opts.name},</p>
    <p>You have been invited to join <strong>${APP_NAME}</strong> as a <strong>Reviewing Attorney</strong>${opts.invitedByName ? ` by ${opts.invitedByName}` : ""}.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F3FF;border-radius:8px;margin:16px 0;border:1px solid #DDD6FE;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#5B21B6;font-weight:700;">What is the Letter Review Center?</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#6B7280;">
          The Review Center is where you will claim, edit, and approve or reject AI-generated legal letter drafts. Each letter includes jurisdiction research, a structured draft, and the subscriber intake details.
        </p>
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
  const html = buildEmailHtml({
    preheader: "You've been invited as a reviewing attorney.",
    title: "Attorney Invitation",
    body,
    ctaText: "Set Your Password",
    ctaUrl: opts.setPasswordUrl,
    accentColor: "#7C3AED",
  });
  await sendWithRetry({
    to: opts.to,
    subject: `[${APP_NAME}] You've been invited as a Reviewing Attorney`,
    html,
    text: buildPlainText({
      title: "Attorney Invitation",
      body: `Hello ${opts.name}, you have been invited to join ${APP_NAME} as a Reviewing Attorney. Set your password to get started and access the Letter Review Center.`,
      ctaText: "Set Your Password",
      ctaUrl: opts.setPasswordUrl,
    }),
  });
}

/**
 * Notify an employee when one of their referrals converts.
 */
export async function sendEmployeeCommissionEmail(opts: {
  to: string;
  name: string;
  subscriberName: string;
  planName: string;
  commissionAmount: string;
  discountCode: string;
  dashboardUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "employee_commission", ...opts });
  if (dispatched) return;

  const body = `
    <p>Hello ${opts.name},</p>
    <p>Great news — a client you referred just made a payment using your discount code!</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#ECFDF5;border-radius:8px;margin:16px 0;border:1px solid #A7F3D0;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#047857;font-weight:700;">Commission Earned</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Client:</strong> ${opts.subscriberName}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Plan:</strong> ${opts.planName}</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Discount Code Used:</strong> ${opts.discountCode}</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:20px;color:#059669;font-weight:700;">+${opts.commissionAmount}</p>
      </td></tr>
    </table>
    <p>Your commission has been recorded and is visible in your earnings dashboard. Keep sharing your code to earn more!</p>
  `;
  const html = buildEmailHtml({
    preheader: `You earned ${opts.commissionAmount} in commission!`,
    title: "Commission Earned!",
    body,
    ctaText: "View My Earnings",
    ctaUrl: opts.dashboardUrl,
    accentColor: "#059669",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Commission earned: ${opts.commissionAmount} from ${opts.subscriberName}`,
    html,
    text: buildPlainText({
      title: "Commission Earned!",
      body: `Hello ${opts.name}, a client (${opts.subscriberName}) just paid for the ${opts.planName} plan using your discount code (${opts.discountCode}). You earned ${opts.commissionAmount} in commission.`,
      ctaText: "View My Earnings",
      ctaUrl: opts.dashboardUrl,
    }),
  });
}

/** Confirm to employee that their payout has been approved and processed */
export async function sendPayoutCompletedEmail(opts: {
  to: string;
  name: string;
  amount: string;
  paymentMethod: string;
}) {
  const dispatched = await dispatchToWorker({ type: "payout_completed", ...opts });
  if (dispatched) return;

  const methodLabel = opts.paymentMethod.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const body = `
    <p>Hello ${opts.name},</p>
    <p>Your payout request has been <strong style="color:#059669;">approved</strong> and processed.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#ECFDF5;border-radius:8px;margin:16px 0;border:1px solid #A7F3D0;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#047857;font-weight:700;">Payout Approved</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Amount:</strong> ${opts.amount}</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Method:</strong> ${methodLabel}</p>
      </td></tr>
    </table>
    <p>The funds will be sent to you via your selected payment method. If you have any questions, please contact your administrator.</p>
  `;
  const html = buildEmailHtml({
    preheader: `Your payout of ${opts.amount} has been approved!`,
    title: "Payout Approved",
    body,
    accentColor: "#059669",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Payout approved: ${opts.amount}`,
    html,
    text: buildPlainText({
      title: "Payout Approved",
      body: `Hello ${opts.name}, your payout request of ${opts.amount} via ${methodLabel} has been approved and processed.`,
    }),
  });
}

/** Inform employee that their payout request was rejected */
export async function sendPayoutRejectedEmail(opts: {
  to: string;
  name: string;
  amount: string;
  reason: string;
}) {
  const dispatched = await dispatchToWorker({ type: "payout_rejected", ...opts });
  if (dispatched) return;

  const body = `
    <p>Hello ${opts.name},</p>
    <p>Unfortunately, your payout request has been <strong style="color:#DC2626;">rejected</strong>.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FEF2F2;border-radius:8px;margin:16px 0;border:1px solid #FECACA;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#DC2626;font-weight:700;">Payout Rejected</p>
        <p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Amount Requested:</strong> ${opts.amount}</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;"><strong>Reason:</strong> ${opts.reason}</p>
      </td></tr>
    </table>
    <p>Your pending balance has not been affected. If you believe this was in error, please contact your administrator.</p>
  `;
  const html = buildEmailHtml({
    preheader: `Your payout request of ${opts.amount} was rejected`,
    title: "Payout Rejected",
    body,
    accentColor: "#DC2626",
  });
  await sendEmail({
    to: opts.to,
    subject: `[${APP_NAME}] Payout rejected: ${opts.amount}`,
    html,
    text: buildPlainText({
      title: "Payout Rejected",
      body: `Hello ${opts.name}, your payout request of ${opts.amount} was rejected. Reason: ${opts.reason}. Your pending balance has not been affected.`,
    }),
  });
}
