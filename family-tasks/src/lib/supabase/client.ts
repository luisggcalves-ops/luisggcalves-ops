import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { browserSupabaseUrl, COOKIE_OPTIONS, SUPABASE_KEY } from "./env";

let client: SupabaseClient | undefined;

/** Singleton browser client — shares one auth session + realtime socket. */
export function getSupabase(): SupabaseClient {
  if (!client) client = createBrowserClient(browserSupabaseUrl(), SUPABASE_KEY, { cookieOptions: COOKIE_OPTIONS });
  return client;
}
