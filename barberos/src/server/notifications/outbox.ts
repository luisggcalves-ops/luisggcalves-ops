import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { db } from "@/server/db/client";
import { withTenantTx } from "@/server/db/tenant";
import { notificationOutbox } from "@/server/db/schema";
import { renderTemplate, type BookingPayload } from "./templates";
import { sendEmail } from "./mailer";

const MAX_ATTEMPTS = 5;

/** Queues a message in the caller's transaction, so it exists only if the change commits. */
export async function enqueueEmail(
  tx: Tx,
  msg: { shopId: string; recipient: string; template: string; payload: BookingPayload; scheduledFor?: Date },
) {
  await tx.insert(notificationOutbox).values({
    shopId: msg.shopId,
    recipient: msg.recipient,
    template: msg.template,
    payload: msg.payload,
    scheduledFor: msg.scheduledFor ?? new Date(),
  });
}

/**
 * Sends a shop's due messages. Rows are locked with SKIP LOCKED, so parallel
 * workers never send the same email twice. Failures back off exponentially.
 */
export async function deliverDueForShop(shopId: string, limit = 25): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  await withTenantTx({ shopId }, async (tx) => {
    const due = await tx
      .select()
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.status, "pending"), lte(notificationOutbox.scheduledFor, new Date())))
      .orderBy(asc(notificationOutbox.scheduledFor))
      .limit(limit)
      .for("update", { skipLocked: true });
    for (const msg of due) {
      try {
        const { subject, text } = renderTemplate(msg.template, msg.payload);
        await sendEmail({ to: msg.recipient, subject, text });
        await tx
          .update(notificationOutbox)
          .set({ status: "sent", sentAt: new Date(), attempts: msg.attempts + 1, lastError: null })
          .where(eq(notificationOutbox.id, msg.id));
        sent++;
      } catch (err) {
        const attempts = msg.attempts + 1;
        await tx
          .update(notificationOutbox)
          .set({
            attempts,
            status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
            scheduledFor: new Date(Date.now() + 2 ** attempts * 60_000),
            lastError: err instanceof Error ? err.message.slice(0, 300) : "unknown error",
          })
          .where(eq(notificationOutbox.id, msg.id));
        failed++;
      }
    }
  });
  return { sent, failed };
}

/** Worker entry point (cron): delivers due messages for every shop that has some. */
export async function deliverAllDue(maxShops = 50) {
  const { rows } = await db.execute<{ app_outbox_due_shops: string }>(sql`select app_outbox_due_shops(${maxShops})`);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const r = await deliverDueForShop(row.app_outbox_due_shops);
    sent += r.sent;
    failed += r.failed;
  }
  return { shops: rows.length, sent, failed };
}
