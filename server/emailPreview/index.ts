/**
 * Dev-only Email Preview Route
 *
 * Renders any transactional email template directly in the browser for visual QA.
 * ONLY active when NODE_ENV !== "production".
 *
 * Routes:
 *   GET /api/dev/email-preview          → index page listing all templates
 *   GET /api/dev/email-preview?type=X   → renders template X as HTML
 *
 * Internal structure:
 *   builder.ts    — HTML builder, shared types
 *   templates.ts  — All 9 email template definitions
 */
import type { Express, Request, Response } from "express";
import { APP_NAME, type TemplateKey, type TemplateDefinition } from "./builder";
import { TEMPLATES } from "./templates";

// ─── Index page ───────────────────────────────────────────────────────────────
function buildIndexPage(baseUrl: string): string {
  const rows = (Object.entries(TEMPLATES) as [TemplateKey, TemplateDefinition][])
    .map(([key, def]) => {
      const previewUrl = `${baseUrl}?type=${key}`;
      const plainUrl = `${baseUrl}?type=${key}&mode=plain`;
      return `
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid #E5E7EB;">
            <strong style="font-size:15px;color:#111827;">${def.label}</strong>
            <br><span style="font-size:13px;color:#6B7280;">${def.description}</span>
          </td>
          <td style="padding:14px 16px;border-bottom:1px solid #E5E7EB;white-space:nowrap;">
            <a href="${previewUrl}" target="_blank"
              style="display:inline-block;padding:6px 14px;background:#1D4ED8;color:#fff;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;margin-right:8px;">
              HTML
            </a>
            <a href="${plainUrl}" target="_blank"
              style="display:inline-block;padding:6px 14px;background:#374151;color:#fff;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;">
              Plain
            </a>
          </td>
        </tr>`;
    })
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Template Preview — ${APP_NAME}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px 24px; background: #F3F4F6; font-family: Inter, system-ui, Arial, sans-serif; color: #111827; }
    h1 { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
    .subtitle { font-size: 14px; color: #6B7280; margin: 0 0 32px; }
    .badge { display: inline-block; padding: 3px 10px; background: #FEF3C7; color: #92400E; border-radius: 99px; font-size: 12px; font-weight: 600; margin-left: 10px; vertical-align: middle; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 12px 16px; background: #F9FAFB; font-size: 12px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #E5E7EB; }
    .params { margin-top: 24px; background: #fff; border-radius: 12px; padding: 20px 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .params h2 { font-size: 16px; font-weight: 600; margin: 0 0 12px; }
    code { background: #F3F4F6; padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: 'JetBrains Mono', 'Fira Code', monospace; }
    .param-row { display: flex; gap: 16px; margin-bottom: 8px; font-size: 14px; }
    .param-name { font-weight: 600; min-width: 100px; color: #1D4ED8; }
    .param-desc { color: #374151; }
  </style>
</head>
<body>
  <h1>⚖️ ${APP_NAME} <span class="badge">DEV ONLY</span></h1>
  <p class="subtitle">Email template preview — not accessible in production</p>
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>Template</th>
          <th>Preview</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="params">
    <h2>Customise preview data</h2>
    <p style="font-size:14px;color:#6B7280;margin:0 0 16px;">Append any of these query params to the preview URL to use custom data:</p>
    <div class="param-row"><span class="param-name">name</span><span class="param-desc">Recipient name &nbsp;<code>?name=John+Doe</code></span></div>
    <div class="param-row"><span class="param-name">subject</span><span class="param-desc">Letter subject &nbsp;<code>?subject=Breach+of+Contract</code></span></div>
    <div class="param-row"><span class="param-name">letterId</span><span class="param-desc">Letter ID &nbsp;<code>?letterId=99</code></span></div>
    <div class="param-row"><span class="param-name">state</span><span class="param-desc">Jurisdiction state &nbsp;<code>?state=TX</code></span></div>
    <div class="param-row"><span class="param-name">letterType</span><span class="param-desc">Letter type slug &nbsp;<code>?letterType=cease-and-desist</code></span></div>
    <div class="param-row"><span class="param-name">mode</span><span class="param-desc">Output mode &nbsp;<code>?mode=plain</code> (default: html)</span></div>
  </div>
</body>
</html>`;
}

function buildQuerySuffix(
  query: Record<string, unknown>,
  exclude: string[]
): string {
  return Object.entries(query)
    .filter(([k]) => !exclude.includes(k))
    .map(
      ([k, v]) =>
        `&${encodeURIComponent(k)}=${encodeURIComponent(String(v ?? ""))}`
    )
    .join("");
}

// ─── Route registration ───────────────────────────────────────────────────────
export function registerEmailPreviewRoute(app: Express): void {
  if (process.env.NODE_ENV === "production") return;

  app.get("/api/dev/email-preview", (req: Request, res: Response) => {
    const type = req.query.type as string | undefined;
    const mode = (req.query.mode as string | undefined) ?? "html";

    // Build preview params from query string with sensible defaults
    const params = {
      name: (req.query.name as string) || "Jane Smith",
      subject:
        (req.query.subject as string) ||
        "Breach of Lease Agreement — 123 Main St",
      letterId: parseInt((req.query.letterId as string) || "42", 10),
      state: (req.query.state as string) || "CA",
      letterType: (req.query.letterType as string) || "demand-letter",
      appUrl: `${req.protocol}://${req.headers.host}`,
    };

    // No type → render index
    if (!type) {
      const baseUrl = `${params.appUrl}/api/dev/email-preview`;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(buildIndexPage(baseUrl));
      return;
    }

    const template = TEMPLATES[type as TemplateKey];
    if (!template) {
      res
        .status(404)
        .send(
          `Unknown template type "${type}". Available: ${Object.keys(TEMPLATES).join(", ")}`
        );
      return;
    }

    const rendered = template.render(params);

    if (mode === "plain") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(`Subject: ${rendered.subject}\n\n${rendered.plain}`);
      return;
    }

    // Wrap HTML output in a dev toolbar so the subject line is visible
    const toolbar = `
      <div style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#1E3A5F;color:#fff;padding:10px 20px;font-family:Inter,system-ui,sans-serif;font-size:13px;display:flex;align-items:center;gap:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
        <span style="font-weight:700;font-size:14px;">⚖️ Email Preview</span>
        <span style="background:#FEF3C7;color:#92400E;padding:2px 10px;border-radius:99px;font-weight:600;">DEV ONLY</span>
        <span style="color:#93C5FD;">Template: <strong style="color:#fff;">${template.label}</strong></span>
        <span style="color:#93C5FD;">Subject: <em style="color:#E0F2FE;">${rendered.subject}</em></span>
        <span style="margin-left:auto;">
          <a href="?type=${type}&mode=plain${buildQuerySuffix(req.query as Record<string, unknown>, ["type", "mode"])}" style="color:#93C5FD;text-decoration:none;margin-right:12px;">View Plain Text</a>
          <a href="?" style="color:#93C5FD;text-decoration:none;">← All Templates</a>
        </span>
      </div>
      <div style="height:44px;"></div>`;

    const finalHtml = rendered.html.replace(/(<body[^>]*>)/, `$1${toolbar}`);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(finalHtml);
  });
}
