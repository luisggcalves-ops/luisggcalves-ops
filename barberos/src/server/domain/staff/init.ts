import { and, eq } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { services, shopOpeningHours, staffServices, workingHours } from "@/server/db/schema";

/**
 * Gives a new barber profile sensible defaults: the shop's opening hours as
 * working hours, and every active service. Owners adjust both afterwards.
 */
export async function initStaffProfile(tx: Tx, shopId: string, staffMemberId: string) {
  const hours = await tx.select().from(shopOpeningHours).where(eq(shopOpeningHours.shopId, shopId));
  if (hours.length) {
    await tx.insert(workingHours).values(
      hours.map((h) => ({ shopId, staffMemberId, weekday: h.weekday, startsAt: h.opensAt, endsAt: h.closesAt })),
    );
  }
  const active = await tx
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.shopId, shopId), eq(services.active, true)));
  if (active.length) {
    await tx.insert(staffServices).values(active.map((s) => ({ shopId, staffMemberId, serviceId: s.id })));
  }
}
