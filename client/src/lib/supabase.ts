import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

// ─── Supabase client singleton (frontend only) ────────────────────────────────
// Used exclusively for Realtime subscriptions. All data queries go through tRPC.
// The publishable/anon key is safe to expose in the browser — RLS policies
// enforce row-level access on the database side.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY
) as string;

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseKey) return null;
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseKey, {
      realtime: {
        params: { eventsPerSecond: 10 },
      },
      auth: {
        // Auth is handled server-side via Supabase Auth — disable client-side session management
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return _client;
}

// ─── Channel registry to avoid duplicate subscriptions ────────────────────────
const activeChannels = new Map<string, RealtimeChannel>();

export function getOrCreateChannel(key: string, factory: (client: SupabaseClient) => RealtimeChannel): RealtimeChannel | null {
  const client = getSupabaseClient();
  if (!client) return null;
  if (activeChannels.has(key)) return activeChannels.get(key)!;
  const channel = factory(client);
  activeChannels.set(key, channel);
  return channel;
}

export function removeChannel(key: string): void {
  const client = getSupabaseClient();
  const channel = activeChannels.get(key);
  if (client && channel) {
    client.removeChannel(channel);
    activeChannels.delete(key);
  }
}
