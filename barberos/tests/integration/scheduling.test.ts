import { describe, expect, it } from "vitest";
import { createService, listServices, setServiceActive, updateService } from "@/server/domain/services/service";
import {
  addTimeOff,
  createStaffProfile,
  getStaffProfile,
  listStaff,
  replaceWorkingHours,
  setStaffActive,
  setStaffServices,
} from "@/server/domain/staff/service";
import {
  changeAppointmentStatus,
  createAppointment,
  getAppointment,
  getAvailableSlots,
  listAppointments,
  rescheduleAppointment,
  updateAppointmentNotes,
} from "@/server/domain/appointments/service";
import { addClosure } from "@/server/domain/shops/service";
import { searchCustomers } from "@/server/domain/customers/service";
import { withTenantTx } from "@/server/db/tenant";
import { appointmentEvents } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { formatClock, zonedTimeToUtc } from "@/lib/time";
import { actorFor, addMember, adminPool, createUser, futureWeekday, shopWithOwner } from "./helpers";
import { acceptInvitation, inviteMember } from "@/server/domain/team/service";

const TZ = "Europe/Lisbon";
const TUE = futureWeekday(2); // default shop hours: Tue–Sat 09:00–19:00

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "OK";
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
}

/** A shop with an owner who cuts hair, one service, and a customer-ready setup. */
async function setup() {
  const s = await shopWithOwner("Owner");
  await createService(s.ctx, { name: "Haircut", durationMin: 30, bufferAfterMin: 10, price: "15", staffMemberIds: [] });
  // The owner's profile was created before the service existed, so assign it.
  const [ownerStaff] = await listStaff(s.ctx);
  const [haircut] = await listServices(s.ctx);
  await setStaffServices(s.ctx, ownerStaff.id, [{ serviceId: haircut.id }]);
  return { ...s, staffId: ownerStaff.id, serviceId: haircut.id };
}

function book(ctx: Parameters<typeof createAppointment>[0], staffMemberId: string, serviceId: string, time: string, extra: Record<string, unknown> = {}) {
  return createAppointment(ctx, {
    staffMemberId,
    serviceId,
    date: TUE,
    time,
    newCustomer: { fullName: "Carlos Mendes", phone: "912345678" },
    ...extra,
  });
}

describe("services", () => {
  it("creates services, assigns barbers and protects price history", async () => {
    const { ctx, staffId, serviceId } = await setup();
    const { appointmentId } = await book(ctx, staffId, serviceId, "10:00");
    await updateService(ctx, serviceId, { name: "Haircut", durationMin: 45, price: "20,00", staffMemberIds: [staffId] });
    const appt = await getAppointment(ctx, appointmentId);
    expect(appt.appointment.priceCents).toBe(1500); // the booked price is kept
    expect(appt.appointment.durationMin).toBe(30);
    const [svc] = await listServices(ctx);
    expect(svc).toMatchObject({ priceCents: 2000, durationMin: 45, staffCount: 1 });
  });

  it("is managed only by owners and managers, and inactive services can't be booked", async () => {
    const { ctx, shopId, staffId, serviceId } = await setup();
    const { ctx: barber } = await addMember(shopId, "barber");
    expect(await code(createService(barber, { name: "X", durationMin: 30, price: "10" }))).toBe("FORBIDDEN");
    expect(await code(createService(ctx, { name: "X", durationMin: 3, price: "abc" }))).toBe("VALIDATION");
    await setServiceActive(ctx, serviceId, false);
    expect(await code(book(ctx, staffId, serviceId, "10:00"))).toBe("VALIDATION");
  });
});

describe("staff profiles", () => {
  it("creates a barber without a login, with the shop's hours and all services", async () => {
    const { ctx, serviceId } = await setup();
    const { staffMemberId } = await createStaffProfile(ctx, { displayName: "Zé", calendarColor: "sage" });
    const profile = await getStaffProfile(ctx, staffMemberId);
    expect(profile.hours).toHaveLength(5);
    expect(profile.services.find((s) => s.id === serviceId)?.offered).toBe(true);
    expect(profile.profile.membershipId).toBeNull();
    await setStaffActive(ctx, staffMemberId, false);
    expect((await listStaff(ctx)).map((s) => s.displayName)).not.toContain("Zé");
  });

  it("gives invited barbers working hours and services automatically", async () => {
    const { ctx, serviceId } = await setup();
    const user = await createUser("Rui", "rui@example.test");
    const invite = await inviteMember(ctx, { email: user.email, role: "barber" });
    const { shopId } = await acceptInvitation(user, invite.token);
    const rui = (await listStaff(ctx)).find((s) => s.displayName === "Rui")!;
    const profile = await getStaffProfile(ctx, rui.id);
    expect(profile.hours.length).toBeGreaterThan(0);
    expect(profile.services.find((s) => s.id === serviceId)?.offered).toBe(true);
    // Linked profiles follow the membership, not this switch.
    expect(await code(setStaffActive(ctx, rui.id, false))).toBe("FORBIDDEN");
    expect(shopId).toBe(ctx.shopId);
  });

  it("stores all-day time off in the shop's time zone", async () => {
    const { ctx, staffId } = await setup();
    await addTimeOff(ctx, staffId, { startsOn: TUE, endsOn: TUE, allDay: true, type: "holiday" });
    const { rows } = await adminPool.query("select starts_at, ends_at from time_off");
    expect(rows[0].starts_at.toISOString()).toBe(zonedTimeToUtc(TUE, 0, TZ)!.toISOString());
    expect(rows[0].ends_at.getTime() - rows[0].starts_at.getTime()).toBeGreaterThanOrEqual(23 * 3600_000);
  });
});

describe("appointments", () => {
  it("books inside working hours and blocks overlaps, including the buffer", async () => {
    const { ctx, staffId, serviceId } = await setup();
    await book(ctx, staffId, serviceId, "10:00"); // 10:00–10:30, blocked until 10:40
    expect(await code(book(ctx, staffId, serviceId, "10:15"))).toBe("CONFLICT");
    expect(await code(book(ctx, staffId, serviceId, "09:35"))).toBe("CONFLICT"); // its buffer would hit 10:00
    expect(await code(book(ctx, staffId, serviceId, "10:30"))).toBe("CONFLICT");
    expect(await code(book(ctx, staffId, serviceId, "10:40"))).toBe("OK");
  });

  it("lets exactly one of two simultaneous bookings for the same slot succeed", async () => {
    const { ctx, staffId, serviceId } = await setup();
    const results = await Promise.all([
      code(book(ctx, staffId, serviceId, "11:00")),
      code(book(ctx, staffId, serviceId, "11:00", { newCustomer: { fullName: "Other", phone: "913333333" } })),
      code(book(ctx, staffId, serviceId, "11:15", { newCustomer: { fullName: "Third", phone: "914444444" } })),
    ]);
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(results.filter((r) => r === "CONFLICT")).toHaveLength(2);
    const { rows } = await adminPool.query("select count(*)::int as n from appointments");
    expect(rows[0].n).toBe(1);
  });

  it("respects working hours, time off and closures, with an owner-only override for hours", async () => {
    const { ctx, shopId, staffId, serviceId } = await setup();
    expect(await code(book(ctx, staffId, serviceId, "19:00"))).toBe("VALIDATION");
    expect(await code(book(ctx, staffId, serviceId, "19:00", { allowOutsideHours: true }))).toBe("OK");

    await replaceWorkingHours(ctx, staffId, [{ weekday: 2, opensAt: "14:00", closesAt: "18:00" }]);
    expect(await code(book(ctx, staffId, serviceId, "10:00"))).toBe("VALIDATION");

    await addTimeOff(ctx, staffId, { startsOn: TUE, endsOn: TUE, allDay: false, startTime: "15:00", endTime: "16:00" });
    expect(await code(book(ctx, staffId, serviceId, "15:30"))).toBe("VALIDATION");
    expect(await code(book(ctx, staffId, serviceId, "14:00"))).toBe("OK");

    await addClosure(ctx, { startsOn: TUE, endsOn: TUE, reason: "Holiday" });
    expect(await code(book(ctx, staffId, serviceId, "16:30"))).toBe("VALIDATION");

    // Barbers can't override hours.
    const { staffMemberId } = await createStaffProfile(ctx, { displayName: "Linked" });
    const { ctx: barber } = await addMember(shopId, "barber");
    await adminPool.query("update staff_members set membership_id = $1 where id = $2", [barber.membershipId, staffMemberId]);
    expect(await code(book(barber, staffMemberId, serviceId, "08:00", { allowOutsideHours: true }))).toBe("VALIDATION");
  });

  it("offers only free slots", async () => {
    const { ctx, staffId, serviceId } = await setup();
    await book(ctx, staffId, serviceId, "09:00");
    const slots = (await getAvailableSlots(ctx, { staffMemberId: staffId, serviceId, date: TUE })).map((d) => formatClock(d, TZ));
    expect(slots).not.toContain("09:00");
    expect(slots).not.toContain("09:30"); // blocked until 09:40
    expect(slots).toContain("09:45");
    expect(slots.at(-1)).toBe("18:30");
  });

  it("recognises returning customers by phone in any format", async () => {
    const { ctx, staffId, serviceId } = await setup();
    const a = await book(ctx, staffId, serviceId, "09:00", { newCustomer: { fullName: "Carlos", phone: "912 345 678" } });
    const b = await book(ctx, staffId, serviceId, "12:00", { newCustomer: { fullName: "Carlos M.", phone: "+351912345678" } });
    const [x, y] = await Promise.all([getAppointment(ctx, a.appointmentId), getAppointment(ctx, b.appointmentId)]);
    expect(x.customer.id).toBe(y.customer.id);
    expect((await searchCustomers(ctx, "carl")).map((c) => c.fullName)).toEqual(["Carlos"]);
    expect((await searchCustomers(ctx, "345 678")).length).toBe(1);
    expect(await code(book(ctx, staffId, serviceId, "15:00", { newCustomer: { fullName: "Bad", phone: "12" } }))).toBe("VALIDATION");
  });

  it("follows the status machine and frees the slot on cancellation", async () => {
    const { ctx, staffId, serviceId } = await setup();
    const { appointmentId } = await book(ctx, staffId, serviceId, "10:00");
    // Can't complete or no-show before it starts.
    expect(await code(changeAppointmentStatus(ctx, { appointmentId, to: "completed", version: 1 }))).toBe("INVALID_STATE");

    const after = new Date(zonedTimeToUtc(TUE, 10 * 60 + 35, TZ)!);
    await changeAppointmentStatus(ctx, { appointmentId, to: "completed", version: 1 }, after);
    const done = await getAppointment(ctx, appointmentId);
    expect(done.appointment.status).toBe("completed");
    expect(done.customer.visitCount).toBe(1);
    // Terminal.
    expect(await code(changeAppointmentStatus(ctx, { appointmentId, to: "cancelled", version: 2 }))).toBe("INVALID_STATE");

    const second = await book(ctx, staffId, serviceId, "12:00");
    await changeAppointmentStatus(ctx, { appointmentId: second.appointmentId, to: "cancelled", reason: "Called in sick", version: 1 });
    expect(await code(book(ctx, staffId, serviceId, "12:00"))).toBe("OK");
    const cancelled = await getAppointment(ctx, second.appointmentId);
    expect(cancelled.appointment).toMatchObject({ status: "cancelled", cancelledBy: "staff", cancelReason: "Called in sick" });
  });

  it("reschedules with optimistic locking and keeps a history", async () => {
    const { ctx, staffId, serviceId } = await setup();
    const { appointmentId } = await book(ctx, staffId, serviceId, "10:00");
    await book(ctx, staffId, serviceId, "14:00");
    expect(await code(rescheduleAppointment(ctx, { appointmentId, staffMemberId: staffId, date: TUE, time: "14:15", version: 1 }))).toBe("CONFLICT");
    // Moving onto its own old slot (overlapping itself) is fine.
    await rescheduleAppointment(ctx, { appointmentId, staffMemberId: staffId, date: TUE, time: "10:15", version: 1 });
    // A stale version is rejected.
    expect(await code(rescheduleAppointment(ctx, { appointmentId, staffMemberId: staffId, date: TUE, time: "11:00", version: 1 }))).toBe("CONFLICT");
    await updateAppointmentNotes(ctx, { appointmentId, internalNote: "Prefers scissors on top" });
    const appt = await getAppointment(ctx, appointmentId);
    expect(formatClock(appt.appointment.startsAt, TZ)).toBe("10:15");
    expect(appt.events.map((e) => e.type)).toEqual(["edited", "rescheduled", "created"]);
  });

  it("keeps barbers to their own appointments", async () => {
    const { ctx, shopId, staffId, serviceId } = await setup();
    const user = await createUser("Rui", "rui2@example.test");
    const invite = await inviteMember(ctx, { email: user.email, role: "barber" });
    await acceptInvitation(user, invite.token);
    const barber = await actorFor(user, shopId);
    const ruiStaff = (await listStaff(ctx)).find((s) => s.displayName === "Rui")!;

    const ownersAppt = await book(ctx, staffId, serviceId, "10:00");
    expect(await code(book(barber, staffId, serviceId, "11:00"))).toBe("FORBIDDEN");
    const own = await book(barber, ruiStaff.id, serviceId, "11:00");

    const range = { from: zonedTimeToUtc(TUE, 0, TZ)!, to: zonedTimeToUtc(TUE, 1439, TZ)! };
    expect((await listAppointments(barber, range)).map((a) => a.id)).toEqual([own.appointmentId]);
    expect((await listAppointments(ctx, range)).length).toBe(2);
    expect(await code(getAppointment(barber, ownersAppt.appointmentId))).toBe("FORBIDDEN");
    expect(await code(changeAppointmentStatus(barber, { appointmentId: ownersAppt.appointmentId, to: "cancelled", version: 1 }))).toBe("FORBIDDEN");
  });

  it("isolates appointments between shops and keeps their history append-only", async () => {
    const a = await setup();
    const b = await setup();
    await book(a.ctx, a.staffId, a.serviceId, "10:00");
    const range = { from: zonedTimeToUtc(TUE, 0, TZ)!, to: zonedTimeToUtc(TUE, 1439, TZ)! };
    expect(await listAppointments(b.ctx, range)).toEqual([]);
    // Shop B can't book shop A's barber or service.
    expect(await code(book(b.ctx, a.staffId, a.serviceId, "10:00"))).toBe("VALIDATION");
    const err = await withTenantTx({ shopId: a.shopId }, (tx) => tx.delete(appointmentEvents)).catch((e) => e.cause?.message);
    expect(err).toMatch(/permission denied/);
  });
});

describe("shop deletion (data lifecycle)", () => {
  it("removes every row belonging to the shop, and nothing else", async () => {
    const a = await setup();
    const b = await setup();
    await book(a.ctx, a.staffId, a.serviceId, "10:00");
    await book(b.ctx, b.staffId, b.serviceId, "10:00");
    await adminPool.query("delete from shops where id = $1", [a.shopId]);
    const tables = ["appointments", "appointment_events", "customers", "services", "staff_members", "staff_services", "working_hours", "shop_memberships", "audit_log"];
    for (const t of tables) {
      const { rows } = await adminPool.query(`select count(*)::int as n from ${t} where shop_id = $1`, [a.shopId]);
      expect([t, rows[0].n]).toEqual([t, 0]);
      const other = await adminPool.query(`select count(*)::int as n from ${t} where shop_id = $1`, [b.shopId]);
      expect(other.rows[0].n).toBeGreaterThan(0);
    }
  });
});
