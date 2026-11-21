import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { env } from "@/server/env";

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that can run queries: the root db or an open transaction. */
export type Executor = Database | Tx;

const globalForDb = globalThis as unknown as { __barberosPool?: Pool };

// Reuse one pool across hot reloads in development.
const pool =
  globalForDb.__barberosPool ??
  new Pool({ connectionString: env().DATABASE_URL, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
if (process.env.NODE_ENV !== "production") globalForDb.__barberosPool = pool;

export const db: Database = drizzle(pool, { schema, casing: "snake_case" });
export { pool };
