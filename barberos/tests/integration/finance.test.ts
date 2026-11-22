import { describe, expect, it } from "vitest";
import {
  createExpense,
  getFinanceSummary,
  getMyEarnings,
  listCommissions,
  recordPayment,
  setCommissionRule,
  voidExpense,
  voidPayment,
} from "@/server/domain/finance/service";
import { createProduct, getProduct, listProducts, lowStockProducts, recordStockMovement } from "@/server/domain/finance/inventory";
import { createService, listServices } from "@/server/domain/services/service";
import { listStaff, setStaffServices } from "@/server/domain/staff/service";
import { changeAppointmentStatus, createAppointment, getAppointment } from "@/server/domain/appointments/service";
import { acceptInvitation, inviteMember } from "@/server/domain/team/service";
import { withTenantTx } from "@/server/db/tenant";
import { commissionRecords, inventoryMovements } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { uuidv7 } from "@/lib/ids";
import { actorFor, addMember, adminPool, createUser, futureWeekday, pastWeekday, shopWithOwner } from "./helpers";

const PAST_TUE = pastWeekday(2);
const RANGE = { fromDate: "2000-01-01", toDate: "2100-01-01" };

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
  await createService(s.ctx, { name: "Skin fade", durationMin: 45, price: "20" });
  const [cut, fade] = await listServices(s.ctx);
  const user = await createUser("Rui", `rui-${uuidv7()}@example.test`);
  const inv = await inviteMember(s.ctx, { email: user.email, role: "barber" });
  await acceptInvitation(user, inv.token);
  const barber = await actorFor(user, s.shopId);
  const staff = await listStaff(s.ctx);
  for (const st of staff) await setStaffServices(s.ctx, st.id, [{ serviceId: cut.id }, { serviceId: fade.id }]);
  const owner = staff.find((x) => x.displayName === "Owner")!;
  const rui = staff.find((x) => x.displayName === "Rui")!;
  // Rules: shop default 40%, Rui 50%, Rui on skin fades a fixed €9, products 10%.
  await setCommissionRule(s.ctx, { type: "percent", percent: 40 });
  await setCommissionRule(s.ctx, { type: "percent", percent: 50, staffMemberId: rui.id });
  await setCommissionRule(s.ctx, { type: "fixed", amount: "9", staffMemberId: rui.id, serviceId: fade.id });
  await setCommissionRule(s.ctx, { appliesTo: "products", type: "percent", percent: 10 });
  const { productId } = await createProduct(s.ctx, { name: "Matte clay", cost: "4", price: "12", lowStockThreshold: 3 }, 5);
  let n = 0;
  const book = async (staffMemberId: string, serviceId: string, time: string, date = PAST_TUE) =>
    (await createAppointment(s.ctx, { staffMemberId, serviceId, date, time, newCustomer: { fullName: `Client ${++n}`, phone: `91200${String(n).padStart(4, "0")}` } })).appointmentId;
  return { ...s, barber, owner, rui, cut, fade, productId, book };
}

const pay = (appointmentId: string | null, items: object[], extra: Record<string, unknown> = {}) => ({
  appointmentId,
  method: "card",
  items,
  idempotencyKey: uuidv7(),
  ...extra,
});

describe("recording payments", () => {
  it("completes the appointment and credits commission, product sale, stock and tip", async () => {
    const s = await setup();
    const appt = await s.book(s.rui.id, s.cut.id, "10:00");
    const { paymentId } = await recordPayment(
      s.ctx,
      pay(appt, [
        { kind: "service", serviceId: s.cut.id, unitPrice: "15" },
        { kind: "product", productId: s.productId, quantity: 2, unitPrice: "12" },
      ], { tip: "2" }),
    );
    expect(paymentId).toBeTruthy();
    const a = await getAppointment(s.ctx, appt);
    expect(a.appointment.status).toBe("completed");
    expect(a.customer.visitCount).toBe(1);

    const comm = await listCommissions(s.ctx, { ...RANGE });
    expect(comm.map((c) => c.amountCents).sort((x, y) => x - y)).toEqual([240, 750]); // 10% of €24, 50% of €15
    expect((await listProducts(s.ctx))[0].stockQty).toBe(3);

    const sum = await getFinanceSummary(s.ctx, RANGE);
    expect(sum).toMatchObject({ revenue: 3900, serviceRevenue: 1500, productRevenue: 2400, productCost: 800, commissions: 990, tips: 200 });
    expect(sum.byStaff[0]).toMatchObject({ name: "Rui", revenue: 3900, commission: 990, tips: 200 });

    const earnings = await getMyEarnings(s.barber, RANGE);
    expect(earnings).toMatchObject({ services: 1, revenue: 3900, commission: 990, tips: 200 });
  });

  it("uses the most specific rule and keeps past commissions when rules change", async () => {
    const s = await setup();
    const a1 = await s.book(s.rui.id, s.fade.id, "10:00");
    const a2 = await s.book(s.owner.id, s.fade.id, "10:00");
    await recordPayment(s.ctx, pay(a1, [{ kind: "service", serviceId: s.fade.id, unitPrice: "20" }]));
    await recordPayment(s.ctx, pay(a2, [{ kind: "service", serviceId: s.fade.id, unitPrice: "18" }])); // owner gave a discount
    await setCommissionRule(s.ctx, { type: "percent", percent: 10 }); // the default changes afterwards
    const comm = await listCommissions(s.ctx, RANGE);
    const byStaff = Object.fromEntries(comm.map((c) => [c.staffName, c.amountCents]));
    expect(byStaff).toEqual({ Rui: 900, Owner: 720 }); // fixed €9, and 40% of €18
  });

  it("is idempotent, and an appointment can only be paid once even under a race", async () => {
    const s = await setup();
    const appt = await s.book(s.rui.id, s.cut.id, "11:00");
    const input = pay(appt, [{ kind: "service", serviceId: s.cut.id, unitPrice: "15" }]);
    const first = await recordPayment(s.ctx, input);
    const again = await recordPayment(s.ctx, input);
    expect(again).toEqual({ paymentId: first.paymentId, duplicate: true });

    const appt2 = await s.book(s.owner.id, s.cut.id, "11:00");
    const results = await Promise.all([1, 2, 3].map(() => code(recordPayment(s.ctx, pay(appt2, [{ kind: "service", serviceId: s.cut.id, unitPrice: "15" }])))));
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    const { rows } = await adminPool.query("select count(*)::int as n from payments where shop_id = $1", [s.shopId]);
    expect(rows[0].n).toBe(2);
  });

  it("refuses payments for future, cancelled or no-show appointments", async () => {
    const s = await setup();
    const future = await s.book(s.rui.id, s.cut.id, "10:00", futureWeekday(2));
    expect(await code(recordPayment(s.ctx, pay(future, [{ kind: "service", unitPrice: "15", description: "Cut" }])))).toBe("INVALID_STATE");
    const past = await s.book(s.rui.id, s.cut.id, "12:00");
    await changeAppointmentStatus(s.ctx, { appointmentId: past, to: "no_show", version: 1 });
    expect(await code(recordPayment(s.ctx, pay(past, [{ kind: "service", unitPrice: "15", description: "Cut" }])))).toBe("INVALID_STATE");
  });

  it("voids with reversals: revenue, commission and stock all go back, and it can be paid again", async () => {
    const s = await setup();
    const appt = await s.book(s.rui.id, s.cut.id, "10:00");
    const { paymentId } = await recordPayment(s.ctx, pay(appt, [
      { kind: "service", serviceId: s.cut.id, unitPrice: "15" },
      { kind: "product", productId: s.productId, unitPrice: "12" },
    ]));
    await voidPayment(s.ctx, { paymentId, reason: "Charged the wrong card" });
    expect(await code(voidPayment(s.ctx, { paymentId, reason: "Again" }))).toBe("INVALID_STATE");
    const sum = await getFinanceSummary(s.ctx, RANGE);
    expect(sum).toMatchObject({ revenue: 0, commissions: 0, productCost: 0 });
    expect((await listProducts(s.ctx))[0].stockQty).toBe(5);
    const { rows } = await adminPool.query("select kind, sum(amount_cents)::int as total from commission_records where payment_id = $1 group by kind order by kind", [paymentId]);
    expect(rows).toEqual([{ kind: "earned", total: 870 }, { kind: "reversal", total: -870 }]);
    // Corrected payment.
    expect(await code(recordPayment(s.ctx, pay(appt, [{ kind: "service", serviceId: s.cut.id, unitPrice: "15" }], { method: "cash" })))).toBe("OK");
  });

  it("reconciles: profit = revenue − product cost − commissions − expenses", async () => {
    const s = await setup();
    const a = await s.book(s.owner.id, s.cut.id, "09:00");
    const b = await s.book(s.rui.id, s.fade.id, "09:00");
    await recordPayment(s.ctx, pay(a, [{ kind: "service", serviceId: s.cut.id, unitPrice: "15" }]));
    await recordPayment(s.ctx, pay(b, [{ kind: "service", serviceId: s.fade.id, unitPrice: "20" }, { kind: "product", productId: s.productId, unitPrice: "12" }]));
    await recordPayment(s.ctx, pay(null, [{ kind: "product", productId: s.productId, unitPrice: "12", quantity: 1 }], { method: "cash" })); // walk-in sale
    await createExpense(s.ctx, { category: "rent", amount: "30", incurredOn: PAST_TUE });
    const { expenseId } = await createExpense(s.ctx, { category: "other", amount: "999", incurredOn: PAST_TUE });
    await voidExpense(s.ctx, { expenseId, reason: "Typo" });
    const sum = await getFinanceSummary(s.ctx, RANGE);
    const revenue = 1500 + 2000 + 1200 + 1200;
    const cogs = 400 * 2;
    // 40% of the cut, €9 fixed for Rui's fade, 10% of the product Rui sold.
    // The walk-in product sale credited no barber, so it earns no commission.
    const commissions = 600 + 900 + 120;
    expect(sum).toMatchObject({ revenue, productCost: cogs, commissions, expenses: 3000 });
    expect(sum.profit).toBe(revenue - cogs - commissions - 3000);
    expect(sum.byMethod.map((m) => m.method).sort()).toEqual(["card", "cash"]);
  });
});

describe("finance permissions and integrity", () => {
  it("lets barbers take payment for their own appointments only, when the shop allows it", async () => {
    const s = await setup();
    const own = await s.book(s.rui.id, s.cut.id, "10:00");
    const other = await s.book(s.owner.id, s.cut.id, "10:00");
    expect(await code(recordPayment(s.barber, pay(other, [{ kind: "service", serviceId: s.cut.id, unitPrice: "15" }])))).toBe("FORBIDDEN");
    await adminPool.query("update shop_settings set barbers_record_payments = false where shop_id = $1", [s.shopId]);
    expect(await code(recordPayment(s.barber, pay(own, [{ kind: "service", serviceId: s.cut.id, unitPrice: "15" }])))).toBe("FORBIDDEN");
    await adminPool.query("update shop_settings set barbers_record_payments = true where shop_id = $1", [s.shopId]);
    // Barbers can't credit someone else, even if they try.
    await recordPayment(s.barber, pay(own, [{ kind: "service", serviceId: s.cut.id, unitPrice: "15", staffMemberId: s.owner.id }]));
    expect((await listCommissions(s.ctx, RANGE))[0].staffName).toBe("Rui");
    expect(await code(getFinanceSummary(s.barber, RANGE))).toBe("FORBIDDEN");
    expect(await code(voidPayment(s.barber, { paymentId: uuidv7(), reason: "nope" }))).toBe("FORBIDDEN");
    expect(await code(setCommissionRule(s.barber, { type: "percent", percent: 100 }))).toBe("FORBIDDEN");
    // Barbers see only their own commissions.
    expect((await listCommissions(s.barber, RANGE)).every((c) => c.staffName === "Rui")).toBe(true);
  });

  it("shows managers the finances only if the shop allows it", async () => {
    const s = await setup();
    const { ctx: manager } = await addMember(s.shopId, "manager");
    expect(await code(getFinanceSummary(manager, RANGE))).toBe("OK");
    await adminPool.query("update shop_settings set managers_see_finance = false where shop_id = $1", [s.shopId]);
    expect(await code(getFinanceSummary(manager, RANGE))).toBe("FORBIDDEN");
    expect(await code(setCommissionRule(manager, { type: "percent", percent: 10 }))).toBe("FORBIDDEN");
  });

  it("keeps the money and stock ledgers append-only and isolated per shop", async () => {
    const a = await setup();
    const b = await setup();
    const appt = await a.book(a.rui.id, a.cut.id, "10:00");
    await recordPayment(a.ctx, pay(appt, [{ kind: "service", serviceId: a.cut.id, unitPrice: "15" }]));
    expect((await getFinanceSummary(b.ctx, RANGE)).revenue).toBe(0);
    const scope = { shopId: a.shopId, userId: a.owner.id };
    const err1 = await withTenantTx(scope, (tx) => tx.update(commissionRecords).set({ amountCents: 0 })).catch((e) => e.cause?.message);
    const err2 = await withTenantTx(scope, (tx) => tx.delete(inventoryMovements)).catch((e) => e.cause?.message);
    expect(err1).toMatch(/permission denied/);
    expect(err2).toMatch(/permission denied/);
  });

  it("tracks stock: deliveries update cost, usage reduces stock, low-stock alerts", async () => {
    const s = await setup();
    await recordStockMovement(s.ctx, { productId: s.productId, type: "usage", quantity: 3 });
    expect((await lowStockProducts(s.ctx)).map((p) => p.stockQty)).toEqual([2]);
    await recordStockMovement(s.ctx, { productId: s.productId, type: "purchase", quantity: 10, unitCost: "4.50" });
    const { product, movements } = await getProduct(s.ctx, s.productId);
    expect(product).toMatchObject({ stockQty: 12, costCents: 450 });
    expect(movements.map((m) => m.movement.qtyDelta)).toEqual([10, -3, 5]);
    expect(await lowStockProducts(s.ctx)).toEqual([]);
    expect(await code(recordStockMovement(s.barber, { productId: s.productId, type: "usage", quantity: 1 }))).toBe("FORBIDDEN");
  });
});
