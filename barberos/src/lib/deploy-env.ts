/**
 * Deployment conveniences, so hosting needs as few settings as possible.
 *
 * - DATABASE_URL: if not given, it's derived from MIGRATION_DATABASE_URL (the owner
 *   connection) by swapping in the restricted app login (APP_DB_USER, default
 *   "barberos_web", and APP_DB_PASSWORD). That login is created on deploy by
 *   scripts/deploy-setup.ts. The app still never runs as the owner.
 * - BETTER_AUTH_URL: if not given on Vercel, the production URL Vercel provides is used.
 */
export const DEFAULT_APP_DB_USER = "barberos_web";

export function deriveAppDatabaseUrl(e: Record<string, string | undefined>): string | undefined {
  if (e.DATABASE_URL) return e.DATABASE_URL;
  if (!e.MIGRATION_DATABASE_URL || !e.APP_DB_PASSWORD) return undefined;
  const url = new URL(e.MIGRATION_DATABASE_URL);
  url.username = e.APP_DB_USER || DEFAULT_APP_DB_USER;
  url.password = e.APP_DB_PASSWORD;
  return url.toString();
}

export function resolveBaseUrl(e: Record<string, string | undefined>): string | undefined {
  if (e.BETTER_AUTH_URL) return e.BETTER_AUTH_URL;
  if (e.VERCEL_PROJECT_PRODUCTION_URL) return `https://${e.VERCEL_PROJECT_PRODUCTION_URL}`;
  return undefined;
}
