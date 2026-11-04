import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

let client: SupabaseClient | undefined;

/** Singleton browser client — shares one auth session + realtime socket. */
export function getSupabase(): SupabaseClient {
  if (!client) client = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}
