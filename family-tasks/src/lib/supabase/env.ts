export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * When the app is served through scripts/preview-proxy.mjs, the browser
 * reaches Supabase on the page's own origin while the server talks to it
 * directly. A fixed cookie name keeps the session shared between the two.
 */
export const SAME_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_SAME_ORIGIN === "1";
export const COOKIE_OPTIONS = { name: "sb-hearth-auth-token" };

export function browserSupabaseUrl() {
  return SAME_ORIGIN && typeof window !== "undefined" ? window.location.origin : SUPABASE_URL;
}
