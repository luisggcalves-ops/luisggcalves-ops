import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { withTenantTx } from "@/server/db/tenant";
import type { Tx } from "@/server/db/client";
import { customers, shops } from "@/server/db/schema";
import { assertCan } from "@/server/authz/permissions";
import { DomainError } from "@/server/errors";
import { newCustomerSchema } from "@/lib/validation/scheduling";
import { normalizePhone } from "@/lib/phone";
import type { ActorContext } from "../context";
import { parseInput } from "../validate";

export type CustomerSummary = {
  id: string;
  fullName: string;
  phoneE164: string | null;
  email: string | null;
  visitCount: number;
};

/** Finds customers by name, phone or email, for the booking form. Anonymized customers are excluded. */
export async function searchCustomers(ctx: ActorContext, query: string): Promise<CustomerSummary[]> {
  assertCan(ctx.role, "customers.search");
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const digits = q.replace(/\D/g, "");
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  return withTenantTx(ctx, (tx) =>
    tx
      .select({
        id: customers.id,
        fullName: customers.fullName,
        phoneE164: customers.phoneE164,
        email: customers.email,
        visitCount: customers.visitCount,
      })
      .from(customers)
      .where(
        and(
          eq(customers.shopId, ctx.shopId),
          isNull(customers.anonymizedAt),
          or(
            ilike(customers.fullName, `%${escaped}%`),
            ilike(customers.email, `%${escaped}%`),
            digits.length >= 3 ? sql`${customers.phoneE164} like ${"%" + digits + "%"}` : undefined,
          ),
        ),
      )
      .orderBy(asc(customers.fullName))
      .limit(8),
  );
}

/**
 * Finds an existing customer by phone or creates a new one, inside the caller's
 * transaction. The phone number is how returning customers are recognised.
 */
export async function findOrCreateCustomer(
  tx: Tx,
  ctx: Pick<ActorContext, "shopId">,
  input: unknown,
  source: "online" | "staff" | "walk_in",
): Promise<{ customerId: string; created: boolean }> {
  const data = parseInput(newCustomerSchema, input);
  const [shop] = await tx.select({ country: shops.country }).from(shops).where(eq(shops.id, ctx.shopId));
  let phone: string | null = null;
  if (data.phone) {
    phone = normalizePhone(data.phone, shop?.country ?? "PT");
    if (!phone) {
      throw new DomainError("VALIDATION", "Please check the phone number.", {
        "newCustomer.phone": "Enter a valid phone number",
      });
    }
    const [existing] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.shopId, ctx.shopId), eq(customers.phoneE164, phone)));
    if (existing) return { customerId: existing.id, created: false };
  }
  const [row] = await tx
    .insert(customers)
    .values({ shopId: ctx.shopId, fullName: data.fullName, phoneE164: phone, email: data.email, source })
    .onConflictDoNothing()
    .returning({ id: customers.id });
  if (row) return { customerId: row.id, created: true };
  // Lost a race with a concurrent insert of the same phone. Use that customer.
  const [existing] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.shopId, ctx.shopId), eq(customers.phoneE164, phone!)));
  return { customerId: existing.id, created: false };
}

export async function createCustomer(ctx: ActorContext, input: unknown) {
  assertCan(ctx.role, "customers.search");
  return withTenantTx(ctx, (tx) => findOrCreateCustomer(tx, ctx, input, "staff"));
}
