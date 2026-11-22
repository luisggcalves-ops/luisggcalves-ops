import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenantTx } from "@/server/db/tenant";
import type { Tx } from "@/server/db/client";
import {
  appointments,
  commissionRecords,
  commissionRules,
  customers,
  expenses,
  inventoryMovements,
  paymentItems,
  payments,
  products,
  services,
  shops,
  shopSettings,
  staffMembers,
} from "@/server/db/schema";
import { can } from "@/server/authz/permissions";
import { DomainError, conflict, forbidden, invalidState, isUniqueViolation, notFound } from "@/server/errors";
import {
  commissionRuleSchema,
  expenseSchema,
  recordPaymentSchema,
  voidPaymentSchema,
} from "@/lib/validation/finance";
import { addDays, zonedTimeToUtc } from "@/lib/time";
import type { ActorContext } from "../context";
import { audit } from "../audit";
import { parseInput } from "../validate";
import { ownStaffMemberId } from "../staff/service";
import { completeForPayment } from "../appointments/service";
import { computeCommission, resolveRule, type CommissionRule } from "./commission";

/* ------------------------------------------------------------------------ */
/* Access                                                                    */
/* ------------------------------------------------------------------------ */

async function settings(tx: Tx, shopId: string) {
  const [s] = await tx.select().from(shopSettings).where(eq(shopSettings.shopId, shopId));
  if (!s) throw notFound("Shop not found.");
  return s;
}

/** Owners always see finance. Managers only if the shop allows it. Barbers never see shop-wide figures. */
async function assertFinanceView(tx: Tx, ctx: ActorContext) {
  if (ctx.role === "owner") return;
  if (ctx.role === "manager" && can(ctx.role, "finance.view") && (await settings(tx, ctx.shopId)).managersSeeFinance) return;
  throw forbidden("You don't have access to the shop's finances.");
}

export async function canViewFinance(ctx: ActorContext): Promise<boolean> {
  if (ctx.role === "owner") return true;
  if (ctx.role !== "manager") return false;
  return withTenantTx(ctx, async (tx) => (await settings(tx, ctx.shopId)).managersSeeFinance);
}

/** Shop-local inclusive date range → [from, to) instants. */
function instantRange(fromDate: string, toDate: string, timeZone: string) {
  return { from: zonedTimeToUtc(fromDate, 0, timeZone)!, to: zonedTimeToUtc(addDays(toDate, 1), 0, timeZone)! };
}

async function shopTz(tx: Tx, shopId: string) {
  const [s] = await tx.select({ timezone: shops.timezone }).from(shops).where(eq(shops.id, shopId));
  return s.timezone;
}

/* ------------------------------------------------------------------------ */
/* Recording payments                                                        */
/* ------------------------------------------------------------------------ */

async function activeRules(tx: Tx): Promise<CommissionRule[]> {
  return tx
    .select({
      id: commissionRules.id,
      staffMemberId: commissionRules.staffMemberId,
      serviceId: commissionRules.serviceId,
      appliesTo: commissionRules.appliesTo,
      type: commissionRules.type,
      percentBps: commissionRules.percentBps,
      amountCents: commissionRules.amountCents,
    })
    .from(commissionRules)
    .where(eq(commissionRules.active, true));
}

/**
 * Records a payment in one transaction:
 *   the payment and its lines → commission records (per the rules in force) →
 *   stock movements for products → the appointment marked completed → audit.
 * Submitting the same form twice (same idempotency key) returns the first payment.
 * An appointment can only have one active payment (enforced by a unique index).
 */
export async function recordPayment(ctx: ActorContext, input: unknown, now: Date = new Date()): Promise<{ paymentId: string; duplicate: boolean }> {
  const data = parseInput(recordPaymentSchema, input);
  if (!can(ctx.role, "payments.record")) throw forbidden();
  try {
    return await withTenantTx(ctx, async (tx) => {
      const [existing] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.idempotencyKey, data.idempotencyKey));
      if (existing) return { paymentId: existing.id, duplicate: true };

      const s = await settings(tx, ctx.shopId);
      const ownStaff = await ownStaffMemberId(tx, ctx);
      const isBarber = ctx.role === "barber";
      if (isBarber && !s.barbersRecordPayments) throw forbidden("Ask the owner or a manager to take this payment.");

      let customerId = data.customerId ?? null;
      let defaultStaff: string | null = null;
      if (data.appointmentId) {
        const appt = await completeForPayment(tx, ctx, data.appointmentId, now);
        customerId = appt.customerId;
        defaultStaff = appt.staffMemberId;
      } else if (isBarber) {
        // Barbers can only sell on their own behalf.
        defaultStaff = ownStaff;
      }
      if (customerId) {
        const [c] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));
        if (!c) throw new DomainError("VALIDATION", "Customer not found.");
      }

      // Resolve every line: what it is, who is credited, and (for products) its cost.
      const staffIds = new Set((await tx.select({ id: staffMembers.id }).from(staffMembers)).map((r) => r.id));
      const lines: {
        kind: "service" | "product";
        serviceId: string | null;
        productId: string | null;
        staffMemberId: string | null;
        description: string;
        quantity: number;
        unitPriceCents: number;
        unitCostCents: number | null;
      }[] = [];
      for (const [i, item] of data.items.entries()) {
        const staffMemberId = isBarber ? ownStaff : (item.staffMemberId ?? defaultStaff);
        if (staffMemberId && !staffIds.has(staffMemberId)) {
          throw new DomainError("VALIDATION", "Barber not found.", { [`items.${i}.staffMemberId`]: "Not found" });
        }
        if (item.kind === "service") {
          let description = item.description ?? "";
          if (item.serviceId) {
            const [svc] = await tx.select({ name: services.name }).from(services).where(eq(services.id, item.serviceId));
            if (!svc) throw new DomainError("VALIDATION", "Service not found.", { [`items.${i}.serviceId`]: "Not found" });
            description = description || svc.name;
          }
          if (!description) throw new DomainError("VALIDATION", "Describe the service.", { [`items.${i}.description`]: "Required" });
          lines.push({ kind: "service", serviceId: item.serviceId ?? null, productId: null, staffMemberId, description, quantity: item.quantity, unitPriceCents: item.unitPrice, unitCostCents: null });
        } else {
          const [product] = await tx.select().from(products).where(eq(products.id, item.productId!)).for("update");
          if (!product || !product.active) throw new DomainError("VALIDATION", "Product not found.", { [`items.${i}.productId`]: "Not available" });
          lines.push({
            kind: "product",
            serviceId: null,
            productId: product.id,
            staffMemberId,
            description: item.description || product.name,
            quantity: item.quantity,
            unitPriceCents: item.unitPrice,
            unitCostCents: product.costCents,
          });
        }
      }

      const subtotal = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
      const tipStaff = data.tip > 0 ? (isBarber ? ownStaff : (data.tipStaffMemberId ?? defaultStaff)) : null;
      const [payment] = await tx
        .insert(payments)
        .values({
          shopId: ctx.shopId,
          appointmentId: data.appointmentId ?? null,
          customerId,
          method: data.method,
          subtotalCents: subtotal,
          tipCents: data.tip,
          totalCents: subtotal + data.tip,
          tipStaffMemberId: tipStaff,
          note: data.note ?? null,
          idempotencyKey: data.idempotencyKey,
          recordedByUserId: ctx.userId,
          recordedAt: now,
        })
        .returning({ id: payments.id });

      const rules = await activeRules(tx);
      let commissionTotal = 0;
      for (const l of lines) {
        const [item] = await tx
          .insert(paymentItems)
          .values({
            shopId: ctx.shopId,
            paymentId: payment.id,
            kind: l.kind,
            serviceId: l.serviceId,
            productId: l.productId,
            staffMemberId: l.staffMemberId,
            description: l.description,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            totalCents: l.unitPriceCents * l.quantity,
            unitCostCents: l.unitCostCents,
          })
          .returning({ id: paymentItems.id });

        if (l.staffMemberId) {
          const rule = resolveRule(rules, { kind: l.kind, staffMemberId: l.staffMemberId, serviceId: l.serviceId });
          if (rule) {
            const base = l.unitPriceCents * l.quantity;
            const amount = computeCommission(rule, base, l.quantity);
            commissionTotal += amount;
            await tx.insert(commissionRecords).values({
              shopId: ctx.shopId,
              staffMemberId: l.staffMemberId,
              paymentId: payment.id,
              paymentItemId: item.id,
              ruleId: rule.id,
              ruleSnapshot: rule,
              baseCents: base,
              amountCents: amount,
              kind: "earned",
            });
          }
        }
        if (l.kind === "product") {
          await tx.insert(inventoryMovements).values({
            shopId: ctx.shopId,
            productId: l.productId!,
            qtyDelta: -l.quantity,
            type: "sale",
            unitCostCents: l.unitCostCents,
            paymentItemId: item.id,
            actorUserId: ctx.userId,
          });
          await tx
            .update(products)
            .set({ stockQty: sql`${products.stockQty} - ${l.quantity}` })
            .where(eq(products.id, l.productId!));
        }
      }

      await audit(tx, {
        shopId: ctx.shopId,
        actorUserId: ctx.userId,
        action: "payment.recorded",
        entityType: "payment",
        entityId: payment.id,
        changes: { totalCents: subtotal + data.tip, tipCents: data.tip, method: data.method, commissionCents: commissionTotal, appointmentId: data.appointmentId ?? null },
      });
      return { paymentId: payment.id, duplicate: false };
    });
  } catch (err) {
    if (isUniqueViolation(err, "payments_one_active_per_appointment")) {
      throw conflict("This appointment has already been paid.");
    }
    if (isUniqueViolation(err, "payments_idempotency")) {
      // A concurrent identical submit won the race. Return that payment.
      const paymentId = await withTenantTx(ctx, async (tx) => {
        const [p] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.idempotencyKey, data.idempotencyKey));
        return p?.id;
      });
      if (paymentId) return { paymentId, duplicate: true };
    }
    throw err;
  }
}

/**
 * Voids a payment: it stops counting as revenue, every commission it created
 * gets a matching reversal record, and sold products go back into stock.
 * The appointment stays completed, so a corrected payment can be recorded.
 */
export async function voidPayment(ctx: ActorContext, input: unknown, now: Date = new Date()) {
  if (!can(ctx.role, "payments.void")) throw forbidden();
  const data = parseInput(voidPaymentSchema, input);
  await withTenantTx(ctx, async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, data.paymentId)).for("update");
    if (!p) throw notFound("Payment not found.");
    if (p.status === "voided") throw invalidState("This payment was already voided.");
    await tx
      .update(payments)
      .set({ status: "voided", voidedAt: now, voidedByUserId: ctx.userId, voidReason: data.reason })
      .where(eq(payments.id, p.id));
    const earned = await tx
      .select()
      .from(commissionRecords)
      .where(and(eq(commissionRecords.paymentId, p.id), eq(commissionRecords.kind, "earned")));
    for (const r of earned) {
      await tx.insert(commissionRecords).values({
        shopId: ctx.shopId,
        staffMemberId: r.staffMemberId,
        paymentId: r.paymentId,
        paymentItemId: r.paymentItemId,
        ruleId: r.ruleId,
        ruleSnapshot: r.ruleSnapshot,
        baseCents: -r.baseCents,
        amountCents: -r.amountCents,
        kind: "reversal",
        reversesId: r.id,
      });
    }
    const productLines = await tx
      .select()
      .from(paymentItems)
      .where(and(eq(paymentItems.paymentId, p.id), eq(paymentItems.kind, "product")));
    for (const l of productLines) {
      await tx.insert(inventoryMovements).values({
        shopId: ctx.shopId,
        productId: l.productId!,
        qtyDelta: l.quantity,
        type: "sale_reversal",
        unitCostCents: l.unitCostCents,
        paymentItemId: l.id,
        note: "Payment voided",
        actorUserId: ctx.userId,
      });
      await tx.update(products).set({ stockQty: sql`${products.stockQty} + ${l.quantity}` }).where(eq(products.id, l.productId!));
    }
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: "payment.voided",
      entityType: "payment",
      entityId: p.id,
      changes: { reason: data.reason, totalCents: p.totalCents, reversedCommissionCents: earned.reduce((s, r) => s + r.amountCents, 0) },
    });
  });
}

/** The active payment (if any) for an appointment, with its lines and commissions. */
export async function getAppointmentPayment(ctx: ActorContext, appointmentId: string) {
  return withTenantTx(ctx, async (tx) => {
    const list = await tx
      .select()
      .from(payments)
      .where(eq(payments.appointmentId, appointmentId))
      .orderBy(desc(payments.recordedAt));
    const active = list.find((p) => p.status === "recorded") ?? null;
    const items = active ? await tx.select().from(paymentItems).where(eq(paymentItems.paymentId, active.id)) : [];
    const voided = list.filter((p) => p.status === "voided");
    return { payment: active, items, voided };
  });
}

/* ------------------------------------------------------------------------ */
/* Reporting                                                                 */
/* ------------------------------------------------------------------------ */

export type FinanceRange = { fromDate: string; toDate: string };

/**
 * Period summary. Everything is based on payments *recorded* in the period that
 * haven't been voided, so revenue, commissions and product cost always refer to
 * the same set of sales and reconcile:
 *   estimated profit = revenue − product cost − commissions − expenses.
 * Tips are tracked separately: they pass through to barbers and aren't shop revenue.
 */
export async function getFinanceSummary(ctx: ActorContext, range: FinanceRange) {
  return withTenantTx(ctx, async (tx) => {
    await assertFinanceView(tx, ctx);
    const tz = await shopTz(tx, ctx.shopId);
    const { from, to } = instantRange(range.fromDate, range.toDate, tz);
    const inPeriod = and(eq(payments.status, "recorded"), gte(payments.recordedAt, from), lt(payments.recordedAt, to));

    const lines = await tx
      .select({
        kind: paymentItems.kind,
        total: paymentItems.totalCents,
        qty: paymentItems.quantity,
        unitCost: paymentItems.unitCostCents,
        staffMemberId: paymentItems.staffMemberId,
        serviceId: paymentItems.serviceId,
        description: paymentItems.description,
        recordedAt: payments.recordedAt,
        method: payments.method,
      })
      .from(paymentItems)
      .innerJoin(payments, eq(payments.id, paymentItems.paymentId))
      .where(inPeriod);
    const pays = await tx
      .select({ id: payments.id, tip: payments.tipCents, tipStaff: payments.tipStaffMemberId, method: payments.method, total: payments.totalCents, recordedAt: payments.recordedAt })
      .from(payments)
      .where(inPeriod);
    const comms = await tx
      .select({ staffMemberId: commissionRecords.staffMemberId, amount: commissionRecords.amountCents })
      .from(commissionRecords)
      .innerJoin(payments, eq(payments.id, commissionRecords.paymentId))
      .where(and(inPeriod, eq(commissionRecords.kind, "earned")));
    const exp = await tx
      .select({ category: expenses.category, amount: expenses.amountCents })
      .from(expenses)
      .where(and(isNull(expenses.voidedAt), gte(expenses.incurredOn, range.fromDate), sql`${expenses.incurredOn} <= ${range.toDate}`));
    const staff = await tx.select({ id: staffMembers.id, name: staffMembers.displayName, color: staffMembers.calendarColor }).from(staffMembers);

    const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
    const serviceRevenue = sum(lines.filter((l) => l.kind === "service"), (l) => l.total);
    const productRevenue = sum(lines.filter((l) => l.kind === "product"), (l) => l.total);
    const revenue = serviceRevenue + productRevenue;
    const productCost = sum(lines.filter((l) => l.kind === "product"), (l) => (l.unitCost ?? 0) * l.qty);
    const commissions = sum(comms, (c) => c.amount);
    const expenseTotal = sum(exp, (e) => e.amount);
    const tips = sum(pays, (p) => p.tip);

    const byStaff = staff
      .map((st) => {
        const ls = lines.filter((l) => l.staffMemberId === st.id);
        return {
          staffMemberId: st.id,
          name: st.name,
          color: st.color,
          services: ls.filter((l) => l.kind === "service").length,
          revenue: sum(ls, (l) => l.total),
          commission: sum(comms.filter((c) => c.staffMemberId === st.id), (c) => c.amount),
          tips: sum(pays.filter((p) => p.tipStaff === st.id), (p) => p.tip),
        };
      })
      .filter((r) => r.revenue || r.commission || r.tips)
      .sort((a, b) => b.revenue - a.revenue);

    const svcMap = new Map<string, { name: string; count: number; revenue: number }>();
    for (const l of lines.filter((x) => x.kind === "service")) {
      const key = l.serviceId ?? l.description;
      const cur = svcMap.get(key) ?? { name: l.description, count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += l.total;
      svcMap.set(key, cur);
    }
    const byMethod = (["cash", "card", "transfer", "other"] as const)
      .map((m) => ({ method: m, total: sum(pays.filter((p) => p.method === m), (p) => p.total), count: pays.filter((p) => p.method === m).length }))
      .filter((m) => m.count);

    // Daily revenue series in the shop's time zone.
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const daily = new Map<string, number>();
    for (let d = range.fromDate; d <= range.toDate; d = addDays(d, 1)) daily.set(d, 0);
    for (const l of lines) {
      const d = fmt.format(l.recordedAt);
      daily.set(d, (daily.get(d) ?? 0) + l.total);
    }

    return {
      revenue,
      serviceRevenue,
      productRevenue,
      productCost,
      commissions,
      expenses: expenseTotal,
      profit: revenue - productCost - commissions - expenseTotal,
      tips,
      paymentCount: pays.length,
      byStaff,
      byService: [...svcMap.values()].sort((a, b) => b.revenue - a.revenue),
      byMethod,
      expensesByCategory: Object.entries(
        exp.reduce<Record<string, number>>((acc, e) => ((acc[e.category] = (acc[e.category] ?? 0) + e.amount), acc), {}),
      ).map(([category, amount]) => ({ category, amount })),
      daily: [...daily.entries()].map(([date, cents]) => ({ date, cents })),
    };
  });
}

export async function listPayments(ctx: ActorContext, range: FinanceRange) {
  return withTenantTx(ctx, async (tx) => {
    await assertFinanceView(tx, ctx);
    const tz = await shopTz(tx, ctx.shopId);
    const { from, to } = instantRange(range.fromDate, range.toDate, tz);
    const rows = await tx
      .select({
        payment: payments,
        customerName: customers.fullName,
        startsAt: appointments.startsAt,
      })
      .from(payments)
      .leftJoin(customers, eq(customers.id, payments.customerId))
      .leftJoin(appointments, eq(appointments.id, payments.appointmentId))
      .where(and(gte(payments.recordedAt, from), lt(payments.recordedAt, to)))
      .orderBy(desc(payments.recordedAt))
      .limit(500);
    const ids = rows.map((r) => r.payment.id);
    const items = ids.length
      ? await tx
          .select({ paymentId: paymentItems.paymentId, description: paymentItems.description, quantity: paymentItems.quantity, total: paymentItems.totalCents, staffName: staffMembers.displayName })
          .from(paymentItems)
          .leftJoin(staffMembers, eq(staffMembers.id, paymentItems.staffMemberId))
          .where(inArray(paymentItems.paymentId, ids))
      : [];
    return rows.map((r) => ({ ...r, items: items.filter((i) => i.paymentId === r.payment.id) }));
  });
}

/** Commission lines for the period, per barber (excluding voided payments). */
export async function listCommissions(ctx: ActorContext, range: FinanceRange & { staffMemberId?: string }) {
  return withTenantTx(ctx, async (tx) => {
    const own = await ownStaffMemberId(tx, ctx);
    const viewAll = ctx.role === "owner" || (ctx.role === "manager" && (await settings(tx, ctx.shopId)).managersSeeFinance);
    const staffFilter = viewAll ? range.staffMemberId : own;
    if (!viewAll && !own) throw forbidden();
    const tz = await shopTz(tx, ctx.shopId);
    const { from, to } = instantRange(range.fromDate, range.toDate, tz);
    return tx
      .select({
        id: commissionRecords.id,
        staffMemberId: commissionRecords.staffMemberId,
        staffName: staffMembers.displayName,
        description: paymentItems.description,
        baseCents: commissionRecords.baseCents,
        amountCents: commissionRecords.amountCents,
        ruleSnapshot: commissionRecords.ruleSnapshot,
        recordedAt: payments.recordedAt,
      })
      .from(commissionRecords)
      .innerJoin(payments, eq(payments.id, commissionRecords.paymentId))
      .innerJoin(paymentItems, eq(paymentItems.id, commissionRecords.paymentItemId))
      .innerJoin(staffMembers, eq(staffMembers.id, commissionRecords.staffMemberId))
      .where(
        and(
          eq(commissionRecords.kind, "earned"),
          eq(payments.status, "recorded"),
          gte(payments.recordedAt, from),
          lt(payments.recordedAt, to),
          staffFilter ? eq(commissionRecords.staffMemberId, staffFilter) : undefined,
        ),
      )
      .orderBy(desc(payments.recordedAt));
  });
}

/** A barber's own earnings for a period: services done, revenue generated, commission and tips. */
export async function getMyEarnings(ctx: ActorContext, range: FinanceRange) {
  return withTenantTx(ctx, async (tx) => {
    const own = await ownStaffMemberId(tx, ctx);
    if (!own) return null;
    const tz = await shopTz(tx, ctx.shopId);
    const { from, to } = instantRange(range.fromDate, range.toDate, tz);
    const inPeriod = and(eq(payments.status, "recorded"), gte(payments.recordedAt, from), lt(payments.recordedAt, to));
    const lines = await tx
      .select({ kind: paymentItems.kind, total: paymentItems.totalCents, description: paymentItems.description, recordedAt: payments.recordedAt, customerName: customers.fullName, paymentId: payments.id })
      .from(paymentItems)
      .innerJoin(payments, eq(payments.id, paymentItems.paymentId))
      .leftJoin(customers, eq(customers.id, payments.customerId))
      .where(and(inPeriod, eq(paymentItems.staffMemberId, own)))
      .orderBy(desc(payments.recordedAt));
    const comms = await tx
      .select({ amount: commissionRecords.amountCents, paymentItemId: commissionRecords.paymentItemId })
      .from(commissionRecords)
      .innerJoin(payments, eq(payments.id, commissionRecords.paymentId))
      .where(and(inPeriod, eq(commissionRecords.kind, "earned"), eq(commissionRecords.staffMemberId, own)));
    const tips = await tx
      .select({ tip: payments.tipCents })
      .from(payments)
      .where(and(inPeriod, eq(payments.tipStaffMemberId, own)));
    return {
      services: lines.filter((l) => l.kind === "service").length,
      revenue: lines.reduce((s, l) => s + l.total, 0),
      commission: comms.reduce((s, c) => s + c.amount, 0),
      tips: tips.reduce((s, t) => s + t.tip, 0),
      recent: lines.slice(0, 30),
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Commission rules                                                          */
/* ------------------------------------------------------------------------ */

export async function listCommissionRules(ctx: ActorContext) {
  return withTenantTx(ctx, async (tx) => {
    await assertFinanceView(tx, ctx);
    return tx
      .select({
        rule: commissionRules,
        staffName: staffMembers.displayName,
        serviceName: services.name,
      })
      .from(commissionRules)
      .leftJoin(staffMembers, eq(staffMembers.id, commissionRules.staffMemberId))
      .leftJoin(services, eq(services.id, commissionRules.serviceId))
      .where(eq(commissionRules.active, true))
      .orderBy(asc(commissionRules.appliesTo), asc(commissionRules.createdAt));
  });
}

/**
 * Sets the rule for a scope (shop default, barber, service, or barber + service).
 * Any active rule for the same scope is deactivated. Past commissions keep the
 * snapshot of the rule they used, so history never changes.
 */
export async function setCommissionRule(ctx: ActorContext, input: unknown) {
  if (!can(ctx.role, "commissions.manage")) throw forbidden();
  const data = parseInput(commissionRuleSchema, input);
  return withTenantTx(ctx, async (tx) => {
    const scope = and(
      eq(commissionRules.active, true),
      eq(commissionRules.appliesTo, data.appliesTo),
      data.staffMemberId ? eq(commissionRules.staffMemberId, data.staffMemberId) : isNull(commissionRules.staffMemberId),
      data.serviceId ? eq(commissionRules.serviceId, data.serviceId) : isNull(commissionRules.serviceId),
    );
    await tx.update(commissionRules).set({ active: false, deactivatedAt: new Date() }).where(scope);
    const [rule] = await tx
      .insert(commissionRules)
      .values({
        shopId: ctx.shopId,
        staffMemberId: data.staffMemberId ?? null,
        serviceId: data.serviceId ?? null,
        appliesTo: data.appliesTo,
        type: data.type,
        percentBps: data.type === "percent" ? Math.round((data.percent ?? 0) * 100) : null,
        amountCents: data.type === "fixed" ? data.amount : null,
        createdByUserId: ctx.userId,
      })
      .returning();
    await audit(tx, { shopId: ctx.shopId, actorUserId: ctx.userId, action: "commission_rule.set", entityType: "commission_rule", entityId: rule.id, changes: { ...data } });
    return { ruleId: rule.id };
  });
}

export async function deactivateCommissionRule(ctx: ActorContext, ruleId: unknown) {
  if (!can(ctx.role, "commissions.manage")) throw forbidden();
  const id = parseInput(z.uuid(), ruleId);
  await withTenantTx(ctx, async (tx) => {
    const [r] = await tx.update(commissionRules).set({ active: false, deactivatedAt: new Date() }).where(eq(commissionRules.id, id)).returning();
    if (!r) throw notFound("Rule not found.");
    await audit(tx, { shopId: ctx.shopId, actorUserId: ctx.userId, action: "commission_rule.removed", entityType: "commission_rule", entityId: id });
  });
}

/* ------------------------------------------------------------------------ */
/* Expenses                                                                  */
/* ------------------------------------------------------------------------ */

export async function listExpenses(ctx: ActorContext, range: FinanceRange) {
  return withTenantTx(ctx, async (tx) => {
    await assertFinanceView(tx, ctx);
    return tx
      .select()
      .from(expenses)
      .where(and(gte(expenses.incurredOn, range.fromDate), sql`${expenses.incurredOn} <= ${range.toDate}`))
      .orderBy(desc(expenses.incurredOn), desc(expenses.createdAt));
  });
}

export async function createExpense(ctx: ActorContext, input: unknown) {
  if (!can(ctx.role, "expenses.manage")) throw forbidden();
  const data = parseInput(expenseSchema, input);
  return withTenantTx(ctx, async (tx) => {
    await assertFinanceView(tx, ctx);
    const [row] = await tx
      .insert(expenses)
      .values({
        shopId: ctx.shopId,
        category: data.category as (typeof expenses.$inferInsert)["category"],
        amountCents: data.amount,
        incurredOn: data.incurredOn,
        vendor: data.vendor,
        description: data.description,
        recordedByUserId: ctx.userId,
      })
      .returning({ id: expenses.id });
    await audit(tx, { shopId: ctx.shopId, actorUserId: ctx.userId, action: "expense.recorded", entityType: "expense", entityId: row.id, changes: { amountCents: data.amount, category: data.category } });
    return { expenseId: row.id };
  });
}

export async function voidExpense(ctx: ActorContext, input: { expenseId: unknown; reason: unknown }) {
  if (!can(ctx.role, "expenses.manage")) throw forbidden();
  const id = parseInput(z.uuid(), input.expenseId);
  const reason = parseInput(z.string().trim().min(3, "Say why").max(200), input.reason);
  await withTenantTx(ctx, async (tx) => {
    await assertFinanceView(tx, ctx);
    const [row] = await tx
      .update(expenses)
      .set({ voidedAt: new Date(), voidedByUserId: ctx.userId, voidReason: reason })
      .where(and(eq(expenses.id, id), isNull(expenses.voidedAt)))
      .returning();
    if (!row) throw notFound("Expense not found or already voided.");
    await audit(tx, { shopId: ctx.shopId, actorUserId: ctx.userId, action: "expense.voided", entityType: "expense", entityId: id, changes: { reason } });
  });
}
