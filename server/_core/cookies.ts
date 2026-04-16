import type { CookieOptions, Request } from "express";

/**
 * Parse a raw Cookie header string into a key→value Map.
 * Shared by trpc.ts and supabaseAuth/jwt.ts to avoid duplication.
 */
export function parseCookieHeader(cookieHeader: string | undefined): Map<string, string> {
  if (!cookieHeader) return new Map();
  const map = new Map<string, string>();
  cookieHeader.split(";").forEach(pair => {
    const [key, ...rest] = pair.split("=");
    if (key) {
      map.set(key.trim(), decodeURIComponent(rest.join("=").trim()));
    }
  });
  return map;
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  _req: Request
): Pick<CookieOptions, "httpOnly" | "path" | "sameSite" | "secure"> {
  // CRITICAL: For SameSite: "none" to work, the cookie MUST be Secure: true.
  // Browsers (Chrome, Safari) will silently reject a SameSite: "none" cookie
  // that is not Secure. Since this app is production-only on Railway with HTTPS,
  // we force secure: true regardless of local protocol detection to ensure
  // cross-site OAuth redirects always work.
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: true,
  };
}
