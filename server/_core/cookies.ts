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
