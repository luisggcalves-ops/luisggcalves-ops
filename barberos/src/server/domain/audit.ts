import type { Tx } from "@/server/db/client";
import { auditLog } from "@/server/db/schema";

export async function audit(
  tx: Tx,
  entry: {
    shopId: string;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    changes?: Record<string, unknown>;
  },
) {
  await tx.insert(auditLog).values({
    shopId: entry.shopId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    changes: entry.changes ?? null,
  });
}
