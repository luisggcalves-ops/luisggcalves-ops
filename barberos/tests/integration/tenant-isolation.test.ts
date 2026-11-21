import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { withTenantTx } from "@/server/db/tenant";
import { auditLog, shopOpeningHours, shops, staffMembers } from "@/server/db/schema";
import { getOpeningHours, getShop, listUserMemberships } from "@/server/domain/shops/service";
import { listTeam } from "@/server/domain/team/service";
import { uuidv7 } from "@/lib/ids";
import { addMember, adminPool, shopWithOwner } from "./helpers";

/** The underlying Postgres error message (Drizzle wraps it as `cause`). */
async function pgErrorOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const cause = (e as { cause?: { message?: string } }).cause;
    return cause?.message ?? (e as Error).message;
  }
  return "no error";
}

describe("tenant isolation (row-level security)", () => {
  it("only exposes the active shop's rows", async () => {
    const a = await shopWithOwner("Alice");
    const b = await shopWithOwner("Bob");

    const visible = await withTenantTx({ shopId: a.shopId, userId: a.owner.id }, (tx) => tx.select().from(shops));
    expect(visible.map((s) => s.id)).toEqual([a.shopId]);

    const hours = await withTenantTx({ shopId: a.shopId }, (tx) => tx.select().from(shopOpeningHours));
    expect(hours.length).toBeGreaterThan(0);
    expect(hours.every((h) => h.shopId === a.shopId)).toBe(true);

    // Even an explicit filter for the other shop returns nothing.
    const leaked = await withTenantTx({ shopId: a.shopId }, (tx) =>
      tx.select().from(shopOpeningHours).where(eq(shopOpeningHours.shopId, b.shopId)),
    );
    expect(leaked).toEqual([]);
  });

  it("fails closed when no tenant context is set", async () => {
    await shopWithOwner();
    const rows = await withTenantTx({}, (tx) => tx.select().from(shops));
    expect(rows).toEqual([]);
    const team = await withTenantTx({}, (tx) => tx.select().from(staffMembers));
    expect(team).toEqual([]);
  });

  it("rejects writes into another shop", async () => {
    const a = await shopWithOwner();
    const b = await shopWithOwner();
    expect(
      await pgErrorOf(
        withTenantTx({ shopId: a.shopId }, (tx) =>
          tx.insert(shopOpeningHours).values({ shopId: b.shopId, weekday: 1, opensAt: "09:00", closesAt: "10:00" }),
        ),
      ),
    ).toMatch(/row-level security/);
    await expect(
      withTenantTx({ shopId: a.shopId }, (tx) => tx.update(shops).set({ name: "Hacked" }).where(eq(shops.id, b.shopId))),
    ).resolves.toBeDefined();
    const { rows } = await adminPool.query("select name from shops where id = $1", [b.shopId]);
    expect(rows[0].name).not.toBe("Hacked");
  });

  it("prevents cross-shop references through composite foreign keys", async () => {
    const a = await shopWithOwner();
    const b = await shopWithOwner();
    const { ctx: bManager } = await addMember(b.shopId, "manager");
    // Even with RLS bypassed (owner connection), a shop-A staff profile can't point at a shop-B membership.
    await expect(
      adminPool.query(
        "insert into staff_members (id, shop_id, membership_id, display_name) values ($1, $2, $3, 'X')",
        [uuidv7(), a.shopId, bManager.membershipId],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("keeps the audit log append-only for the app", async () => {
    const a = await shopWithOwner();
    const scope = { shopId: a.shopId, userId: a.owner.id };
    const entries = await withTenantTx(scope, (tx) => tx.select().from(auditLog));
    expect(entries.some((e) => e.action === "shop.created")).toBe(true);
    expect(await pgErrorOf(withTenantTx(scope, (tx) => tx.update(auditLog).set({ action: "tampered" })))).toMatch(
      /permission denied/,
    );
    expect(await pgErrorOf(withTenantTx(scope, (tx) => tx.delete(auditLog)))).toMatch(/permission denied/);
  });

  it("does not let the app role delete shops or bypass RLS settings", async () => {
    const a = await shopWithOwner();
    expect(await pgErrorOf(withTenantTx({ shopId: a.shopId }, (tx) => tx.delete(shops)))).toMatch(/permission denied/);
    const { rows } = await adminPool.query("select count(*)::int as n from shops");
    expect(rows[0].n).toBe(1);
    // Tenant settings are transaction-local, so they don't leak to the next pooled query.
    await withTenantTx({ shopId: a.shopId }, async () => undefined);
    const after = await withTenantTx({}, (tx) => tx.execute(sql`select app_shop_id() as id`));
    expect(after.rows[0].id).toBeNull();
  });

  it("services only return the actor's own shop", async () => {
    const a = await shopWithOwner("Alice");
    const b = await shopWithOwner("Bob");
    expect((await getShop(a.ctx)).id).toBe(a.shopId);
    const hours = await getOpeningHours(b.ctx);
    expect(hours).toHaveLength(5);
    const team = await listTeam(a.ctx);
    expect(team.members.map((m) => m.name)).toEqual(["Alice"]);
    const memberships = await listUserMemberships(a.owner.id);
    expect(memberships.map((m) => m.shopId)).toEqual([a.shopId]);
  });
});
