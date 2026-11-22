import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenantTx } from "@/server/db/tenant";
import { inventoryMovements, products, users } from "@/server/db/schema";
import { assertCan, can } from "@/server/authz/permissions";
import { notFound } from "@/server/errors";
import { productSchema, stockMovementSchema } from "@/lib/validation/finance";
import type { ActorContext } from "../context";
import { audit } from "../audit";
import { parseInput } from "../validate";

/** Active products are visible to everyone who takes payments. Managing them needs inventory.manage. */
export async function listProducts(ctx: ActorContext, opts: { includeInactive?: boolean } = {}) {
  return withTenantTx(ctx, (tx) =>
    tx
      .select()
      .from(products)
      .where(and(eq(products.shopId, ctx.shopId), opts.includeInactive ? undefined : eq(products.active, true)))
      .orderBy(asc(products.name)),
  );
}

export async function lowStockProducts(ctx: ActorContext) {
  return withTenantTx(ctx, (tx) =>
    tx
      .select({ id: products.id, name: products.name, stockQty: products.stockQty, lowStockThreshold: products.lowStockThreshold })
      .from(products)
      .where(and(eq(products.active, true), sql`${products.lowStockThreshold} > 0`, lte(products.stockQty, products.lowStockThreshold)))
      .orderBy(asc(products.stockQty)),
  );
}

export async function getProduct(ctx: ActorContext, productId: unknown) {
  assertCan(ctx.role, "inventory.manage");
  const id = parseInput(z.uuid(), productId);
  return withTenantTx(ctx, async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.id, id));
    if (!product) throw notFound("Product not found.");
    const movements = await tx
      .select({ movement: inventoryMovements, actorName: users.name })
      .from(inventoryMovements)
      .leftJoin(users, eq(users.id, inventoryMovements.actorUserId))
      .where(eq(inventoryMovements.productId, id))
      .orderBy(desc(inventoryMovements.createdAt))
      .limit(100);
    return { product, movements };
  });
}

export async function createProduct(ctx: ActorContext, input: unknown, initialStock = 0) {
  assertCan(ctx.role, "inventory.manage");
  const data = parseInput(productSchema, input);
  return withTenantTx(ctx, async (tx) => {
    const [p] = await tx
      .insert(products)
      .values({
        shopId: ctx.shopId,
        name: data.name,
        sku: data.sku,
        category: data.category,
        kind: data.kind,
        costCents: data.cost,
        priceCents: data.price,
        lowStockThreshold: data.lowStockThreshold,
        stockQty: initialStock,
      })
      .returning({ id: products.id });
    if (initialStock) {
      await tx.insert(inventoryMovements).values({
        shopId: ctx.shopId,
        productId: p.id,
        qtyDelta: initialStock,
        type: "purchase",
        unitCostCents: data.cost,
        note: "Opening stock",
        actorUserId: ctx.userId,
      });
    }
    await audit(tx, { shopId: ctx.shopId, actorUserId: ctx.userId, action: "product.created", entityType: "product", entityId: p.id, changes: { name: data.name } });
    return { productId: p.id };
  });
}

export async function updateProduct(ctx: ActorContext, productId: unknown, input: unknown) {
  assertCan(ctx.role, "inventory.manage");
  const id = parseInput(z.uuid(), productId);
  const data = parseInput(productSchema, input);
  await withTenantTx(ctx, async (tx) => {
    const [p] = await tx
      .update(products)
      .set({ name: data.name, sku: data.sku, category: data.category, kind: data.kind, costCents: data.cost, priceCents: data.price, lowStockThreshold: data.lowStockThreshold })
      .where(eq(products.id, id))
      .returning({ id: products.id });
    if (!p) throw notFound("Product not found.");
  });
}

export async function setProductActive(ctx: ActorContext, productId: unknown, active: boolean) {
  assertCan(ctx.role, "inventory.manage");
  const id = parseInput(z.uuid(), productId);
  await withTenantTx(ctx, async (tx) => {
    const [p] = await tx.update(products).set({ active }).where(eq(products.id, id)).returning({ id: products.id });
    if (!p) throw notFound("Product not found.");
  });
}

/**
 * Stock changes other than sales: deliveries (purchase), shop use (usage) and
 * stock-take corrections (adjustment). Usage is stored as a negative quantity.
 */
export async function recordStockMovement(ctx: ActorContext, input: unknown) {
  assertCan(ctx.role, "inventory.manage");
  const data = parseInput(stockMovementSchema, input);
  const delta = data.type === "usage" ? -Math.abs(data.quantity) : data.type === "purchase" ? Math.abs(data.quantity) : data.quantity;
  await withTenantTx(ctx, async (tx) => {
    const [p] = await tx.select().from(products).where(eq(products.id, data.productId)).for("update");
    if (!p) throw notFound("Product not found.");
    await tx.insert(inventoryMovements).values({
      shopId: ctx.shopId,
      productId: p.id,
      qtyDelta: delta,
      type: data.type,
      unitCostCents: data.type === "purchase" ? data.unitCost || p.costCents : null,
      note: data.note,
      actorUserId: ctx.userId,
    });
    await tx
      .update(products)
      .set({
        stockQty: sql`${products.stockQty} + ${delta}`,
        // A delivery at a new price updates the cost used for profit from now on.
        ...(data.type === "purchase" && data.unitCost ? { costCents: data.unitCost } : {}),
      })
      .where(eq(products.id, p.id));
  });
}

export function canManageInventory(ctx: ActorContext) {
  return can(ctx.role, "inventory.manage");
}
