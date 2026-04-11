/**
 * Supabase client factory and shared constants.
 *
 * Provides:
 *  - SUPER_ADMIN_EMAILS  — hard-coded whitelist (never overridable at runtime)
 *  - SUPABASE_SESSION_COOKIE — cookie name
 *  - supabaseUrl / supabaseAnonKey — env-sourced Supabase config
 *  - getAdminClient() — lazily-initialised service_role client
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPER_ADMIN_EMAILS = ["ravivo@homes.land", "moizj00@gmail.com"] as const;

export const SUPABASE_SESSION_COOKIE = "sb_session";

export const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
// SUPABASE_ANON_KEY is the canonical server-side runtime variable (set in Railway).
// VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY are Vite build-time vars
// baked into the frontend bundle — they are NOT automatically available as server
// runtime env vars on Railway, causing supabaseAnonKey to be "" in production
// and breaking the PKCE token exchange in the Google OAuth callback.
export const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let adminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("[SupabaseAuth] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClient;
}
