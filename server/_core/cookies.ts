import type { CookieOptions, Request } from "express";

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
  // SameSite=Lax is the correct setting for OAuth flows:
  // - Cookies are sent on top-level GET navigations from external sites
  //   (exactly what the OAuth callback redirect chain does)
  // - SameSite=None was being silently blocked by Chrome's third-party
  //   cookie deprecation (2024-2026), causing PKCE verifier loss
  // - Lax + Secure is the modern best practice for auth cookies
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: true,
  };
}
