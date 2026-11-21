import { and, asc, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenantTx } from "@/server/db/tenant";
import { sequential } from "@/server/db/sequential";
import type { Tx } from "@/server/db/client";
import {
  appointmentEvents,
  appointments,
  customers,
  services,
  shopClosures,
  shopOpeningHours,
  shops,
  shopSettings,
  staffMembers,
  staffServices,
  timeOff,
  workingHours,
  type AppointmentStatus,
} from "@/server/db/schema";
import { can } from "@/server/authz/permissions";
import { conflict, DomainError, forbidden, invalidState, notFound } from "@/server/errors";
import {
  createAppointmentSchema,
  dateSchema,
  notesSchema,
  rescheduleSchema,
  statusChangeSchema,
} from "@/lib/validation/scheduling";
import { addDays, shortTime, timeToMinutes, zonedTimeToUtc } from "@/lib/time";
import type { ActorContext } from "../context";
import { audit } from "../audit";
import { parseInput } from "../validate";
import { ownStaffMemberId } from "../staff/service";
import { findOrCreateCustomer } from "../customers/service";
import { availableSlots, checkSlot, type DayAvailabilityInput } from "../scheduling/availability";
import { enqueueEmail } from "@/server/notifications/outbox";
import { formatMoney } from "@/lib/money";
import { formatClock, formatDateLabel, zonedDate } from "@/lib/time";

/** Tells the customer (if we have their email) that staff cancelled or moved their booking. */
async function notifyCustomer(
  tx: Tx,
  shopId: string,
  appt: { customerId: string; staffMemberId: string; serviceName: string; startsAt: Date; priceCents: number },
  template: "booking_cancelled" | "booking_rescheduled",
  previousStartsAt?: Date,
) {
  const [c] = await tx.select({ email: customers.email, name: customers.fullName }).from(customers).where(eq(customers.id, appt.customerId));
  if (!c?.email) return;
  const [shop] = await tx.select().from(shops).where(eq(shops.id, shopId));
  const [staff] = await tx.select({ name: staffMembers.displayName }).from(staffMembers).where(eq(staffMembers.id, appt.staffMemberId));
  const when = (d: Date) => `${formatDateLabel(zonedDate(d, shop.timezone))} at ${formatClock(d, shop.timezone)}`;
  await enqueueEmail(tx, {
    shopId,
    recipient: c.email,
    template,
    payload: {
      shopName: shop.name,
      shopPhone: shop.phone,
      shopAddress: [shop.addressLine, shop.city].filter(Boolean).join(", ") || null,
      customerName: c.name,
      serviceName: appt.serviceName,
      staffName: staff?.name ?? "",
      whenLabel: when(appt.startsAt),
      priceLabel: formatMoney(appt.priceCents, shop.currency),
      manageUrl: "",
      previousWhenLabel: previousStartsAt ? when(previousStartsAt) : undefined,
    },
  });
}

/* ------------------------------------------------------------------------ */
/* Status machine                                                            */
/* ------------------------------------------------------------------------ */

export const ACTIVE_STATUSES: AppointmentStatus[] = ["pending", "confirmed"];

const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["confirmed", "cancelled", "no_show"],
  confirmed: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: AppointmentStatus): AppointmentStatus[] {
  return TRANSITIONS[from];
}

/* ------------------------------------------------------------------------ */
/* Access                                                                    */
/* ------------------------------------------------------------------------ */

type Access = { all: boolean; ownStaffId: string | null };

async function accessFor(tx: Tx, ctx: ActorContext): Promise<Access> {
  const ownStaffId = await ownStaffMemberId(tx, ctx);
  if (can(ctx.role, "appointments.manage")) return { all: true, ownStaffId };
  if (can(ctx.role, "appointments.manage_own") && ownStaffId) return { all: false, ownStaffId };
  throw forbidden();
}

function assertStaffAllowed(access: Access, staffMemberId: string) {
  if (!access.all && access.ownStaffId !== staffMemberId) {
    throw forbidden("You can only manage your own appointments.");
  }
}

/* ------------------------------------------------------------------------ */
/* Shared loaders                                                            */
/* ------------------------------------------------------------------------ */

async function loadShop(tx: Tx, shopId: string) {
  const [row] = await tx
    .select({ timezone: shops.timezone, slotIntervalMin: shopSettings.slotIntervalMin })
    .from(shops)
    .innerJoin(shopSettings, eq(shopSettings.shopId, shops.id))
    .where(eq(shops.id, shopId));
  if (!row) throw notFound("Shop not found.");
  return row;
}

/** Everything the availability engine needs for one barber on one day. */
async function loadDayInput(
  tx: Tx,
  shopId: string,
  staffMemberId: string,
  date: string,
  timeZone: string,
  excludeAppointmentId?: string,
): Promise<DayAvailabilityInput> {
  const dayStart = zonedTimeToUtc(date, 0, timeZone) ?? new Date(`${date}T00:00:00Z`);
  const dayEnd = zonedTimeToUtc(addDays(date, 1), 0, timeZone) ?? new Date(`${addDays(date, 1)}T00:00:00Z`);
  const [shopHours, staffHours, closures, off, busy] = await sequential([
    () => tx.select().from(shopOpeningHours).where(eq(shopOpeningHours.shopId, shopId)),
    () => tx.select().from(workingHours).where(eq(workingHours.staffMemberId, staffMemberId)),
    () =>
      tx
        .select({ startsOn: shopClosures.startsOn, endsOn: shopClosures.endsOn })
        .from(shopClosures)
        .where(
          and(
            eq(shopClosures.shopId, shopId),
            sql`${shopClosures.startsOn} <= ${date}`,
            sql`${shopClosures.endsOn} >= ${date}`,
          ),
        ),
    () =>
      tx
        .select({ startsAt: timeOff.startsAt, endsAt: timeOff.endsAt })
        .from(timeOff)
        .where(
          and(eq(timeOff.staffMemberId, staffMemberId), lt(timeOff.startsAt, dayEnd), gt(timeOff.endsAt, dayStart)),
        ),
    () =>
      tx
        .select({ startsAt: appointments.startsAt, blockedUntil: appointments.blockedUntil })
        .from(appointments)
        .where(
          and(
            eq(appointments.staffMemberId, staffMemberId),
            inArray(appointments.status, ACTIVE_STATUSES),
            lt(appointments.startsAt, dayEnd),
            gt(appointments.blockedUntil, dayStart),
            excludeAppointmentId ? ne(appointments.id, excludeAppointmentId) : undefined,
          ),
        ),
  ] as const);
  return {
    date,
    timeZone,
    shopHours: shopHours.map((h) => ({
      weekday: h.weekday,
      opensAt: shortTime(h.opensAt),
      closesAt: shortTime(h.closesAt),
    })),
    staffHours: staffHours.map((h) => ({
      weekday: h.weekday,
      startsAt: shortTime(h.startsAt),
      endsAt: shortTime(h.endsAt),
    })),
    closures,
    timeOff: off,
    busy,
  };
}

/** The barber's terms for a service: must be offered, with any per-barber price/duration. */
async function loadOffer(tx: Tx, staffMemberId: string, serviceId: string) {
  const [staff] = await tx.select().from(staffMembers).where(eq(staffMembers.id, staffMemberId));
  if (!staff || !staff.active)
    throw new DomainError("VALIDATION", "Choose an active barber.", { staffMemberId: "Barber not available" });
  const [service] = await tx.select().from(services).where(eq(services.id, serviceId));
  if (!service || !service.active)
    throw new DomainError("VALIDATION", "Choose an active service.", { serviceId: "Service not available" });
  const [offer] = await tx
    .select()
    .from(staffServices)
    .where(and(eq(staffServices.staffMemberId, staffMemberId), eq(staffServices.serviceId, serviceId)));
  if (!offer) {
    throw new DomainError("VALIDATION", `${staff.displayName} doesn't offer ${service.name}.`, {
      serviceId: "Not offered by this barber",
    });
  }
  return {
    staff,
    service,
    durationMin: offer.durationMinOverride ?? service.durationMin,
    priceCents: offer.priceCentsOverride ?? service.priceCents,
    bufferMin: service.bufferAfterMin,
  };
}

function slotError(reason: "OUTSIDE_HOURS" | "TAKEN" | "TOO_SOON" | "TOO_FAR", canOverride: boolean) {
  if (reason === "TAKEN") {
    return conflict("That barber is already booked at this time.", { time: "Already booked" });
  }
  return new DomainError(
    "VALIDATION",
    canOverride
      ? "This time is outside the barber's working hours. Tick “Book outside working hours” to book anyway."
      : "This time is outside the barber's working hours.",
    { time: "Outside working hours" },
  );
}

/** Converts the exclusion-constraint violation into a friendly error. */
function isOverlapViolation(err: unknown) {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    const c = cur as { code?: string; constraint?: string; cause?: unknown };
    if (c.code === "23P01" && c.constraint === "appointments_no_overlap") return true;
    cur = c.cause;
  }
  return false;
}

async function recordEvent(
  tx: Tx,
  ctx: ActorContext,
  appointmentId: string,
  type: "created" | "status_changed" | "rescheduled" | "edited",
  fromValue: unknown,
  toValue: unknown,
  actorLabel: string,
) {
  await tx.insert(appointmentEvents).values({
    shopId: ctx.shopId,
    appointmentId,
    type,
    fromValue: fromValue ?? null,
    toValue: toValue ?? null,
    actorUserId: ctx.userId,
    actorLabel,
  });
}

/* ------------------------------------------------------------------------ */
/* Queries                                                                   */
/* ------------------------------------------------------------------------ */

export async function listAppointments(
  ctx: ActorContext,
  range: { from: Date; to: Date; staffMemberId?: string | null; includeCancelled?: boolean },
) {
  return withTenantTx(ctx, async (tx) => {
    const access = await accessFor(tx, ctx);
    const staffFilter = access.all ? (range.staffMemberId ?? null) : access.ownStaffId;
    return tx
      .select({
        id: appointments.id,
        staffMemberId: appointments.staffMemberId,
        staffName: staffMembers.displayName,
        calendarColor: staffMembers.calendarColor,
        customerId: appointments.customerId,
        customerName: customers.fullName,
        customerPhone: customers.phoneE164,
        serviceName: appointments.serviceName,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        blockedUntil: appointments.blockedUntil,
        status: appointments.status,
        source: appointments.source,
        priceCents: appointments.priceCents,
        durationMin: appointments.durationMin,
      })
      .from(appointments)
      .innerJoin(staffMembers, eq(staffMembers.id, appointments.staffMemberId))
      .innerJoin(customers, eq(customers.id, appointments.customerId))
      .where(
        and(
          eq(appointments.shopId, ctx.shopId),
          lt(appointments.startsAt, range.to),
          gt(appointments.endsAt, range.from),
          staffFilter ? eq(appointments.staffMemberId, staffFilter) : undefined,
          range.includeCancelled ? undefined : ne(appointments.status, "cancelled"),
        ),
      )
      .orderBy(asc(appointments.startsAt));
  });
}

export type AppointmentListItem = Awaited<ReturnType<typeof listAppointments>>[number];

export async function getAppointment(ctx: ActorContext, appointmentId: unknown) {
  const id = parseInput(z.uuid(), appointmentId);
  return withTenantTx(ctx, async (tx) => {
    const access = await accessFor(tx, ctx);
    const [row] = await tx
      .select({
        appointment: appointments,
        staffName: staffMembers.displayName,
        customer: {
          id: customers.id,
          fullName: customers.fullName,
          phoneE164: customers.phoneE164,
          email: customers.email,
          visitCount: customers.visitCount,
        },
      })
      .from(appointments)
      .innerJoin(staffMembers, eq(staffMembers.id, appointments.staffMemberId))
      .innerJoin(customers, eq(customers.id, appointments.customerId))
      .where(eq(appointments.id, id));
    if (!row) throw notFound("Appointment not found.");
    assertStaffAllowed(access, row.appointment.staffMemberId);
    const events = await tx
      .select()
      .from(appointmentEvents)
      .where(eq(appointmentEvents.appointmentId, id))
      .orderBy(desc(appointmentEvents.createdAt));
    return { ...row, events, canManageAll: access.all };
  });
}

/** Free start times for a barber, service and date (shop wall-clock grid). */
export async function getAvailableSlots(
  ctx: ActorContext,
  input: { staffMemberId: string; serviceId: string; date: string; excludeAppointmentId?: string },
) {
  const staffMemberId = parseInput(z.uuid(), input.staffMemberId);
  const serviceId = parseInput(z.uuid(), input.serviceId);
  const date = parseInput(dateSchema, input.date);
  return withTenantTx(ctx, async (tx) => {
    const access = await accessFor(tx, ctx);
    assertStaffAllowed(access, staffMemberId);
    const shop = await loadShop(tx, ctx.shopId);
    const offer = await loadOffer(tx, staffMemberId, serviceId);
    const day = await loadDayInput(tx, ctx.shopId, staffMemberId, date, shop.timezone, input.excludeAppointmentId);
    return availableSlots(day, {
      durationMin: offer.durationMin,
      bufferMin: offer.bufferMin,
      slotIntervalMin: shop.slotIntervalMin,
      notBefore: new Date(),
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Commands                                                                  */
/* ------------------------------------------------------------------------ */

export async function createAppointment(ctx: ActorContext, input: unknown): Promise<{ appointmentId: string }> {
  const data = parseInput(createAppointmentSchema, input);
  try {
    return await withTenantTx(ctx, async (tx) => {
      const access = await accessFor(tx, ctx);
      assertStaffAllowed(access, data.staffMemberId);
      const shop = await loadShop(tx, ctx.shopId);
      const offer = await loadOffer(tx, data.staffMemberId, data.serviceId);

      const startsAt = zonedTimeToUtc(data.date, timeToMinutes(data.time), shop.timezone);
      if (!startsAt)
        throw new DomainError("VALIDATION", "That time doesn't exist (clock change).", { time: "Invalid time" });

      const overrideAllowed = access.all && data.allowOutsideHours;
      const day = await loadDayInput(tx, ctx.shopId, data.staffMemberId, data.date, shop.timezone);
      const check = checkSlot(
        day,
        { durationMin: offer.durationMin, bufferMin: offer.bufferMin, slotIntervalMin: 1 },
        startsAt,
      );
      if (!check.ok && !(check.reason === "OUTSIDE_HOURS" && overrideAllowed))
        throw slotError(check.reason, access.all);

      let customerId = data.customerId ?? null;
      if (customerId) {
        const [c] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));
        if (!c) throw new DomainError("VALIDATION", "Customer not found.", { customer: "Not found" });
      } else {
        ({ customerId } = await findOrCreateCustomer(tx, ctx, data.newCustomer, data.source));
      }

      const endsAt = new Date(startsAt.getTime() + offer.durationMin * 60_000);
      const blockedUntil = new Date(endsAt.getTime() + offer.bufferMin * 60_000);
      const [appt] = await tx
        .insert(appointments)
        .values({
          shopId: ctx.shopId,
          staffMemberId: data.staffMemberId,
          customerId: customerId!,
          serviceId: data.serviceId,
          startsAt,
          endsAt,
          blockedUntil,
          status: "confirmed",
          source: data.source,
          serviceName: offer.service.name,
          priceCents: offer.priceCents,
          durationMin: offer.durationMin,
          internalNote: data.internalNote,
          createdByMembershipId: ctx.membershipId,
        })
        .returning({ id: appointments.id });

      await recordEvent(
        tx,
        ctx,
        appt.id,
        "created",
        null,
        {
          startsAt,
          staffMemberId: data.staffMemberId,
          service: offer.service.name,
          outsideHours: !check.ok,
        },
        "staff",
      );
      return { appointmentId: appt.id };
    });
  } catch (err) {
    if (isOverlapViolation(err))
      throw conflict("That barber was just booked at this time. Pick another slot.", { time: "Just taken" });
    throw err;
  }
}

async function lockAppointment(tx: Tx, access: Access, id: string, version?: number) {
  const [appt] = await tx.select().from(appointments).where(eq(appointments.id, id)).for("update");
  if (!appt) throw notFound("Appointment not found.");
  assertStaffAllowed(access, appt.staffMemberId);
  if (version !== undefined && appt.version !== version) {
    throw conflict("Someone else changed this appointment. Reload to see the latest version.");
  }
  return appt;
}

export async function rescheduleAppointment(ctx: ActorContext, input: unknown) {
  const data = parseInput(rescheduleSchema, input);
  try {
    await withTenantTx(ctx, async (tx) => {
      const access = await accessFor(tx, ctx);
      const appt = await lockAppointment(tx, access, data.appointmentId, data.version);
      assertStaffAllowed(access, data.staffMemberId);
      if (!ACTIVE_STATUSES.includes(appt.status)) throw invalidState("Only upcoming appointments can be rescheduled.");

      const shop = await loadShop(tx, ctx.shopId);
      // Moving to another barber requires that barber to offer the service. The price snapshot is kept.
      const offer =
        data.staffMemberId !== appt.staffMemberId ? await loadOffer(tx, data.staffMemberId, appt.serviceId) : null;
      const [service] = await tx.select().from(services).where(eq(services.id, appt.serviceId));
      const durationMin = offer?.durationMin ?? appt.durationMin;
      const bufferMin = service?.bufferAfterMin ?? 0;

      const startsAt = zonedTimeToUtc(data.date, timeToMinutes(data.time), shop.timezone);
      if (!startsAt)
        throw new DomainError("VALIDATION", "That time doesn't exist (clock change).", { time: "Invalid time" });
      const day = await loadDayInput(tx, ctx.shopId, data.staffMemberId, data.date, shop.timezone, appt.id);
      const check = checkSlot(day, { durationMin, bufferMin, slotIntervalMin: 1 }, startsAt);
      if (!check.ok && !(check.reason === "OUTSIDE_HOURS" && access.all && data.allowOutsideHours)) {
        throw slotError(check.reason, access.all);
      }

      const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
      await tx
        .update(appointments)
        .set({
          staffMemberId: data.staffMemberId,
          startsAt,
          endsAt,
          blockedUntil: new Date(endsAt.getTime() + bufferMin * 60_000),
          durationMin,
          version: appt.version + 1,
        })
        .where(eq(appointments.id, appt.id));
      await recordEvent(
        tx,
        ctx,
        appt.id,
        "rescheduled",
        { startsAt: appt.startsAt, staffMemberId: appt.staffMemberId },
        { startsAt, staffMemberId: data.staffMemberId },
        "staff",
      );
      await notifyCustomer(
        tx,
        ctx.shopId,
        { ...appt, staffMemberId: data.staffMemberId, startsAt },
        "booking_rescheduled",
        appt.startsAt,
      );
    });
  } catch (err) {
    if (isOverlapViolation(err))
      throw conflict("That barber is already booked at this time.", { time: "Already booked" });
    throw err;
  }
}

export async function changeAppointmentStatus(ctx: ActorContext, input: unknown, now: Date = new Date()) {
  const data = parseInput(statusChangeSchema, input);
  await withTenantTx(ctx, async (tx) => {
    const access = await accessFor(tx, ctx);
    const appt = await lockAppointment(tx, access, data.appointmentId, data.version);
    if (!canTransition(appt.status, data.to)) {
      throw invalidState(
        `A ${appt.status.replace("_", "-")} appointment can't be marked ${data.to.replace("_", "-")}.`,
      );
    }
    if ((data.to === "completed" || data.to === "no_show") && appt.startsAt > now) {
      throw invalidState("This appointment hasn't started yet.");
    }
    await tx
      .update(appointments)
      .set({
        status: data.to,
        version: appt.version + 1,
        ...(data.to === "cancelled"
          ? { cancelledAt: now, cancelledBy: "staff" as const, cancelReason: data.reason }
          : {}),
      })
      .where(eq(appointments.id, appt.id));

    if (data.to === "completed") {
      // Visit statistics feed the customer profile and retention features.
      await tx
        .update(customers)
        .set({
          visitCount: sql`${customers.visitCount} + 1`,
          lastVisitAt: sql`greatest(${customers.lastVisitAt}, ${appt.startsAt.toISOString()}::timestamptz)`,
          firstVisitAt: sql`least(coalesce(${customers.firstVisitAt}, ${appt.startsAt.toISOString()}::timestamptz), ${appt.startsAt.toISOString()}::timestamptz)`,
        })
        .where(eq(customers.id, appt.customerId));
    }
    await recordEvent(
      tx,
      ctx,
      appt.id,
      "status_changed",
      { status: appt.status },
      { status: data.to, reason: data.reason },
      "staff",
    );
    if (data.to === "cancelled") {
      if (appt.startsAt > now) await notifyCustomer(tx, ctx.shopId, appt, "booking_cancelled");
      await audit(tx, {
        shopId: ctx.shopId,
        actorUserId: ctx.userId,
        action: "appointment.cancelled",
        entityType: "appointment",
        entityId: appt.id,
        changes: { reason: data.reason },
      });
    }
  });
}

export async function updateAppointmentNotes(ctx: ActorContext, input: unknown) {
  const data = parseInput(notesSchema, input);
  await withTenantTx(ctx, async (tx) => {
    const access = await accessFor(tx, ctx);
    const appt = await lockAppointment(tx, access, data.appointmentId);
    if (appt.internalNote === data.internalNote) return;
    await tx
      .update(appointments)
      .set({ internalNote: data.internalNote, version: appt.version + 1 })
      .where(eq(appointments.id, appt.id));
    await recordEvent(
      tx,
      ctx,
      appt.id,
      "edited",
      { internalNote: appt.internalNote },
      { internalNote: data.internalNote },
      "staff",
    );
  });
}

/** Barbers and services available for booking, for forms. Barbers only see themselves. */
export async function getBookingOptions(ctx: ActorContext) {
  return withTenantTx(ctx, async (tx) => {
    const access = await accessFor(tx, ctx);
    const staff = await tx
      .select({ id: staffMembers.id, displayName: staffMembers.displayName, calendarColor: staffMembers.calendarColor })
      .from(staffMembers)
      .where(
        and(
          eq(staffMembers.shopId, ctx.shopId),
          eq(staffMembers.active, true),
          access.all ? undefined : eq(staffMembers.id, access.ownStaffId!),
        ),
      )
      .orderBy(asc(staffMembers.sortOrder), asc(staffMembers.displayName));
    if (!staff.length) return { staff, offers: [], canManageAll: access.all, ownStaffId: access.ownStaffId };
    const offers = await tx
      .select({
        staffMemberId: staffServices.staffMemberId,
        serviceId: services.id,
        name: services.name,
        durationMin: sql<number>`coalesce(${staffServices.durationMinOverride}, ${services.durationMin})`,
        priceCents: sql<number>`coalesce(${staffServices.priceCentsOverride}, ${services.priceCents})`,
      })
      .from(staffServices)
      .innerJoin(services, eq(services.id, staffServices.serviceId))
      .where(
        and(
          eq(services.active, true),
          inArray(
            staffServices.staffMemberId,
            staff.map((s) => s.id),
          ),
        ),
      )
      .orderBy(asc(services.sortOrder), asc(services.name));
    return { staff, offers, canManageAll: access.all, ownStaffId: access.ownStaffId };
  });
}
