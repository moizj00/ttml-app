/**
 * Supabase Auth — barrel re-export.
 *
 * Modules:
 *  - client.ts     — Supabase client factory + shared constants
 *  - user-cache.ts — short-lived in-memory user cache
 *  - helpers.ts    — URL validation, redirect helpers, syncGoogleUser
 *  - jwt.ts        — token extraction + authenticateRequest
 *  - routes.ts     — registerSupabaseAuthRoutes (Express route handlers)
 */
export { getOriginUrl } from "./helpers";
export { invalidateUserCache, invalidateAllUserCache } from "./user-cache";
export { authenticateRequest } from "./jwt";
export { registerSupabaseAuthRoutes } from "./routes";
