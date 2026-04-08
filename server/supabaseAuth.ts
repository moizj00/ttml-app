/**
 * Supabase Auth — barrel re-export.
 *
 * Implementation is in ./supabaseAuth/:
 *  client.ts     — Supabase client factory + shared constants
 *  user-cache.ts — short-lived in-memory user cache
 *  helpers.ts    — URL validation, redirect helpers, syncGoogleUser
 *  jwt.ts        — token extraction + authenticateRequest
 *  routes.ts     — registerSupabaseAuthRoutes (Express route handlers)
 *
 * All existing callers continue to work unchanged.
 */
export * from "./supabaseAuth/index";
