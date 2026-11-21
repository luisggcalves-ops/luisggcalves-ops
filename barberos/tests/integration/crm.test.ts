import { describe, expect, it } from "vitest";
import {
  addCustomerNote,
  anonymizeCustomer,
  deleteCustomerNote,
  exportCustomer,
  getCustomerProfile,
  listCustomers,
  updateCustomer,
} from "@/server/domain/customers/crm";
import { createService, listServices } from "@/server/domain/services/service";
import { listStaff, setStaffServices } from "@/server/domain/staff/service";
import { createAppointment, changeAppointmentStatus } from "@/server/domain/appointments/service";
import { acceptInvitation, inviteMember } from "@/server/domain/team/service";
import { DomainError } from "@/server/errors";
import { zonedTimeToUtc } from "@/lib/time";
import { actorFor, addMember, adminPool, createUser, futureWeekday, shopWithOwner } from "./helpers";

const TUE = futureWeekday(2);

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "OK";
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
}

async function setup() {
  const s = await shopWithOwner("Owner");
  await createService(s.ctx, { name: "Haircut", durationMin: 30, price: "15" });
  const [svc] = await listServices(s.ctx);
  const user = await createUser("Rui", `rui-${Date.now()}@example.test`);
  const inv = await inviteMember(s.ctx, { email: user.email, role: "barber" });
  await acceptInvitation(user, inv.token);
  const barber = await actorFor(user, s.shopId);
  const staff = await listStaff(s.ctx);
  for (const st of staff) await setStaffServices(s.ctx, st.id, [{ serviceId: svc.id }]);
  const ownerStaff = staff.find((x) => x.displayName === "Owner")!;
  const ruiStaff = staff.find((x) => x.displayName === "Rui")!;
  const book = (staffMemberId: string, time: string, name: string, phone: string) =>
    createAppointment(s.ctx, { staffMemberId, serviceId: svc.id, date: TUE, time, newCustomer: { fullName: name, phone, email: `${phone}@example.test` } });
  const a = await book(ruiStaff.id, "10:00", "Rui's Client", "912000001");
  const b = await book(ownerStaff.id, "10:00", "Owner's Client", "912000002");
  const { rows } = await adminPool.query("select id, full_name from customers where shop_id = $1", [s.shopId]);
  const idOf = (n: string) => rows.find((r) => r.full_name === n).id as string;
  return { ...s, barber, ruiClient: idOf("Rui's Client"), ownerClient: idOf("Owner's Client"), apptA: a.appointmentId, apptB: b.appointmentId, ownerStaff, ruiStaff };
}

describe("customer CRM", () => {
  it("shows owners everyone and barbers only their own customers", async () => {
    const s = await setup();
    expect((await listCustomers(s.ctx)).rows.map((r) => r.fullName).sort()).toEqual(["Owner's Client", "Rui's Client"]);
    expect((await listCustomers(s.barber)).rows.map((r) => r.fullName)).toEqual(["Rui's Client"]);
    expect(await code(getCustomerProfile(s.barber, s.ownerClient))).toBe("NOT_FOUND");
    expect((await getCustomerProfile(s.barber, s.ruiClient)).customer.fullName).toBe("Rui's Client");
    expect((await listCustomers(s.ctx, { q: "rui" })).rows).toHaveLength(1);
  });

  it("lets barbers write haircut notes for their customers and delete only their own", async () => {
    const s = await setup();
    const { noteId } = await addCustomerNote(s.barber, s.ruiClient, { body: "#2 sides, scissors on top", appointmentId: s.apptA }, "Rui");
    const ownerNote = await addCustomerNote(s.ctx, s.ruiClient, { body: "Prefers mornings", kind: "general" }, "Owner");
    expect(await code(addCustomerNote(s.barber, s.ownerClient, { body: "x" }, "Rui"))).toBe("NOT_FOUND");
    expect(await code(addCustomerNote(s.barber, s.ruiClient, { body: "x", appointmentId: s.apptB }, "Rui"))).toBe("VALIDATION");
    expect(await code(deleteCustomerNote(s.barber, ownerNote.noteId))).toBe("FORBIDDEN");
    await deleteCustomerNote(s.barber, noteId);
    const profile = await getCustomerProfile(s.ctx, s.ruiClient);
    expect(profile.notes.map((n) => n.body)).toEqual(["Prefers mornings"]);
  });

  it("edits contact details with phone normalization and duplicate protection", async () => {
    const s = await setup();
    await updateCustomer(s.ctx, s.ruiClient, { fullName: "Carlos Rui", phone: "+351 913 000 999", email: "c@example.test", preferredStaffMemberId: s.ruiStaff.id, hairPreferences: "Low fade", marketingConsent: true });
    const p = await getCustomerProfile(s.ctx, s.ruiClient);
    expect(p.customer).toMatchObject({ fullName: "Carlos Rui", phoneE164: "+351913000999", hairPreferences: "Low fade" });
    expect(p.customer.marketingConsentAt).not.toBeNull();
    expect(p.preferredStaffName).toBe("Rui");
    expect(await code(updateCustomer(s.ctx, s.ownerClient, { fullName: "X Y", phone: "913000999" }))).toBe("CONFLICT");
    expect(await code(updateCustomer(s.barber, s.ruiClient, { fullName: "X Y" }))).toBe("FORBIDDEN");
  });

  it("exports everything about a customer (owners and managers only)", async () => {
    const s = await setup();
    await addCustomerNote(s.ctx, s.ruiClient, { body: "Likes it short" }, "Owner");
    const data = await exportCustomer(s.ctx, s.ruiClient);
    expect(data.customer.name).toBe("Rui's Client");
    expect(data.appointments).toHaveLength(1);
    expect(data.notes[0].body).toBe("Likes it short");
    expect(await code(exportCustomer(s.barber, s.ruiClient))).toBe("FORBIDDEN");
    const { ctx: manager } = await addMember(s.shopId, "manager");
    expect(await code(exportCustomer(manager, s.ruiClient))).toBe("OK");
  });

  it("anonymizes on erasure: wipes personal data and notes, cancels future bookings, keeps history counts", async () => {
    const s = await setup();
    // A past completed visit plus the future booking.
    await changeAppointmentStatus(s.ctx, { appointmentId: s.apptA, to: "completed", version: 1 }, new Date(zonedTimeToUtc(TUE, 11 * 60, "Europe/Lisbon")!));
    await adminPool.query("update appointments set starts_at = starts_at - interval '30 days', ends_at = ends_at - interval '30 days', blocked_until = blocked_until - interval '30 days' where id = $1", [s.apptA]);
    const future = await createAppointment(s.ctx, { staffMemberId: s.ruiStaff.id, serviceId: (await listServices(s.ctx))[0].id, date: TUE, time: "12:00", customerId: s.ruiClient });
    await addCustomerNote(s.ctx, s.ruiClient, { body: "Sensitive note" }, "Owner");

    const { ctx: manager } = await addMember(s.shopId, "manager");
    expect(await code(anonymizeCustomer(manager, s.ruiClient))).toBe("FORBIDDEN");
    await anonymizeCustomer(s.ctx, s.ruiClient);

    const { rows } = await adminPool.query("select full_name, phone_e_164 as phone_e164, email, anonymized_at from customers where id = $1", [s.ruiClient]);
    expect(rows[0]).toMatchObject({ full_name: "Deleted customer", phone_e164: null, email: null });
    expect(rows[0].anonymized_at).not.toBeNull();
    const notes = await adminPool.query("select count(*)::int as n from customer_notes where customer_id = $1", [s.ruiClient]);
    expect(notes.rows[0].n).toBe(0);
    const appts = await adminPool.query("select id, status from appointments where customer_id = $1 order by starts_at", [s.ruiClient]);
    expect(appts.rows.map((r) => r.status)).toEqual(["completed", "cancelled"]);
    expect(appts.rows[1].id).toBe(future.appointmentId);
    expect((await listCustomers(s.ctx)).rows.map((r) => r.fullName)).toEqual(["Owner's Client"]);
    const audit = await adminPool.query("select action from audit_log where entity_id = $1", [s.ruiClient]);
    expect(audit.rows.map((r) => r.action)).toContain("customer.anonymized");
  });
});
