import { and, asc, desc, eq, gt, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenantTx } from "@/server/db/tenant";
import type { Tx } from "@/server/db/client";
import { appointmentEvents, appointments, customerNotes, customers, shops, staffMembers } from "@/server/db/schema";
import { assertCan, can } from "@/server/authz/permissions";
import { conflict, DomainError, forbidden, isUniqueViolation, notFound } from "@/server/errors";
import { customerNoteSchema, customerUpdateSchema } from "@/lib/validation/scheduling";
import { normalizePhone } from "@/lib/phone";
import type { ActorContext } from "../context";
import { audit } from "../audit";
import { parseInput } from "../validate";
import { ownStaffMemberId } from "../staff/service";

/**
 * Who can see which customers:
 *   owners and managers see everyone;
 *   barbers see customers they have served or are booked with.
 */
async function customerScope(tx: Tx, ctx: ActorContext): Promise<{ all: true } | { all: false; staffId: string }> {
  if (can(ctx.role, "customers.view_all")) return { all: true };
  const staffId = await ownStaffMemberId(tx, ctx);
  if (!staffId) throw forbidden("You need a barber profile to see customers.");
  return { all: false, staffId };
}

function servedBy(staffId: string) {
  return sql`exists (select 1 from appointments a where a.customer_id = ${customers.id} and a.staff_member_id = ${staffId})`;
}

async function assertCanSee(tx: Tx, ctx: ActorContext, customerId: string) {
  const scope = await customerScope(tx, ctx);
  const [row] = await tx
    .select({ id: customers.id, anonymizedAt: customers.anonymizedAt })
    .from(customers)
    .where(and(eq(customers.id, customerId), scope.all ? undefined : servedBy(scope.staffId)));
  if (!row) throw notFound("Customer not found.");
  return { row, scope };
}

export async function listCustomers(ctx: ActorContext, opts: { q?: string; limit?: number; offset?: number } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  return withTenantTx(ctx, async (tx) => {
    const scope = await customerScope(tx, ctx);
    const q = (opts.q ?? "").trim().slice(0, 80);
    const digits = q.replace(/\D/g, "");
    const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
    const rows = await tx
      .select({
        id: customers.id,
        fullName: customers.fullName,
        phoneE164: customers.phoneE164,
        email: customers.email,
        visitCount: customers.visitCount,
        lastVisitAt: customers.lastVisitAt,
        createdAt: customers.createdAt,
        source: customers.source,
        preferredStaffName: staffMembers.displayName,
        nextAppointmentAt: sql<Date | null>`(select min(a.starts_at) from appointments a
          where a.customer_id = "customers"."id" and a.status in ('pending','confirmed') and a.starts_at > now())`.mapWith(
          (v: string | null) => (v ? new Date(v) : null),
        ),
      })
      .from(customers)
      .leftJoin(staffMembers, eq(staffMembers.id, customers.preferredStaffMemberId))
      .where(
        and(
          eq(customers.shopId, ctx.shopId),
          isNull(customers.anonymizedAt),
          scope.all ? undefined : servedBy(scope.staffId),
          q.length >= 2
            ? or(
                ilike(customers.fullName, `%${escaped}%`),
                ilike(customers.email, `%${escaped}%`),
                digits.length >= 3 ? sql`${customers.phoneE164} like ${"%" + digits + "%"}` : undefined,
              )
            : undefined,
        ),
      )
      .orderBy(sql`${customers.lastVisitAt} desc nulls last`, asc(customers.fullName))
      .limit(limit + 1)
      .offset(opts.offset ?? 0);
    return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
  });
}

export async function getCustomerProfile(ctx: ActorContext, customerId: unknown) {
  const id = parseInput(z.uuid(), customerId);
  return withTenantTx(ctx, async (tx) => {
    await assertCanSee(tx, ctx, id);
    const [customer] = await tx
      .select({ customer: customers, preferredStaffName: staffMembers.displayName })
      .from(customers)
      .leftJoin(staffMembers, eq(staffMembers.id, customers.preferredStaffMemberId))
      .where(eq(customers.id, id));
    const notes = await tx
      .select()
      .from(customerNotes)
      .where(eq(customerNotes.customerId, id))
      .orderBy(desc(customerNotes.createdAt))
      .limit(100);
    const history = await tx
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        status: appointments.status,
        serviceName: appointments.serviceName,
        priceCents: appointments.priceCents,
        staffName: staffMembers.displayName,
        staffMemberId: appointments.staffMemberId,
        source: appointments.source,
      })
      .from(appointments)
      .innerJoin(staffMembers, eq(staffMembers.id, appointments.staffMemberId))
      .where(eq(appointments.customerId, id))
      .orderBy(desc(appointments.startsAt))
      .limit(200);
    const now = Date.now();
    const stats = {
      completed: history.filter((h) => h.status === "completed").length,
      noShows: history.filter((h) => h.status === "no_show").length,
      cancelled: history.filter((h) => h.status === "cancelled").length,
      upcoming: history.filter((h) => (h.status === "confirmed" || h.status === "pending") && h.startsAt.getTime() > now).length,
      // Average days between completed visits (for spotting regulars and overdue customers).
      avgDaysBetweenVisits: (() => {
        const visits = history.filter((h) => h.status === "completed").map((h) => h.startsAt.getTime()).sort((a, b) => a - b);
        if (visits.length < 2) return null;
        return Math.round((visits[visits.length - 1] - visits[0]) / (visits.length - 1) / 86_400_000);
      })(),
    };
    return { ...customer, notes, history, stats };
  });
}

/** Most recent notes for a customer, used on the appointment panel ("last time…"). */
export async function recentNotes(ctx: ActorContext, customerId: string, limit = 3) {
  return withTenantTx(ctx, async (tx) => {
    await assertCanSee(tx, ctx, customerId);
    return tx
      .select()
      .from(customerNotes)
      .where(eq(customerNotes.customerId, customerId))
      .orderBy(desc(customerNotes.createdAt))
      .limit(limit);
  });
}

export async function updateCustomer(ctx: ActorContext, customerId: unknown, input: unknown) {
  assertCan(ctx.role, "customers.edit");
  const id = parseInput(z.uuid(), customerId);
  const data = parseInput(customerUpdateSchema, input);
  try {
    await withTenantTx(ctx, async (tx) => {
      const { row } = await assertCanSee(tx, ctx, id);
      if (row.anonymizedAt) throw forbidden("This customer's data was deleted.");
      const [shop] = await tx.select({ country: shops.country }).from(shops).where(eq(shops.id, ctx.shopId));
      let phone: string | null = null;
      if (data.phone) {
        phone = normalizePhone(data.phone, shop?.country ?? "PT");
        if (!phone) throw new DomainError("VALIDATION", "Please check the phone number.", { phone: "Enter a valid phone number" });
      }
      if (data.preferredStaffMemberId) {
        const [s] = await tx.select({ id: staffMembers.id }).from(staffMembers).where(eq(staffMembers.id, data.preferredStaffMemberId));
        if (!s) throw new DomainError("VALIDATION", "Barber not found.", { preferredStaffMemberId: "Not found" });
      }
      const [before] = await tx.select().from(customers).where(eq(customers.id, id));
      await tx
        .update(customers)
        .set({
          fullName: data.fullName,
          phoneE164: phone,
          email: data.email,
          preferredStaffMemberId: data.preferredStaffMemberId,
          hairPreferences: data.hairPreferences,
          marketingConsentAt: data.marketingConsent ? (before.marketingConsentAt ?? new Date()) : null,
        })
        .where(eq(customers.id, id));
      await audit(tx, {
        shopId: ctx.shopId,
        actorUserId: ctx.userId,
        action: "customer.updated",
        entityType: "customer",
        entityId: id,
        // Record which fields changed, not their values, so the audit log holds no extra personal data.
        changes: {
          fields: [
            ...(["fullName", "email", "hairPreferences", "preferredStaffMemberId"] as const).filter(
              (k) => (before[k] ?? null) !== (data[k] ?? null),
            ),
            ...(before.phoneE164 !== phone ? ["phone"] : []),
          ],
          marketingConsent: data.marketingConsent,
        },
      });
    });
  } catch (err) {
    if (isUniqueViolation(err, "customers_shop_phone")) {
      throw conflict("Another customer already has this phone number.", { phone: "Already used by another customer" });
    }
    throw err;
  }
}

export async function addCustomerNote(ctx: ActorContext, customerId: unknown, input: unknown, authorName: string) {
  const id = parseInput(z.uuid(), customerId);
  const data = parseInput(customerNoteSchema, input);
  return withTenantTx(ctx, async (tx) => {
    const { row } = await assertCanSee(tx, ctx, id);
    if (row.anonymizedAt) throw forbidden("This customer's data was deleted.");
    if (data.appointmentId) {
      const [a] = await tx
        .select({ id: appointments.id })
        .from(appointments)
        .where(and(eq(appointments.id, data.appointmentId), eq(appointments.customerId, id)));
      if (!a) throw new DomainError("VALIDATION", "That appointment isn't this customer's.");
    }
    const [note] = await tx
      .insert(customerNotes)
      .values({
        shopId: ctx.shopId,
        customerId: id,
        appointmentId: data.appointmentId ?? null,
        authorUserId: ctx.userId,
        authorName,
        kind: data.kind,
        body: data.body,
      })
      .returning({ id: customerNotes.id });
    return { noteId: note.id };
  });
}

/** Authors can delete their own notes. Owners and managers can delete any. */
export async function deleteCustomerNote(ctx: ActorContext, noteId: unknown) {
  const id = parseInput(z.uuid(), noteId);
  await withTenantTx(ctx, async (tx) => {
    const [note] = await tx.select().from(customerNotes).where(eq(customerNotes.id, id));
    if (!note) throw notFound("Note not found.");
    await assertCanSee(tx, ctx, note.customerId);
    if (note.authorUserId !== ctx.userId && !can(ctx.role, "customers.edit")) throw forbidden();
    await tx.delete(customerNotes).where(eq(customerNotes.id, id));
  });
}

/** GDPR right of access / portability: everything the shop holds about the customer. */
export async function exportCustomer(ctx: ActorContext, customerId: unknown) {
  assertCan(ctx.role, "customers.export");
  const id = parseInput(z.uuid(), customerId);
  return withTenantTx(ctx, async (tx) => {
    const [customer] = await tx.select().from(customers).where(eq(customers.id, id));
    if (!customer) throw notFound("Customer not found.");
    const [shop] = await tx.select({ name: shops.name }).from(shops).where(eq(shops.id, ctx.shopId));
    const appts = await tx
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        status: appointments.status,
        source: appointments.source,
        service: appointments.serviceName,
        priceCents: appointments.priceCents,
        barber: staffMembers.displayName,
        customerNote: appointments.customerNote,
        cancelReason: appointments.cancelReason,
        createdAt: appointments.createdAt,
      })
      .from(appointments)
      .innerJoin(staffMembers, eq(staffMembers.id, appointments.staffMemberId))
      .where(eq(appointments.customerId, id))
      .orderBy(asc(appointments.startsAt));
    const notes = await tx
      .select({ createdAt: customerNotes.createdAt, kind: customerNotes.kind, body: customerNotes.body, author: customerNotes.authorName })
      .from(customerNotes)
      .where(eq(customerNotes.customerId, id))
      .orderBy(asc(customerNotes.createdAt));
    await audit(tx, { shopId: ctx.shopId, actorUserId: ctx.userId, action: "customer.exported", entityType: "customer", entityId: id });
    return {
      exportedAt: new Date().toISOString(),
      controller: shop.name,
      customer: {
        name: customer.fullName,
        phone: customer.phoneE164,
        email: customer.email,
        hairPreferences: customer.hairPreferences,
        marketingConsentAt: customer.marketingConsentAt,
        firstVisitAt: customer.firstVisitAt,
        lastVisitAt: customer.lastVisitAt,
        visitCount: customer.visitCount,
        source: customer.source,
        createdAt: customer.createdAt,
      },
      appointments: appts,
      notes,
    };
  });
}

/**
 * GDPR right to erasure. Personal data is removed and the record is kept only
 * as "Deleted customer", so appointment counts and (from Phase 4) financial
 * records stay consistent but no longer identify anyone. Future bookings are cancelled.
 */
export async function anonymizeCustomer(ctx: ActorContext, customerId: unknown, now: Date = new Date()) {
  assertCan(ctx.role, "customers.delete");
  const id = parseInput(z.uuid(), customerId);
  await withTenantTx(ctx, async (tx) => {
    const [c] = await tx.select().from(customers).where(eq(customers.id, id)).for("update");
    if (!c) throw notFound("Customer not found.");
    if (c.anonymizedAt) return;
    const future = await tx
      .update(appointments)
      .set({ status: "cancelled", cancelledAt: now, cancelledBy: "staff", cancelReason: "Customer data deleted" })
      .where(and(eq(appointments.customerId, id), inArray(appointments.status, ["pending", "confirmed"]), gt(appointments.startsAt, now)))
      .returning({ id: appointments.id, status: appointments.status });
    for (const a of future) {
      await tx.insert(appointmentEvents).values({
        shopId: ctx.shopId,
        appointmentId: a.id,
        type: "status_changed",
        toValue: { status: "cancelled", reason: "Customer data deleted" },
        actorUserId: ctx.userId,
        actorLabel: "staff",
      });
    }
    await tx
      .update(appointments)
      .set({ customerNote: null, internalNote: null, manageTokenHash: null })
      .where(eq(appointments.customerId, id));
    await tx.delete(customerNotes).where(eq(customerNotes.customerId, id));
    await tx
      .update(customers)
      .set({
        fullName: "Deleted customer",
        phoneE164: null,
        email: null,
        hairPreferences: null,
        preferredStaffMemberId: null,
        marketingConsentAt: null,
        anonymizedAt: now,
      })
      .where(eq(customers.id, id));
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: "customer.anonymized",
      entityType: "customer",
      entityId: id,
      changes: { cancelledFutureAppointments: future.length },
    });
  });
}
