import { sql } from "drizzle-orm";
import { db, type Tx } from "./client";

export type TenantScope = {
  /** The shop being acted on. The caller must already have verified membership. */
  shopId?: string | null;
  /** The signed-in user (lets RLS show the user's own memberships across shops). */
  userId?: string | null;
};

/**
 * Runs `fn` in a transaction with the row-level security context set.
 * `set_config(..., true)` is transaction-local, so the settings can never
 * leak to another request that reuses the pooled connection.
 */
export async function withTenantTx<T>(scope: TenantScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.shop_id', ${scope.shopId ?? ""}, true), set_config('app.user_id', ${scope.userId ?? ""}, true)`,
    );
    return fn(tx);
  });
}
