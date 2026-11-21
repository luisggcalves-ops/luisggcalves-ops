import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { uuidv7 } from "@/lib/ids";

/**
 * Fixed-window rate limit stored in Postgres, so it works across serverless
 * instances. Returns true while the caller is within the limit.
 */
export async function withinRateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowSec * 1000;
  const { rows } = await db.execute<{ count: number }>(sql`
    insert into rate_limits (id, key, count, last_request)
    values (${uuidv7()}, ${key}, 1, ${now})
    on conflict (key) do update set
      count = case when rate_limits.last_request < ${windowStart} then 1 else rate_limits.count + 1 end,
      last_request = case when rate_limits.last_request < ${windowStart} then ${now} else rate_limits.last_request end
    returning count
  `);
  return Number(rows[0]?.count ?? 0) <= max;
}
