import { and, asc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { withTenantTx } from "@/server/db/tenant";
import {
  shopClosures,
  shopMemberships,
  shopOpeningHours,
  shops,
  shopSettings,
  staffMembers,
} from "@/server/db/schema";
import { assertCan } from "@/server/authz/permissions";
import { conflict, isUniqueViolation, notFound } from "@/server/errors";
import { uuidv7 } from "@/lib/ids";
import {
  createShopSchema,
  openingHoursSchema,
  shopProfileSchema,
  type OpeningInterval,
} from "@/lib/validation/shop";
import { shortTime } from "@/lib/time";
import { closureSchema } from "@/lib/validation/scheduling";
import type { ActorContext, SessionUser } from "../context";
import { audit } from "../audit";
import { initStaffProfile } from "../staff/init";
import { parseInput } from "../validate";

const SLUG_TAKEN = () =>
  conflict("That booking link is already taken.", { slug: "That booking link is already taken" });

/**
 * Creates a shop with the user as its owner, all in one transaction:
 * the shop, default settings, opening hours, the owner membership, and
 * (optionally) the owner's barber profile.
 */
export async function createShop(user: SessionUser, input: unknown): Promise<{ shopId: string }> {
  const data = parseInput(createShopSchema, input);
  const shopId = uuidv7();
  try {
    await withTenantTx({ shopId, userId: user.id }, async (tx) => {
      await tx.insert(shops).values({
        id: shopId,
        slug: data.slug,
        name: data.name,
        timezone: data.timezone,
        currency: data.currency,
        phone: data.phone ?? null,
        email: data.email ?? null,
        addressLine: data.addressLine ?? null,
        city: data.city ?? null,
        postalCode: data.postalCode ?? null,
      });
      await tx.insert(shopSettings).values({ shopId });
      if (data.openingHours.length) {
        await tx.insert(shopOpeningHours).values(data.openingHours.map((h) => ({ shopId, ...h })));
      }
      const [membership] = await tx
        .insert(shopMemberships)
        .values({ shopId, userId: user.id, role: "owner" })
        .returning({ id: shopMemberships.id });
      if (data.ownerIsBarber) {
        const [staff] = await tx
          .insert(staffMembers)
          .values({ shopId, membershipId: membership.id, displayName: user.name })
          .returning({ id: staffMembers.id });
        await initStaffProfile(tx, shopId, staff.id);
      }
      await audit(tx, {
        shopId,
        actorUserId: user.id,
        action: "shop.created",
        entityType: "shop",
        entityId: shopId,
        changes: { name: data.name, slug: data.slug },
      });
    });
  } catch (err) {
    if (isUniqueViolation(err, "shops_slug_unique")) throw SLUG_TAKEN();
    throw err;
  }
  return { shopId };
}

export async function getShop(ctx: ActorContext) {
  assertCan(ctx.role, "shop.view");
  return withTenantTx(ctx, async (tx) => {
    const [shop] = await tx.select().from(shops).where(eq(shops.id, ctx.shopId));
    if (!shop) throw notFound("Shop not found.");
    return shop;
  });
}

export async function updateShopProfile(ctx: ActorContext, input: unknown) {
  assertCan(ctx.role, "shop.update");
  const data = parseInput(shopProfileSchema, input);
  try {
    await withTenantTx(ctx, async (tx) => {
      const [before] = await tx.select().from(shops).where(eq(shops.id, ctx.shopId));
      if (!before) throw notFound("Shop not found.");
      await tx
        .update(shops)
        .set({
          name: data.name,
          slug: data.slug,
          timezone: data.timezone,
          currency: data.currency,
          phone: data.phone ?? null,
          email: data.email ?? null,
          addressLine: data.addressLine ?? null,
          city: data.city ?? null,
          postalCode: data.postalCode ?? null,
        })
        .where(eq(shops.id, ctx.shopId));
      const changed = Object.fromEntries(
        (Object.keys(data) as (keyof typeof data)[])
          .filter((k) => (before[k] ?? null) !== (data[k] ?? null))
          .map((k) => [k, { from: before[k] ?? null, to: data[k] ?? null }]),
      );
      if (Object.keys(changed).length) {
        await audit(tx, {
          shopId: ctx.shopId,
          actorUserId: ctx.userId,
          action: "shop.updated",
          entityType: "shop",
          entityId: ctx.shopId,
          changes: changed,
        });
      }
    });
  } catch (err) {
    if (isUniqueViolation(err, "shops_slug_unique")) throw SLUG_TAKEN();
    throw err;
  }
}

export async function getOpeningHours(ctx: ActorContext): Promise<OpeningInterval[]> {
  assertCan(ctx.role, "shop.view");
  return withTenantTx(ctx, async (tx) => {
    const rows = await tx
      .select({
        weekday: shopOpeningHours.weekday,
        opensAt: shopOpeningHours.opensAt,
        closesAt: shopOpeningHours.closesAt,
      })
      .from(shopOpeningHours)
      .where(eq(shopOpeningHours.shopId, ctx.shopId))
      .orderBy(asc(shopOpeningHours.weekday), asc(shopOpeningHours.opensAt));
    return rows.map((r) => ({ ...r, opensAt: shortTime(r.opensAt), closesAt: shortTime(r.closesAt) }));
  });
}

/** Replaces the weekly opening hours as a whole (the editor always submits the full week). */
export async function replaceOpeningHours(ctx: ActorContext, input: unknown) {
  assertCan(ctx.role, "shop.update");
  const hours = parseInput(openingHoursSchema, input);
  await withTenantTx(ctx, async (tx) => {
    await tx.delete(shopOpeningHours).where(eq(shopOpeningHours.shopId, ctx.shopId));
    if (hours.length) {
      await tx.insert(shopOpeningHours).values(hours.map((h) => ({ shopId: ctx.shopId, ...h })));
    }
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: "shop.opening_hours_updated",
      entityType: "shop",
      entityId: ctx.shopId,
      changes: { hours },
    });
  });
}

/** The user's active memberships across shops, for the shop switcher and routing. */
export async function listUserMemberships(userId: string) {
  return withTenantTx({ userId }, (tx) =>
    tx
      .select({
        membershipId: shopMemberships.id,
        shopId: shops.id,
        shopName: shops.name,
        shopSlug: shops.slug,
        timezone: shops.timezone,
        currency: shops.currency,
        role: shopMemberships.role,
      })
      .from(shopMemberships)
      .innerJoin(shops, eq(shops.id, shopMemberships.shopId))
      .where(and(eq(shopMemberships.userId, userId), eq(shopMemberships.status, "active")))
      .orderBy(asc(shops.name)),
  );
}

export type UserMembership = Awaited<ReturnType<typeof listUserMemberships>>[number];

/** The actor's own barber profile in the shop, if they have one. */
export async function getOwnStaffProfile(ctx: ActorContext) {
  return withTenantTx(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(staffMembers)
      .where(and(eq(staffMembers.shopId, ctx.shopId), eq(staffMembers.membershipId, ctx.membershipId)));
    return row ?? null;
  });
}

/* ------------------------------ closures --------------------------------- */

export async function listClosures(ctx: ActorContext, opts: { fromDate?: string } = {}) {
  assertCan(ctx.role, "shop.view");
  return withTenantTx(ctx, (tx) =>
    tx
      .select()
      .from(shopClosures)
      .where(and(eq(shopClosures.shopId, ctx.shopId), opts.fromDate ? gte(shopClosures.endsOn, opts.fromDate) : undefined))
      .orderBy(asc(shopClosures.startsOn)),
  );
}

export async function addClosure(ctx: ActorContext, input: unknown) {
  assertCan(ctx.role, "shop.update");
  const data = parseInput(closureSchema, input);
  return withTenantTx(ctx, async (tx) => {
    const [row] = await tx
      .insert(shopClosures)
      .values({ shopId: ctx.shopId, startsOn: data.startsOn, endsOn: data.endsOn, reason: data.reason })
      .returning({ id: shopClosures.id });
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: "shop.closure_added",
      entityType: "shop_closure",
      entityId: row.id,
      changes: data,
    });
    return { closureId: row.id };
  });
}

export async function deleteClosure(ctx: ActorContext, closureId: unknown) {
  assertCan(ctx.role, "shop.update");
  const id = parseInput(z.uuid(), closureId);
  await withTenantTx(ctx, async (tx) => {
    const [row] = await tx.delete(shopClosures).where(eq(shopClosures.id, id)).returning();
    if (!row) throw notFound("Closure not found.");
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: "shop.closure_removed",
      entityType: "shop_closure",
      entityId: id,
      changes: { startsOn: row.startsOn, endsOn: row.endsOn },
    });
  });
}
