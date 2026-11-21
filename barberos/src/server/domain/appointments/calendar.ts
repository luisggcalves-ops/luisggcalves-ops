import { and, asc, eq, gt, gte, lt, lte } from "drizzle-orm";
import { withTenantTx } from "@/server/db/tenant";
import { sequential } from "@/server/db/sequential";
import { shopClosures, shopOpeningHours, staffMembers, timeOff, workingHours } from "@/server/db/schema";
import { can } from "@/server/authz/permissions";
import { shortTime } from "@/lib/time";
import type { ActorContext } from "../context";
import { ownStaffMemberId } from "../staff/service";

/**
 * Everything the calendar grid needs besides the appointments themselves:
 * which barbers to show, when each one works, time off, and shop closures.
 */
export async function getCalendarContext(
  ctx: ActorContext,
  range: { from: Date; to: Date; fromDate: string; toDate: string },
) {
  return withTenantTx(ctx, async (tx) => {
    const own = await ownStaffMemberId(tx, ctx);
    const all = can(ctx.role, "appointments.view_all");
    const staff = await tx
      .select({
        id: staffMembers.id,
        displayName: staffMembers.displayName,
        calendarColor: staffMembers.calendarColor,
        isBookable: staffMembers.isBookable,
      })
      .from(staffMembers)
      .where(
        and(
          eq(staffMembers.shopId, ctx.shopId),
          eq(staffMembers.active, true),
          all ? undefined : eq(staffMembers.id, own ?? "00000000-0000-0000-0000-000000000000"),
        ),
      )
      .orderBy(asc(staffMembers.sortOrder), asc(staffMembers.displayName));
    const [hours, shopHours, off, closures] = await sequential([
      () => tx.select().from(workingHours).where(eq(workingHours.shopId, ctx.shopId)),
      () => tx.select().from(shopOpeningHours).where(eq(shopOpeningHours.shopId, ctx.shopId)),
      () =>
        tx
          .select()
          .from(timeOff)
          .where(and(eq(timeOff.shopId, ctx.shopId), lt(timeOff.startsAt, range.to), gt(timeOff.endsAt, range.from))),
      () =>
        tx
          .select()
          .from(shopClosures)
          .where(
            and(
              eq(shopClosures.shopId, ctx.shopId),
              lte(shopClosures.startsOn, range.toDate),
              gte(shopClosures.endsOn, range.fromDate),
            ),
          ),
    ] as const);
    const staffIds = new Set(staff.map((s) => s.id));
    return {
      staff,
      ownStaffId: own,
      workingHours: hours
        .filter((h) => staffIds.has(h.staffMemberId))
        .map((h) => ({
          staffMemberId: h.staffMemberId,
          weekday: h.weekday,
          startsAt: shortTime(h.startsAt),
          endsAt: shortTime(h.endsAt),
        })),
      shopHours: shopHours.map((h) => ({
        weekday: h.weekday,
        opensAt: shortTime(h.opensAt),
        closesAt: shortTime(h.closesAt),
      })),
      timeOff: off.filter((t) => staffIds.has(t.staffMemberId)),
      closures,
    };
  });
}

export type CalendarContext = Awaited<ReturnType<typeof getCalendarContext>>;
