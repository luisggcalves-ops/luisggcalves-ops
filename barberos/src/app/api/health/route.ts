import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

/**
 * Uptime check for monitoring (UptimeRobot, Better Stack, Vercel checks):
 * 200 when the app and database answer, 503 otherwise. Exposes no internals.
 */
export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return Response.json(
      { status: "ok", db: "ok", latencyMs: Date.now() - started, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ status: "degraded", db: "unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
