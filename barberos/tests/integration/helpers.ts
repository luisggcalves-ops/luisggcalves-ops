import { Pool } from "pg";
import { uuidv7 } from "@/lib/ids";
import type { ActorContext, SessionUser } from "@/server/domain/context";
import { createShop } from "@/server/domain/shops/service";
import { DEFAULT_OPENING_HOURS } from "@/lib/validation/shop";

/** Owner connection: bypasses RLS. Use it only to arrange fixtures and inspect state, never for the code under test. */
export const adminPool = new Pool({ connectionString: process.env.TEST_MIGRATION_DATABASE_URL, max: 2 });

export async function resetDatabase() {
  await adminPool.query("TRUNCATE users, shops, rate_limits, verifications RESTART IDENTITY CASCADE");
}

let counter = 0;
export async function createUser(name = "Test User", email?: string): Promise<SessionUser> {
  const id = uuidv7();
  const mail = email ?? `user${++counter}-${id.slice(-6)}@example.test`;
  await adminPool.query("insert into users (id, name, email) values ($1, $2, $3)", [id, name, mail]);
  return { id, name, email: mail };
}

export function shopInput(overrides: Record<string, unknown> = {}) {
  const n = ++counter;
  return {
    name: `Shop ${n}`,
    slug: `shop-${n}-${Math.random().toString(36).slice(2, 7)}`,
    timezone: "Europe/Lisbon",
    currency: "EUR",
    phone: "",
    openingHours: DEFAULT_OPENING_HOURS,
    ownerIsBarber: true,
    ...overrides,
  };
}

export async function actorFor(user: SessionUser, shopId: string): Promise<ActorContext> {
  const { rows } = await adminPool.query(
    "select id, role from shop_memberships where user_id = $1 and shop_id = $2",
    [user.id, shopId],
  );
  if (!rows[0]) throw new Error("No membership");
  return { userId: user.id, shopId, membershipId: rows[0].id, role: rows[0].role };
}

/** Creates an owner, a shop, and returns the owner's context. */
export async function shopWithOwner(name = "Owner") {
  const owner = await createUser(name);
  const { shopId } = await createShop(owner, shopInput());
  return { owner, shopId, ctx: await actorFor(owner, shopId) };
}

/** Adds a member directly (fixture shortcut that skips the invitation flow). */
export async function addMember(shopId: string, role: "manager" | "barber", name = "Member") {
  const user = await createUser(name);
  await adminPool.query("insert into shop_memberships (id, shop_id, user_id, role) values ($1, $2, $3, $4)", [
    uuidv7(),
    shopId,
    user.id,
    role,
  ]);
  return { user, ctx: await actorFor(user, shopId) };
}

/** A date string for the next given weekday at least 7 days from now (so "now" never interferes). */
export function futureWeekday(weekday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7);
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** A date string for the given weekday at least 7 days in the past. */
export function pastWeekday(weekday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
