import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenantTx } from "@/server/db/tenant";
import type { Tx } from "@/server/db/client";
import {
  services,
  shopMemberships,
  shops,
  staffMembers,
  staffServices,
  timeOff,
  users,
  workingHours,
} from "@/server/db/schema";
import { assertCan } from "@/server/authz/permissions";
import { conflict, DomainError, forbidden, notFound } from "@/server/errors";
import {
  newStaffProfileSchema,
  staffProfileSchema,
  staffServiceAssignmentSchema,
  timeOffSchema,
  workingHoursSchema,
} from "@/lib/validation/scheduling";
import { addDays, shortTime, timeToMinutes, zonedTimeToUtc } from "@/lib/time";
import type { ActorContext } from "../context";
import { audit } from "../audit";
import { parseInput } from "../validate";
import { initStaffProfile } from "./init";

/** The barber profile linked to the actor's membership, if any. */
export async function ownStaffMemberId(tx: Tx, ctx: ActorContext): Promise<string | null> {
  const [row] = await tx
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .where(and(eq(staffMembers.shopId, ctx.shopId), eq(staffMembers.membershipId, ctx.membershipId)));
  return row?.id ?? null;
}

/**
 * Barber profiles. A profile is "active" only if the profile itself is active
 * and (when linked to a login) the membership is active too.
 */
export async function listStaff(ctx: ActorContext, opts: { includeInactive?: boolean } = {}) {
  return withTenantTx(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: staffMembers.id,
        displayName: staffMembers.displayName,
        calendarColor: staffMembers.calendarColor,
        isBookable: staffMembers.isBookable,
        active: staffMembers.active,
        membershipId: staffMembers.membershipId,
        role: shopMemberships.role,
        membershipStatus: shopMemberships.status,
        email: users.email,
        serviceCount: sql<number>`(select count(*)::int from staff_services ss
          join services s on s.id = ss.service_id where ss.staff_member_id = "staff_members"."id" and s.active)`,
      })
      .from(staffMembers)
      .leftJoin(shopMemberships, eq(shopMemberships.id, staffMembers.membershipId))
      .leftJoin(users, eq(users.id, shopMemberships.userId))
      .where(eq(staffMembers.shopId, ctx.shopId))
      .orderBy(asc(staffMembers.sortOrder), asc(staffMembers.displayName));
    const withStatus = rows.map((r) => ({
      ...r,
      isActive: r.active && (r.membershipStatus === null || r.membershipStatus === "active"),
    }));
    return opts.includeInactive ? withStatus : withStatus.filter((r) => r.isActive);
  });
}

export type StaffRow = Awaited<ReturnType<typeof listStaff>>[number];

export async function getStaffProfile(ctx: ActorContext, staffMemberId: unknown) {
  assertCan(ctx.role, "staff.view");
  const id = parseInput(z.uuid(), staffMemberId);
  return withTenantTx(ctx, async (tx) => {
    const [profile] = await tx
      .select({
        id: staffMembers.id,
        displayName: staffMembers.displayName,
        bio: staffMembers.bio,
        calendarColor: staffMembers.calendarColor,
        isBookable: staffMembers.isBookable,
        active: staffMembers.active,
        membershipId: staffMembers.membershipId,
        role: shopMemberships.role,
        membershipStatus: shopMemberships.status,
        email: users.email,
      })
      .from(staffMembers)
      .leftJoin(shopMemberships, eq(shopMemberships.id, staffMembers.membershipId))
      .leftJoin(users, eq(users.id, shopMemberships.userId))
      .where(eq(staffMembers.id, id));
    if (!profile) throw notFound("Barber not found.");

    const hours = await tx
      .select({ weekday: workingHours.weekday, opensAt: workingHours.startsAt, closesAt: workingHours.endsAt })
      .from(workingHours)
      .where(eq(workingHours.staffMemberId, id))
      .orderBy(asc(workingHours.weekday), asc(workingHours.startsAt));

    const allServices = await tx
      .select({
        id: services.id,
        name: services.name,
        durationMin: services.durationMin,
        priceCents: services.priceCents,
        offered: sql<boolean>`${staffServices.serviceId} is not null`,
        priceCentsOverride: staffServices.priceCentsOverride,
        durationMinOverride: staffServices.durationMinOverride,
      })
      .from(services)
      .leftJoin(staffServices, and(eq(staffServices.serviceId, services.id), eq(staffServices.staffMemberId, id)))
      .where(and(eq(services.shopId, ctx.shopId), eq(services.active, true)))
      .orderBy(asc(services.sortOrder), asc(services.name));

    const upcomingTimeOff = await tx
      .select()
      .from(timeOff)
      .where(and(eq(timeOff.staffMemberId, id), gte(timeOff.endsAt, new Date())))
      .orderBy(asc(timeOff.startsAt));

    return {
      profile: {
        ...profile,
        isActive: profile.active && (profile.membershipStatus === null || profile.membershipStatus === "active"),
      },
      hours: hours.map((h) => ({ ...h, opensAt: shortTime(h.opensAt), closesAt: shortTime(h.closesAt) })),
      services: allServices,
      timeOff: upcomingTimeOff,
    };
  });
}

/**
 * Creates a barber profile: either for a team member who signs in (membershipId),
 * or for a barber who doesn't use the app (no login).
 */
export async function createStaffProfile(ctx: ActorContext, input: unknown): Promise<{ staffMemberId: string }> {
  assertCan(ctx.role, "staff.manage");
  const data = parseInput(newStaffProfileSchema, input);
  return withTenantTx(ctx, async (tx) => {
    if (data.membershipId) {
      const [m] = await tx.select().from(shopMemberships).where(eq(shopMemberships.id, data.membershipId));
      if (!m) throw notFound("Team member not found.");
      const [existing] = await tx
        .select({ id: staffMembers.id })
        .from(staffMembers)
        .where(eq(staffMembers.membershipId, data.membershipId));
      if (existing) throw conflict("This team member already has a barber profile.");
    }
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${staffMembers.sortOrder}), 0) + 1` })
      .from(staffMembers)
      .where(eq(staffMembers.shopId, ctx.shopId));
    const [staff] = await tx
      .insert(staffMembers)
      .values({
        shopId: ctx.shopId,
        membershipId: data.membershipId ?? null,
        displayName: data.displayName,
        bio: data.bio,
        calendarColor: data.calendarColor,
        isBookable: data.isBookable,
        sortOrder: next,
      })
      .returning({ id: staffMembers.id });
    await initStaffProfile(tx, ctx.shopId, staff.id);
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: "staff.created",
      entityType: "staff_member",
      entityId: staff.id,
      changes: { displayName: data.displayName, linkedToLogin: !!data.membershipId },
    });
    return { staffMemberId: staff.id };
  });
}

async function loadStaff(tx: Tx, id: string) {
  const [staff] = await tx.select().from(staffMembers).where(eq(staffMembers.id, id));
  if (!staff) throw notFound("Barber not found.");
  return staff;
}

export async function updateStaffProfile(ctx: ActorContext, staffMemberId: unknown, input: unknown) {
  assertCan(ctx.role, "staff.manage");
  const id = parseInput(z.uuid(), staffMemberId);
  const data = parseInput(staffProfileSchema, input);
  await withTenantTx(ctx, async (tx) => {
    await loadStaff(tx, id);
    await tx
      .update(staffMembers)
      .set({ displayName: data.displayName, bio: data.bio, calendarColor: data.calendarColor, isBookable: data.isBookable })
      .where(eq(staffMembers.id, id));
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: "staff.updated",
      entityType: "staff_member",
      entityId: id,
      changes: data,
    });
  });
}

/** Only profiles without a login are (de)activated here. Members follow their membership status. */
export async function setStaffActive(ctx: ActorContext, staffMemberId: unknown, active: boolean) {
  assertCan(ctx.role, "staff.manage");
  const id = parseInput(z.uuid(), staffMemberId);
  await withTenantTx(ctx, async (tx) => {
    const staff = await loadStaff(tx, id);
    if (staff.membershipId) {
      throw forbidden("This barber signs in to BarberOS. Deactivate them from the team list instead.");
    }
    await tx.update(staffMembers).set({ active }).where(eq(staffMembers.id, id));
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: active ? "staff.reactivated" : "staff.deactivated",
      entityType: "staff_member",
      entityId: id,
    });
  });
}

export async function replaceWorkingHours(ctx: ActorContext, staffMemberId: unknown, input: unknown) {
  assertCan(ctx.role, "staff.manage");
  const id = parseInput(z.uuid(), staffMemberId);
  const hours = parseInput(workingHoursSchema, input);
  await withTenantTx(ctx, async (tx) => {
    await loadStaff(tx, id);
    await tx.delete(workingHours).where(eq(workingHours.staffMemberId, id));
    if (hours.length) {
      await tx.insert(workingHours).values(
        hours.map((h) => ({
          shopId: ctx.shopId,
          staffMemberId: id,
          weekday: h.weekday,
          startsAt: h.opensAt,
          endsAt: h.closesAt,
        })),
      );
    }
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: "staff.hours_updated",
      entityType: "staff_member",
      entityId: id,
      changes: { hours },
    });
  });
}

/** Sets which services a barber offers, with optional price/duration overrides. */
export async function setStaffServices(ctx: ActorContext, staffMemberId: unknown, input: unknown) {
  assertCan(ctx.role, "staff.manage");
  const id = parseInput(z.uuid(), staffMemberId);
  const rows = parseInput(staffServiceAssignmentSchema, input);
  await withTenantTx(ctx, async (tx) => {
    await loadStaff(tx, id);
    const ids = rows.map((r) => r.serviceId);
    if (ids.length) {
      const valid = await tx.select({ id: services.id }).from(services).where(inArray(services.id, ids));
      if (valid.length !== new Set(ids).size) throw new DomainError("VALIDATION", "One of the services wasn't found.");
    }
    await tx.delete(staffServices).where(eq(staffServices.staffMemberId, id));
    if (rows.length) {
      await tx.insert(staffServices).values(
        rows.map((r) => ({
          shopId: ctx.shopId,
          staffMemberId: id,
          serviceId: r.serviceId,
          priceCentsOverride: r.price,
          durationMinOverride: r.durationMin,
        })),
      );
    }
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: "staff.services_updated",
      entityType: "staff_member",
      entityId: id,
      changes: { services: rows },
    });
  });
}

async function shopTimeZone(tx: Tx, shopId: string) {
  const [shop] = await tx.select({ timezone: shops.timezone }).from(shops).where(eq(shops.id, shopId));
  if (!shop) throw notFound("Shop not found.");
  return shop.timezone;
}

/** Records time off. Whole days are converted to instants in the shop's time zone. */
export async function addTimeOff(ctx: ActorContext, staffMemberId: unknown, input: unknown) {
  assertCan(ctx.role, "staff.manage");
  const id = parseInput(z.uuid(), staffMemberId);
  const data = parseInput(timeOffSchema, input);
  return withTenantTx(ctx, async (tx) => {
    await loadStaff(tx, id);
    const tz = await shopTimeZone(tx, ctx.shopId);
    const startsAt = data.allDay
      ? zonedTimeToUtc(data.startsOn, 0, tz)
      : zonedTimeToUtc(data.startsOn, timeToMinutes(data.startTime!), tz);
    const endsAt = data.allDay
      ? zonedTimeToUtc(addDays(data.endsOn, 1), 0, tz)
      : zonedTimeToUtc(data.endsOn, timeToMinutes(data.endTime!), tz);
    if (!startsAt || !endsAt || endsAt <= startsAt) {
      throw new DomainError("VALIDATION", "Please check the dates and times.", { endsOn: "Invalid range" });
    }
    const [row] = await tx
      .insert(timeOff)
      .values({ shopId: ctx.shopId, staffMemberId: id, startsAt, endsAt, type: data.type, note: data.note })
      .returning({ id: timeOff.id });
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: "staff.time_off_added",
      entityType: "time_off",
      entityId: row.id,
      changes: { staffMemberId: id, startsAt, endsAt, type: data.type },
    });
    return { timeOffId: row.id };
  });
}

export async function deleteTimeOff(ctx: ActorContext, timeOffId: unknown) {
  assertCan(ctx.role, "staff.manage");
  const id = parseInput(z.uuid(), timeOffId);
  await withTenantTx(ctx, async (tx) => {
    const [row] = await tx.delete(timeOff).where(eq(timeOff.id, id)).returning();
    if (!row) throw notFound("Time off not found.");
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: "staff.time_off_removed",
      entityType: "time_off",
      entityId: id,
      changes: { staffMemberId: row.staffMemberId, startsAt: row.startsAt, endsAt: row.endsAt },
    });
  });
}
