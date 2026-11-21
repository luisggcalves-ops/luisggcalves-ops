import { and, eq, gt, gte, inArray, lt, lte } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { appointments, shopClosures, shopOpeningHours, timeOff, workingHours } from "@/server/db/schema";
import { addDays, shortTime, zonedTimeToUtc } from "@/lib/time";
import type { DayAvailabilityInput } from "./availability";

/**
 * Loads everything availability needs for several barbers over a date range in
 * five queries, then hands out per-barber, per-day inputs for the pure engine.
 */
export async function loadAvailabilityRange(
  tx: Tx,
  opts: { shopId: string; staffIds: string[]; fromDate: string; toDate: string; timeZone: string; excludeAppointmentId?: string },
) {
  const from = zonedTimeToUtc(opts.fromDate, 0, opts.timeZone)!;
  const to = zonedTimeToUtc(addDays(opts.toDate, 1), 0, opts.timeZone)!;
  const ids = opts.staffIds.length ? opts.staffIds : ["00000000-0000-0000-0000-000000000000"];

  const shopHours = await tx.select().from(shopOpeningHours).where(eq(shopOpeningHours.shopId, opts.shopId));
  const hours = await tx.select().from(workingHours).where(inArray(workingHours.staffMemberId, ids));
  const closures = await tx
    .select({ startsOn: shopClosures.startsOn, endsOn: shopClosures.endsOn })
    .from(shopClosures)
    .where(and(eq(shopClosures.shopId, opts.shopId), lte(shopClosures.startsOn, opts.toDate), gte(shopClosures.endsOn, opts.fromDate)));
  const off = await tx
    .select()
    .from(timeOff)
    .where(and(inArray(timeOff.staffMemberId, ids), lt(timeOff.startsAt, to), gt(timeOff.endsAt, from)));
  const busy = await tx
    .select({ id: appointments.id, staffMemberId: appointments.staffMemberId, startsAt: appointments.startsAt, blockedUntil: appointments.blockedUntil })
    .from(appointments)
    .where(
      and(
        inArray(appointments.staffMemberId, ids),
        inArray(appointments.status, ["pending", "confirmed"]),
        lt(appointments.startsAt, to),
        gt(appointments.blockedUntil, from),
      ),
    );

  const shop = shopHours.map((h) => ({ weekday: h.weekday, opensAt: shortTime(h.opensAt), closesAt: shortTime(h.closesAt) }));

  return function dayInput(staffId: string, date: string): DayAvailabilityInput {
    return {
      date,
      timeZone: opts.timeZone,
      shopHours: shop,
      staffHours: hours
        .filter((h) => h.staffMemberId === staffId)
        .map((h) => ({ weekday: h.weekday, startsAt: shortTime(h.startsAt), endsAt: shortTime(h.endsAt) })),
      closures,
      timeOff: off.filter((t) => t.staffMemberId === staffId),
      busy: busy.filter((b) => b.staffMemberId === staffId && b.id !== opts.excludeAppointmentId),
    };
  };
}
