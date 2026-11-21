/**
 * The public, signed-out side of BarberOS: the booking page and the customer's
 * "manage my booking" link.
 *
 * Security model: a shop is identified by its slug (or the appointment by its
 * manage token) through narrow SECURITY DEFINER lookups. After that, everything
 * runs inside that shop's row-level-security context, and these functions only
 * return public information: services marked public, bookable barbers, free
 * times, and the customer's own booking. No other customer data is exposed.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { withTenantTx } from "@/server/db/tenant";
import type { Tx } from "@/server/db/client";
import {
  appointmentEvents,
  appointments,
  customers,
  services,
  shopOpeningHours,
  shops,
  shopSettings,
  staffMembers,
  staffServices,
} from "@/server/db/schema";
import { conflict, DomainError, invalidState, notFound } from "@/server/errors";
import { hashToken, randomToken } from "@/lib/ids";
import { addDays, formatClock, formatDateLabel, shortTime, timeToMinutes, zonedDate, zonedTimeToUtc } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { customerRescheduleSchema, publicBookingSchema } from "@/lib/validation/booking";
import { enqueueEmail } from "@/server/notifications/outbox";
import type { BookingPayload } from "@/server/notifications/templates";
import { parseInput } from "../validate";
import { findOrCreateCustomer } from "../customers/service";
import { availableSlots, checkSlot } from "../scheduling/availability";
import { loadAvailabilityRange } from "../scheduling/range-loader";

/* ------------------------------------------------------------------------ */
/* Shop lookup                                                               */
/* ------------------------------------------------------------------------ */

async function shopIdBySlug(slug: string): Promise<string | null> {
  if (!/^[a-z0-9-]{3,48}$/i.test(slug)) return null;
  return withTenantTx({}, async (tx) => {
    const { rows } = await tx.execute<{ id: string | null }>(sql`select app_shop_id_by_slug(${slug}) as id`);
    return rows[0]?.id ?? null;
  });
}

async function loadPublicShop(tx: Tx, shopId: string) {
  const [row] = await tx
    .select({ shop: shops, settings: shopSettings })
    .from(shops)
    .innerJoin(shopSettings, eq(shopSettings.shopId, shops.id))
    .where(eq(shops.id, shopId));
  if (!row) throw notFound("Shop not found.");
  return row;
}

/** Bookable barbers and what each offers (public services only), with per-barber price/duration. */
async function loadOffers(tx: Tx, shopId: string) {
  const rows = await tx
    .select({
      staffMemberId: staffMembers.id,
      staffName: staffMembers.displayName,
      staffBio: staffMembers.bio,
      staffSort: staffMembers.sortOrder,
      serviceId: services.id,
      serviceName: services.name,
      serviceDescription: services.description,
      serviceSort: services.sortOrder,
      bufferMin: services.bufferAfterMin,
      durationMin: sql<number>`coalesce(${staffServices.durationMinOverride}, ${services.durationMin})`,
      priceCents: sql<number>`coalesce(${staffServices.priceCentsOverride}, ${services.priceCents})`,
    })
    .from(staffServices)
    .innerJoin(staffMembers, eq(staffMembers.id, staffServices.staffMemberId))
    .innerJoin(services, eq(services.id, staffServices.serviceId))
    .where(
      and(
        eq(staffServices.shopId, shopId),
        eq(staffMembers.active, true),
        eq(staffMembers.isBookable, true),
        eq(services.active, true),
        eq(services.isPublic, true),
        // Barbers linked to a deactivated login aren't bookable.
        sql`(${staffMembers.membershipId} is null or exists (select 1 from shop_memberships m where m.id = ${staffMembers.membershipId} and m.status = 'active'))`,
      ),
    )
    .orderBy(asc(services.sortOrder), asc(staffMembers.sortOrder));
  return rows;
}

export type PublicShop = Awaited<ReturnType<typeof getPublicShop>>;

/** Everything the booking page shows before any choice is made. Null when the slug is unknown. */
export async function getPublicShop(slug: string) {
  const shopId = await shopIdBySlug(slug);
  if (!shopId) return null;
  return withTenantTx({ shopId }, async (tx) => {
    const { shop, settings } = await loadPublicShop(tx, shopId);
    const hours = await tx
      .select()
      .from(shopOpeningHours)
      .where(eq(shopOpeningHours.shopId, shopId))
      .orderBy(asc(shopOpeningHours.weekday), asc(shopOpeningHours.opensAt));
    const offers = await loadOffers(tx, shopId);

    const servicesMap = new Map<string, { id: string; name: string; description: string | null; minPrice: number; maxPrice: number; minDuration: number; maxDuration: number; sort: number }>();
    const staffMap = new Map<string, { id: string; name: string; bio: string | null; serviceIds: string[]; sort: number }>();
    for (const o of offers) {
      const s = servicesMap.get(o.serviceId);
      if (s) {
        s.minPrice = Math.min(s.minPrice, o.priceCents);
        s.maxPrice = Math.max(s.maxPrice, o.priceCents);
        s.minDuration = Math.min(s.minDuration, o.durationMin);
        s.maxDuration = Math.max(s.maxDuration, o.durationMin);
      } else {
        servicesMap.set(o.serviceId, {
          id: o.serviceId,
          name: o.serviceName,
          description: o.serviceDescription,
          minPrice: o.priceCents,
          maxPrice: o.priceCents,
          minDuration: o.durationMin,
          maxDuration: o.durationMin,
          sort: o.serviceSort,
        });
      }
      const st = staffMap.get(o.staffMemberId) ?? { id: o.staffMemberId, name: o.staffName, bio: o.staffBio, serviceIds: [], sort: o.staffSort };
      st.serviceIds.push(o.serviceId);
      staffMap.set(o.staffMemberId, st);
    }

    return {
      shop: {
        id: shop.id,
        slug: shop.slug,
        name: shop.name,
        phone: shop.phone,
        email: shop.email,
        address: [shop.addressLine, shop.postalCode, shop.city].filter(Boolean).join(", ") || null,
        timezone: shop.timezone,
        currency: shop.currency,
        brandColor: shop.brandColor,
        isDemo: shop.isDemo,
      },
      settings: {
        enabled: settings.onlineBookingEnabled,
        requireEmail: settings.requireCustomerEmail,
        autoConfirm: settings.autoConfirmOnline,
        leadTimeMin: settings.bookingLeadTimeMin,
        horizonDays: settings.bookingHorizonDays,
        cancellationWindowHours: settings.cancellationWindowHours,
        slotIntervalMin: settings.slotIntervalMin,
      },
      hours: hours.map((h) => ({ weekday: h.weekday, opensAt: shortTime(h.opensAt), closesAt: shortTime(h.closesAt) })),
      services: [...servicesMap.values()].sort((a, b) => a.sort - b.sort),
      staff: [...staffMap.values()].sort((a, b) => a.sort - b.sort),
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Availability                                                              */
/* ------------------------------------------------------------------------ */

type Offer = Awaited<ReturnType<typeof loadOffers>>[number];

function bookingWindow(settings: { bookingLeadTimeMin: number; bookingHorizonDays: number }, now: Date) {
  return {
    notBefore: new Date(now.getTime() + settings.bookingLeadTimeMin * 60_000),
    notAfter: new Date(now.getTime() + settings.bookingHorizonDays * 86_400_000),
  };
}

/**
 * Free times per date for a service, with one barber or "any". For "any", each
 * time lists the barbers free then, so booking can pick one.
 */
async function computeAvailability(
  tx: Tx,
  ctx: { shopId: string; timezone: string; slotIntervalMin: number; leadTimeMin: number; horizonDays: number },
  offers: Offer[],
  opts: { serviceId: string; staffMemberId: string; fromDate: string; days: number; now: Date; excludeAppointmentId?: string },
) {
  const candidates = offers.filter(
    (o) => o.serviceId === opts.serviceId && (opts.staffMemberId === "any" || o.staffMemberId === opts.staffMemberId),
  );
  const toDate = addDays(opts.fromDate, opts.days - 1);
  const dayInput = await loadAvailabilityRange(tx, {
    shopId: ctx.shopId,
    staffIds: candidates.map((c) => c.staffMemberId),
    fromDate: opts.fromDate,
    toDate,
    timeZone: ctx.timezone,
    excludeAppointmentId: opts.excludeAppointmentId,
  });
  const window = bookingWindow({ bookingLeadTimeMin: ctx.leadTimeMin, bookingHorizonDays: ctx.horizonDays }, opts.now);
  const days: { date: string; slots: { time: string; staffIds: string[] }[] }[] = [];
  for (let i = 0; i < opts.days; i++) {
    const date = addDays(opts.fromDate, i);
    const byTime = new Map<string, string[]>();
    for (const c of candidates) {
      const slots = availableSlots(dayInput(c.staffMemberId, date), {
        durationMin: c.durationMin,
        bufferMin: c.bufferMin,
        slotIntervalMin: ctx.slotIntervalMin,
        ...window,
      });
      for (const s of slots) {
        const t = formatClock(s, ctx.timezone);
        byTime.set(t, [...(byTime.get(t) ?? []), c.staffMemberId]);
      }
    }
    days.push({
      date,
      slots: [...byTime.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([time, staffIds]) => ({ time, staffIds })),
    });
  }
  return { days, candidates, dayInput, window };
}

export async function getPublicAvailability(
  slug: string,
  opts: { serviceId: string; staffMemberId: string; fromDate?: string; days?: number },
  now: Date = new Date(),
) {
  const shopId = await shopIdBySlug(slug);
  if (!shopId) throw notFound("Shop not found.");
  return withTenantTx({ shopId }, async (tx) => {
    const { shop, settings } = await loadPublicShop(tx, shopId);
    if (!settings.onlineBookingEnabled) throw invalidState("Online booking isn't open for this shop.");
    const offers = await loadOffers(tx, shopId);
    const today = zonedDate(now, shop.timezone);
    const fromDate = opts.fromDate && opts.fromDate >= today ? opts.fromDate : today;
    const maxDays = Math.max(1, settings.bookingHorizonDays + 1);
    const { days } = await computeAvailability(
      tx,
      { shopId, timezone: shop.timezone, slotIntervalMin: settings.slotIntervalMin, leadTimeMin: settings.bookingLeadTimeMin, horizonDays: settings.bookingHorizonDays },
      offers,
      { serviceId: opts.serviceId, staffMemberId: opts.staffMemberId, fromDate, days: Math.min(opts.days ?? 14, maxDays), now },
    );
    return days.map((d) => ({ date: d.date, times: d.slots.map((s) => s.time) }));
  });
}

/* ------------------------------------------------------------------------ */
/* Booking                                                                   */
/* ------------------------------------------------------------------------ */

function payloadFor(
  shop: { name: string; phone: string | null; addressLine: string | null; city: string | null; slug: string; timezone: string; currency: string },
  appt: { serviceName: string; startsAt: Date; endsAt: Date; priceCents: number },
  customerName: string,
  staffName: string,
  manageUrl: string,
  status: "confirmed" | "pending",
): BookingPayload {
  return {
    shopName: shop.name,
    shopPhone: shop.phone,
    shopAddress: [shop.addressLine, shop.city].filter(Boolean).join(", ") || null,
    customerName,
    serviceName: appt.serviceName,
    staffName,
    whenLabel: `${formatDateLabel(zonedDate(appt.startsAt, shop.timezone))} at ${formatClock(appt.startsAt, shop.timezone)}`,
    priceLabel: formatMoney(appt.priceCents, shop.currency),
    manageUrl,
    status,
  };
}

function isOverlapViolation(err: unknown) {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    const c = cur as { code?: string; cause?: unknown };
    if (c.code === "23P01") return true;
    cur = c.cause;
  }
  return false;
}

/**
 * Books an appointment from the public page. Returns the one-time manage token
 * (only its hash is stored) for the confirmation page and email.
 */
export async function createPublicBooking(
  slug: string,
  input: unknown,
  opts: { baseUrl: string; now?: Date },
): Promise<{ token: string; shopId: string }> {
  const data = parseInput(publicBookingSchema, input);
  const now = opts.now ?? new Date();
  const shopId = await shopIdBySlug(slug);
  if (!shopId) throw notFound("Shop not found.");
  const token = randomToken();
  try {
    await withTenantTx({ shopId }, async (tx) => {
      const { shop, settings } = await loadPublicShop(tx, shopId);
      if (!settings.onlineBookingEnabled) throw invalidState("Online booking isn't open for this shop.");
      if (settings.requireCustomerEmail && !data.email) {
        throw new DomainError("VALIDATION", "Please add your email.", { email: "Email is required" });
      }
      const offers = await loadOffers(tx, shopId);
      const { days, candidates } = await computeAvailability(
        tx,
        { shopId, timezone: shop.timezone, slotIntervalMin: settings.slotIntervalMin, leadTimeMin: settings.bookingLeadTimeMin, horizonDays: settings.bookingHorizonDays },
        offers,
        { serviceId: data.serviceId, staffMemberId: data.staffMemberId, fromDate: data.date, days: 1, now },
      );
      const slot = days[0]?.slots.find((s) => s.time === data.time);
      if (!slot) throw conflict("Sorry, that time was just taken. Please pick another.", { time: "No longer available" });

      // "Any barber": choose whoever has the fewest bookings that day, to spread the work.
      let staffId = slot.staffIds[0];
      if (data.staffMemberId === "any" && slot.staffIds.length > 1) {
        const dayStart = zonedTimeToUtc(data.date, 0, shop.timezone)!;
        const dayEnd = zonedTimeToUtc(addDays(data.date, 1), 0, shop.timezone)!;
        const counts = await tx
          .select({ staffMemberId: appointments.staffMemberId, n: sql<number>`count(*)::int` })
          .from(appointments)
          .where(
            and(
              inArray(appointments.staffMemberId, slot.staffIds),
              inArray(appointments.status, ["pending", "confirmed"]),
              sql`${appointments.startsAt} >= ${dayStart.toISOString()}::timestamptz and ${appointments.startsAt} < ${dayEnd.toISOString()}::timestamptz`,
            ),
          )
          .groupBy(appointments.staffMemberId);
        const load = new Map(counts.map((c) => [c.staffMemberId, c.n]));
        staffId = [...slot.staffIds].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))[0];
      }
      const offer = candidates.find((c) => c.staffMemberId === staffId)!;

      const { customerId, created } = await findOrCreateCustomer(
        tx,
        { shopId },
        { fullName: data.fullName, phone: data.phone, email: data.email },
        "online",
      );
      if (!created) {
        // Returning customer: fill in an email if we didn't have one, but never overwrite details staff manage.
        await tx
          .update(customers)
          .set({ email: sql`coalesce(${customers.email}, ${data.email})` })
          .where(eq(customers.id, customerId));
      }
      if (data.marketingOptIn) {
        await tx.update(customers).set({ marketingConsentAt: now }).where(eq(customers.id, customerId));
      }

      const startsAt = zonedTimeToUtc(data.date, timeToMinutes(data.time), shop.timezone)!;
      const endsAt = new Date(startsAt.getTime() + offer.durationMin * 60_000);
      const status = settings.autoConfirmOnline ? "confirmed" : "pending";
      const [appt] = await tx
        .insert(appointments)
        .values({
          shopId,
          staffMemberId: staffId,
          customerId,
          serviceId: offer.serviceId,
          startsAt,
          endsAt,
          blockedUntil: new Date(endsAt.getTime() + offer.bufferMin * 60_000),
          status,
          source: "online",
          serviceName: offer.serviceName,
          priceCents: offer.priceCents,
          durationMin: offer.durationMin,
          customerNote: data.note,
          manageTokenHash: hashToken(token),
        })
        .returning();
      await tx.insert(appointmentEvents).values({
        shopId,
        appointmentId: appt.id,
        type: "created",
        toValue: { startsAt, staffMemberId: staffId, service: offer.serviceName, anyBarber: data.staffMemberId === "any" },
        actorLabel: "customer",
      });
      if (data.email) {
        await enqueueEmail(tx, {
          shopId,
          recipient: data.email,
          template: "booking_created",
          payload: payloadFor(shop, appt, data.fullName, offer.staffName, `${opts.baseUrl}/book/${shop.slug}/manage/${token}`, status),
        });
      }
    });
  } catch (err) {
    if (isOverlapViolation(err)) throw conflict("Sorry, that time was just taken. Please pick another.", { time: "Just taken" });
    throw err;
  }
  return { token, shopId };
}

/* ------------------------------------------------------------------------ */
/* Manage my booking                                                         */
/* ------------------------------------------------------------------------ */

async function resolveToken(token: string): Promise<{ shopId: string; appointmentId: string } | null> {
  if (!token || token.length > 100) return null;
  return withTenantTx({}, async (tx) => {
    const { rows } = await tx.execute<{ shop_id: string; appointment_id: string }>(
      sql`select * from app_appointment_by_manage_token(${hashToken(token)})`,
    );
    return rows[0] ? { shopId: rows[0].shop_id, appointmentId: rows[0].appointment_id } : null;
  });
}

async function loadManaged(tx: Tx, appointmentId: string, now: Date) {
  const [row] = await tx
    .select({
      appointment: appointments,
      staffName: staffMembers.displayName,
      customerName: customers.fullName,
      customerEmail: customers.email,
    })
    .from(appointments)
    .innerJoin(staffMembers, eq(staffMembers.id, appointments.staffMemberId))
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .where(eq(appointments.id, appointmentId));
  if (!row) throw notFound("Booking not found.");
  const { shop, settings } = await loadPublicShop(tx, row.appointment.shopId);
  const a = row.appointment;
  const active = a.status === "pending" || a.status === "confirmed";
  const deadline = new Date(a.startsAt.getTime() - settings.cancellationWindowHours * 3_600_000);
  return { row, shop, settings, canChange: active && now < deadline, deadline, active };
}

export async function getManagedBooking(token: string, now: Date = new Date()) {
  const ref = await resolveToken(token);
  if (!ref) return null;
  return withTenantTx({ shopId: ref.shopId }, async (tx) => {
    const { row, shop, settings, canChange, deadline, active } = await loadManaged(tx, ref.appointmentId, now);
    const a = row.appointment;
    return {
      shop: {
        name: shop.name,
        slug: shop.slug,
        phone: shop.phone,
        address: [shop.addressLine, shop.postalCode, shop.city].filter(Boolean).join(", ") || null,
        timezone: shop.timezone,
        currency: shop.currency,
        brandColor: shop.brandColor,
        isDemo: shop.isDemo,
      },
      appointment: {
        status: a.status,
        serviceId: a.serviceId,
        staffMemberId: a.staffMemberId,
        serviceName: a.serviceName,
        staffName: row.staffName,
        customerName: row.customerName,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        priceCents: a.priceCents,
        durationMin: a.durationMin,
      },
      policy: { canChange, deadline, active, cancellationWindowHours: settings.cancellationWindowHours },
    };
  });
}

export async function cancelManagedBooking(token: string, opts: { baseUrl: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const ref = await resolveToken(token);
  if (!ref) throw notFound("Booking not found.");
  await withTenantTx({ shopId: ref.shopId }, async (tx) => {
    await tx.select({ id: appointments.id }).from(appointments).where(eq(appointments.id, ref.appointmentId)).for("update");
    const { row, shop, canChange, active, settings } = await loadManaged(tx, ref.appointmentId, now);
    if (!active) throw invalidState("This booking is no longer active.");
    if (!canChange) {
      throw invalidState(`Bookings can only be cancelled online up to ${settings.cancellationWindowHours} hours before. Please call the shop.`);
    }
    const a = row.appointment;
    await tx
      .update(appointments)
      .set({ status: "cancelled", cancelledAt: now, cancelledBy: "customer", cancelReason: "Cancelled online by customer", version: a.version + 1 })
      .where(eq(appointments.id, a.id));
    await tx.insert(appointmentEvents).values({
      shopId: ref.shopId,
      appointmentId: a.id,
      type: "status_changed",
      fromValue: { status: a.status },
      toValue: { status: "cancelled", reason: "Cancelled online by customer" },
      actorLabel: "customer",
    });
    if (row.customerEmail) {
      await enqueueEmail(tx, {
        shopId: ref.shopId,
        recipient: row.customerEmail,
        template: "booking_cancelled",
        payload: payloadFor(shop, a, row.customerName, row.staffName, `${opts.baseUrl}/book/${shop.slug}`, "confirmed"),
      });
    }
  });
  return { shopId: ref.shopId };
}

/** Free times to move a booking (same barber and service), excluding the booking itself. */
export async function getRescheduleAvailability(token: string, opts: { fromDate?: string; days?: number }, now: Date = new Date()) {
  const ref = await resolveToken(token);
  if (!ref) throw notFound("Booking not found.");
  return withTenantTx({ shopId: ref.shopId }, async (tx) => {
    const { row, shop, settings } = await loadManaged(tx, ref.appointmentId, now);
    const offers = await loadOffers(tx, ref.shopId);
    const today = zonedDate(now, shop.timezone);
    const fromDate = opts.fromDate && opts.fromDate >= today ? opts.fromDate : today;
    const { days } = await computeAvailability(
      tx,
      { shopId: ref.shopId, timezone: shop.timezone, slotIntervalMin: settings.slotIntervalMin, leadTimeMin: settings.bookingLeadTimeMin, horizonDays: settings.bookingHorizonDays },
      offers,
      { serviceId: row.appointment.serviceId, staffMemberId: row.appointment.staffMemberId, fromDate, days: opts.days ?? 14, now, excludeAppointmentId: row.appointment.id },
    );
    return days.map((d) => ({ date: d.date, times: d.slots.map((s) => s.time) }));
  });
}

export async function rescheduleManagedBooking(token: string, input: unknown, opts: { baseUrl: string; now?: Date }) {
  const data = parseInput(customerRescheduleSchema, input);
  const now = opts.now ?? new Date();
  const ref = await resolveToken(token);
  if (!ref) throw notFound("Booking not found.");
  try {
    await withTenantTx({ shopId: ref.shopId }, async (tx) => {
      await tx.select({ id: appointments.id }).from(appointments).where(eq(appointments.id, ref.appointmentId)).for("update");
      const { row, shop, settings, canChange, active } = await loadManaged(tx, ref.appointmentId, now);
      if (!active) throw invalidState("This booking is no longer active.");
      if (!canChange) {
        throw invalidState(`Bookings can only be changed online up to ${settings.cancellationWindowHours} hours before. Please call the shop.`);
      }
      const a = row.appointment;
      const offers = await loadOffers(tx, ref.shopId);
      const offer = offers.find((o) => o.staffMemberId === a.staffMemberId && o.serviceId === a.serviceId);
      if (!offer) throw invalidState("This booking can't be moved online. Please call the shop.");
      const { dayInput, window } = await computeAvailability(
        tx,
        { shopId: ref.shopId, timezone: shop.timezone, slotIntervalMin: settings.slotIntervalMin, leadTimeMin: settings.bookingLeadTimeMin, horizonDays: settings.bookingHorizonDays },
        offers,
        { serviceId: a.serviceId, staffMemberId: a.staffMemberId, fromDate: data.date, days: 1, now, excludeAppointmentId: a.id },
      );
      const startsAt = zonedTimeToUtc(data.date, timeToMinutes(data.time), shop.timezone);
      if (!startsAt) throw conflict("That time isn't available.", { time: "Not available" });
      const check = checkSlot(
        dayInput(a.staffMemberId, data.date),
        { durationMin: a.durationMin, bufferMin: offer.bufferMin, slotIntervalMin: settings.slotIntervalMin, ...window },
        startsAt,
      );
      if (!check.ok) throw conflict("Sorry, that time isn't available. Please pick another.", { time: "Not available" });
      const endsAt = new Date(startsAt.getTime() + a.durationMin * 60_000);
      await tx
        .update(appointments)
        .set({ startsAt, endsAt, blockedUntil: new Date(endsAt.getTime() + offer.bufferMin * 60_000), version: a.version + 1 })
        .where(eq(appointments.id, a.id));
      await tx.insert(appointmentEvents).values({
        shopId: ref.shopId,
        appointmentId: a.id,
        type: "rescheduled",
        fromValue: { startsAt: a.startsAt, staffMemberId: a.staffMemberId },
        toValue: { startsAt, staffMemberId: a.staffMemberId },
        actorLabel: "customer",
      });
      if (row.customerEmail) {
        const payload = payloadFor(shop, { ...a, startsAt, endsAt }, row.customerName, row.staffName, `${opts.baseUrl}/book/${shop.slug}/manage/${token}`, "confirmed");
        payload.previousWhenLabel = `${formatDateLabel(zonedDate(a.startsAt, shop.timezone))} at ${formatClock(a.startsAt, shop.timezone)}`;
        await enqueueEmail(tx, { shopId: ref.shopId, recipient: row.customerEmail, template: "booking_rescheduled", payload });
      }
    });
  } catch (err) {
    if (isOverlapViolation(err)) throw conflict("Sorry, that time was just taken. Please pick another.", { time: "Just taken" });
    throw err;
  }
  return { shopId: ref.shopId };
}
