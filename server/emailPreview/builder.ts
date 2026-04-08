/**
 * Email Preview — HTML builder and shared types
 */
export const APP_NAME = "Talk to My Lawyer";
export const BRAND_COLOR = "#1D4ED8";
export const BRAND_DARK = "#1E3A5F";

export interface PreviewParams {
  name: string;
  subject: string;
  letterId: number;
  state: string;
  letterType: string;
  appUrl: string;
}

export type TemplateKey =
  | "submission"
  | "letter_ready"
  | "unlocked"
  | "approved"
  | "rejected"
  | "needs_changes"
  | "new_review"
  | "job_failed"
  | "status_update";

export interface TemplateDefinition {
  label: string;
  description: string;
  render: (p: PreviewParams) => { html: string; plain: string; subject: string };
}

export function buildEmailHtml(opts: {
  preheader: string;
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const cta =
    opts.ctaText && opts.ctaUrl
      ? `
    <tr>
      <td align="center" style="padding: 24px 0 8px;">
        <table border="0" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" bgcolor="${BRAND_COLOR}" style="border-radius: 8px;">
              <a href="${opts.ctaUrl}" target="_blank"
                style="display:inline-block;padding:14px 32px;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                ${opts.ctaText}
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:12px 0 0;font-family:Inter,Arial,sans-serif;font-size:13px;color:#6B7280;">
          Or copy this link: <a href="${opts.ctaUrl}" style="color:${BRAND_COLOR};">${opts.ctaUrl}</a>
        </p>
      </td>
    </tr>`
      : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:Inter,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F3F4F6;">
    ${opts.preheader}
  </div>
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#F3F4F6;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:${BRAND_DARK};padding:24px 32px;">
              <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
                ⚖️ ${APP_NAME}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <h1 style="margin:0 0 16px;font-family:Inter,Arial,sans-serif;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">
                      ${opts.title}
                    </h1>
                    <div style="font-family:Inter,Arial,sans-serif;font-size:15px;color:#374151;line-height:1.6;">
                      ${opts.body}
                    </div>
                  </td>
                </tr>
                ${cta}
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#F9FAFB;padding:20px 32px;border-top:1px solid #E5E7EB;">
              <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:12px;color:#9CA3AF;line-height:1.5;">
                ${opts.footerNote ?? `You received this email because you have an account with ${APP_NAME}.`}
                <br>This is an automated notification — please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
