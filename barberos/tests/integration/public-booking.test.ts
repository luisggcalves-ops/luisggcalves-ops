import { describe, expect, it } from "vitest";
import {
  cancelManagedBooking,
  createPublicBooking,
  getManagedBooking,
  getPublicAvailability,
  getPublicShop,
  getRescheduleAvailability,
  rescheduleManagedBooking,
} from "@/server/domain/public-booking/service";
import { createService, listServices } from "@/server/domain/services/service";
import { createStaffProfile, listStaff, setStaffServices } from "@/server/domain/staff/service";
import { updateBookingSettings } from "@/server/domain/shops/service";
import { changeAppointmentStatus, listAppointments } from "@/server/domain/appointments/service";
import { deliverDueForShop, deliverAllDue } from "@/server/notifications/outbox";
import { DomainError } from "@/server/errors";
import { zonedTimeToUtc } from "@/lib/time";
import { adminPool, futureWeekday, shopWithOwner } from "./helpers";

const TZ = "Europe/Lisbon";
const TUE = futureWeekday(2);
const BASE = "https://barberos.test";

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "OK";
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
}

async function openShop(opts: { autoConfirm?: boolean; requireEmail?: boolean; cancellationWindowHours?: number } = {}) {
  const s = await shopWithOwner("Owner");
  await createService(s.ctx, { name: "Haircut", durationMin: 30, bufferAfterMin: 0, price: "15" });
  await createService(s.ctx, { name: "Secret", durationMin: 30, price: "99", isPublic: false });
  await createStaffProfile(s.ctx, { displayName: "Miguel" });
  const [haircut, secret] = await listServices(s.ctx);
  for (const st of await listStaff(s.ctx)) await setStaffServices(s.ctx, st.id, [{ serviceId: haircut.id }, { serviceId: secret.id }]);
  await updateBookingSettings(s.ctx, {
    onlineBookingEnabled: true,
    autoConfirmOnline: opts.autoConfirm ?? true,
    requireCustomerEmail: opts.requireEmail ?? false,
    slotIntervalMin: 30,
    bookingLeadTimeMin: 60,
    bookingHorizonDays: 60,
    cancellationWindowHours: opts.cancellationWindowHours ?? 24,
  });
  const { rows } = await adminPool.query("select slug from shops where id = $1", [s.shopId]);
  return { ...s, slug: rows[0].slug as string, haircutId: haircut.id, secretId: secret.id };
}

const booking = (serviceId: string, extra: Record<string, unknown> = {}) => ({
  serviceId,
  staffMemberId: "any",
  date: TUE,
  time: "10:00",
  fullName: "Carlos Mendes",
  phone: "912345678",
  email: "carlos@example.test",
  ...extra,
});

describe("public booking page", () => {
  it("only shows public services and bookable barbers, and stays closed until enabled", async () => {
    const s = await shopWithOwner();
    const { rows } = await adminPool.query("select slug from shops where id = $1", [s.shopId]);
    const closed = await getPublicShop(rows[0].slug);
    expect(closed?.settings.enabled).toBe(false);
    await createService(s.ctx, { name: "Haircut", durationMin: 30, price: "15" });
    const [svc] = await listServices(s.ctx);
    expect(await code(createPublicBooking(rows[0].slug, booking(svc.id), { baseUrl: BASE }))).toBe("INVALID_STATE");

    const open = await openShop();
    const page = await getPublicShop(open.slug);
    expect(page?.services.map((x) => x.name)).toEqual(["Haircut"]);
    expect(page?.staff.map((x) => x.name).sort()).toEqual(["Miguel", "Owner"]);
    expect(await getPublicShop("no-such-shop")).toBeNull();
  });

  it("books 'any barber', spreading load, and refuses private services", async () => {
    const s = await openShop();
    const a = await createPublicBooking(s.slug, booking(s.haircutId), { baseUrl: BASE });
    const b = await createPublicBooking(s.slug, booking(s.haircutId, { phone: "913333333", fullName: "Bruno" }), { baseUrl: BASE });
    const range = { from: zonedTimeToUtc(TUE, 0, TZ)!, to: zonedTimeToUtc(TUE, 1439, TZ)! };
    const appts = await listAppointments(s.ctx, range);
    expect(new Set(appts.map((x) => x.staffMemberId)).size).toBe(2); // one each
    expect(appts.every((x) => x.source === "online" && x.status === "confirmed")).toBe(true);
    // Both barbers are now busy at 10:00.
    expect(await code(createPublicBooking(s.slug, booking(s.haircutId, { phone: "914444444" }), { baseUrl: BASE }))).toBe("CONFLICT");
    expect(await code(createPublicBooking(s.slug, booking(s.secretId), { baseUrl: BASE }))).toBe("CONFLICT");
    expect(a.token).not.toBe(b.token);
  });

  it("respects lead time and only offers real free times", async () => {
    const s = await openShop();
    const [miguel] = (await listStaff(s.ctx)).filter((x) => x.displayName === "Miguel");
    await createPublicBooking(s.slug, booking(s.haircutId, { staffMemberId: miguel.id }), { baseUrl: BASE });
    const days = await getPublicAvailability(s.slug, { serviceId: s.haircutId, staffMemberId: miguel.id, fromDate: TUE, days: 1 });
    expect(days[0].times).not.toContain("10:00");
    expect(days[0].times).toContain("10:30");
    // 45 minutes before the slot is inside the 60-minute lead time.
    const now = new Date(zonedTimeToUtc(TUE, 13 * 60 + 15, TZ)!);
    const tooSoon = await getPublicAvailability(s.slug, { serviceId: s.haircutId, staffMemberId: miguel.id, fromDate: TUE, days: 1 }, now);
    expect(tooSoon[0].times[0]).toBe("14:30");
  });

  it("requires email when the shop asks for it, and holds bookings as pending without auto-confirm", async () => {
    const s = await openShop({ requireEmail: true, autoConfirm: false });
    expect(await code(createPublicBooking(s.slug, booking(s.haircutId, { email: "" }), { baseUrl: BASE }))).toBe("VALIDATION");
    const { token } = await createPublicBooking(s.slug, booking(s.haircutId), { baseUrl: BASE });
    expect((await getManagedBooking(token))?.appointment.status).toBe("pending");
  });

  it("recognises returning customers and records marketing consent only when given", async () => {
    const s = await openShop();
    await createPublicBooking(s.slug, booking(s.haircutId, { email: "" }), { baseUrl: BASE });
    await createPublicBooking(s.slug, booking(s.haircutId, { time: "11:00", phone: "+351 912 345 678", marketingOptIn: true }), { baseUrl: BASE });
    const { rows } = await adminPool.query("select email, marketing_consent_at, source from customers where shop_id = $1", [s.shopId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("carlos@example.test"); // filled in on the second visit
    expect(rows[0].marketing_consent_at).not.toBeNull();
    expect(rows[0].source).toBe("online");
  });

  it("lets two customers race for the last slot and exactly one wins", async () => {
    const s = await openShop();
    const [miguel] = (await listStaff(s.ctx)).filter((x) => x.displayName === "Miguel");
    const results = await Promise.all(
      [1, 2, 3].map((i) =>
        code(createPublicBooking(s.slug, booking(s.haircutId, { staffMemberId: miguel.id, phone: `91500000${i}` }), { baseUrl: BASE })),
      ),
    );
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
  });
});

describe("manage my booking", () => {
  it("shows the booking, reschedules and cancels within the window, with emails queued", async () => {
    const s = await openShop();
    const { token } = await createPublicBooking(s.slug, booking(s.haircutId), { baseUrl: BASE });
    const managed = await getManagedBooking(token);
    expect(managed?.appointment.serviceName).toBe("Haircut");
    expect(managed?.policy.canChange).toBe(true);

    const options = await getRescheduleAvailability(token, { fromDate: TUE, days: 1 });
    expect(options[0].times).toContain("10:00"); // its own slot counts as free
    await rescheduleManagedBooking(token, { date: TUE, time: "15:00" }, { baseUrl: BASE });
    expect((await getManagedBooking(token))?.appointment.startsAt.toISOString()).toBe(zonedTimeToUtc(TUE, 15 * 60, TZ)!.toISOString());

    await cancelManagedBooking(token, { baseUrl: BASE });
    expect((await getManagedBooking(token))?.appointment.status).toBe("cancelled");
    expect(await code(cancelManagedBooking(token, { baseUrl: BASE }))).toBe("INVALID_STATE");

    const { rows } = await adminPool.query("select template, status from notification_outbox where shop_id = $1 order by created_at", [s.shopId]);
    expect(rows.map((r) => r.template)).toEqual(["booking_created", "booking_rescheduled", "booking_cancelled"]);
    expect(await getManagedBooking("not-a-token")).toBeNull();
  });

  it("blocks online changes inside the cancellation window", async () => {
    const s = await openShop({ cancellationWindowHours: 24 });
    const { token } = await createPublicBooking(s.slug, booking(s.haircutId), { baseUrl: BASE });
    const dayBefore = new Date(zonedTimeToUtc(TUE, 10 * 60, TZ)!.getTime() - 3 * 3600_000);
    expect((await getManagedBooking(token, dayBefore))?.policy.canChange).toBe(false);
    expect(await code(cancelManagedBooking(token, { baseUrl: BASE, now: dayBefore }))).toBe("INVALID_STATE");
  });

  it("emails the customer when staff cancel, and delivers the outbox exactly once", async () => {
    const s = await openShop();
    const { token } = await createPublicBooking(s.slug, booking(s.haircutId), { baseUrl: BASE });
    const { rows: appts } = await adminPool.query("select id from appointments where shop_id = $1", [s.shopId]);
    await changeAppointmentStatus(s.ctx, { appointmentId: appts[0].id, to: "cancelled", version: 1 });
    expect((await getManagedBooking(token))?.appointment.status).toBe("cancelled");

    const [first, second] = await Promise.all([deliverDueForShop(s.shopId), deliverDueForShop(s.shopId)]);
    expect(first.sent + second.sent).toBe(2); // created + cancelled, never twice
    expect((await deliverAllDue()).sent).toBe(0);
    const { rows } = await adminPool.query("select status from notification_outbox where shop_id = $1", [s.shopId]);
    expect(rows.every((r) => r.status === "sent")).toBe(true);
  });
});
