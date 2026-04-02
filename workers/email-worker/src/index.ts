import { renderEmail, type RenderedEmail } from "./renderers";
import type { EmailPayload } from "./emailTypes";
import type { Env } from "./env";

const RETRY_DELAYS_MS = [2000, 5000, 10000];

async function sendViaResend(
  rendered: RenderedEmail,
  from: string,
  apiKey: string
): Promise<void> {
  const body: Record<string, unknown> = {
    from,
    to: rendered.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  };

  if (rendered.attachments && rendered.attachments.length > 0) {
    body.attachments = rendered.attachments.map((a) => ({
      filename: a.filename,
      content: bufferToBase64(a.content),
    }));
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown error");
    throw new Error(`Resend API ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as { id?: string; error?: { message: string } };
  if (data.error) {
    throw new Error(`Resend error: ${data.error.message}`);
  }

  console.log(`[EmailWorker] Sent successfully, id=${data.id ?? "unknown"}, to=${rendered.to}`);
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function sendWithRetry(
  rendered: RenderedEmail,
  from: string,
  apiKey: string
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      await sendViaResend(rendered, from, apiKey);
      return;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[EmailWorker] Send attempt ${attempt + 1} failed, to=${rendered.to}: ${msg}`);
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }
  console.error(`[EmailWorker] All retry attempts exhausted, to=${rendered.to}:`, lastErr);
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!env.EMAIL_WORKER_SECRET || !timingSafeEqual(token, env.EMAIL_WORKER_SECRET)) {
      console.warn("[EmailWorker] Unauthorized request from", request.headers.get("CF-Connecting-IP") ?? "unknown");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    let payload: EmailPayload;
    try {
      payload = (await request.json()) as EmailPayload;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!payload?.type) {
      return new Response(JSON.stringify({ error: "Missing email type" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const from = env.RESEND_FROM_EMAIL || "noreply@talk-to-my-lawyer.com";

    // Acknowledge immediately — the actual send happens in the background.
    // ctx.waitUntil keeps the Worker alive until the promise resolves, but the
    // HTTP response is returned to the caller right away (fire-and-forget).
    ctx.waitUntil(
      (async () => {
        try {
          const rendered = await renderEmail(payload, env);
          await sendWithRetry(rendered, from, env.RESEND_API_KEY);
          console.log(`[EmailWorker] Background send complete, type=${payload.type}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[EmailWorker] Background send failed, type=${payload.type}: ${msg}`);
        }
      })()
    );

    return new Response(JSON.stringify({ accepted: true, type: payload.type }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  },
};
