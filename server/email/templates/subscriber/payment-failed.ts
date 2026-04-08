import { dispatchToWorker, buildEmailHtml, buildPlainText, sendWithRetry, APP_NAME } from "../../core";

/** Notify user that a payment failed */
export async function sendPaymentFailedEmail(opts: {
  to: string;
  name: string;
  letterSubject?: string;
  billingUrl: string;
}) {
  const dispatched = await dispatchToWorker({ type: "payment_failed", ...opts });
  if (dispatched) return;

  const body = `
    <p>Hello ${opts.name},</p>
    <p>We were unable to process your most recent payment${opts.letterSubject ? ` for "<strong>${opts.letterSubject}</strong>"` : ""}.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#FEF2F2;border-radius:8px;margin:16px 0;border:1px solid #FECACA;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#DC2626;font-weight:700;">Payment Failed</p>
        <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#374151;">Please update your payment method to continue using ${APP_NAME}. If your payment method is not updated, your subscription may be canceled.</p>
      </td></tr>
    </table>
    <p>If you believe this is an error, please check with your bank or try a different payment method.</p>
  `;
  const html = buildEmailHtml({
    preheader: "Your payment could not be processed. Please update your payment method.",
    title: "Payment Failed",
    body,
    ctaText: "Update Payment Method",
    ctaUrl: opts.billingUrl,
    accentColor: "#DC2626",
  });
  await sendWithRetry({
    to: opts.to,
    subject: `[${APP_NAME}] Payment failed — please update your payment method`,
    html,
    text: buildPlainText({
      title: "Payment Failed",
      body: `Hello ${opts.name}, your payment${opts.letterSubject ? ` for "${opts.letterSubject}"` : ""} could not be processed. Please update your payment method at: ${opts.billingUrl}`,
      ctaText: "Update Payment Method",
      ctaUrl: opts.billingUrl,
    }),
  });
}
