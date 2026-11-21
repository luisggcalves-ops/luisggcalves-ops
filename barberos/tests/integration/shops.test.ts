import { describe, expect, it } from "vitest";
import { createShop, getOpeningHours, getOwnStaffProfile, replaceOpeningHours, updateShopProfile } from "@/server/domain/shops/service";
import { DomainError } from "@/server/errors";
import { actorFor, addMember, adminPool, createUser, shopInput, shopWithOwner } from "./helpers";

async function expectDomainError(p: Promise<unknown>, code: DomainError["code"]) {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(DomainError);
  expect((err as DomainError).code).toBe(code);
  return err as DomainError;
}

describe("shop creation", () => {
  it("creates the shop, settings, hours, owner membership and barber profile atomically", async () => {
    const user = await createUser("Ana Silva");
    const { shopId } = await createShop(user, shopInput({ name: "Corte Fino", slug: "corte-fino" }));
    const ctx = await actorFor(user, shopId);
    expect(ctx.role).toBe("owner");
    const { rows: settings } = await adminPool.query("select * from shop_settings where shop_id = $1", [shopId]);
    expect(settings[0].auto_confirm_online).toBe(true);
    expect(await getOpeningHours(ctx)).toHaveLength(5);
    const profile = await getOwnStaffProfile(ctx);
    expect(profile?.displayName).toBe("Ana Silva");
  });

  it("skips the barber profile when the owner doesn't cut hair", async () => {
    const user = await createUser();
    const { shopId } = await createShop(user, shopInput({ ownerIsBarber: false }));
    expect(await getOwnStaffProfile(await actorFor(user, shopId))).toBeNull();
  });

  it("rejects a taken booking link with a field error and leaves nothing behind", async () => {
    const a = await createUser();
    const b = await createUser();
    await createShop(a, shopInput({ slug: "the-barbers" }));
    const err = await expectDomainError(createShop(b, shopInput({ slug: "the-barbers" })), "CONFLICT");
    expect(err.fieldErrors?.slug).toBeDefined();
    const { rows } = await adminPool.query("select count(*)::int as n from shop_memberships where user_id = $1", [b.id]);
    expect(rows[0].n).toBe(0);
  });

  it("validates input", async () => {
    const user = await createUser();
    const err = await expectDomainError(
      createShop(user, shopInput({ name: "", slug: "Bad Slug!", timezone: "Mars/Olympus" })),
      "VALIDATION",
    );
    expect(Object.keys(err.fieldErrors ?? {})).toEqual(expect.arrayContaining(["name", "slug", "timezone"]));
    await expectDomainError(createShop(user, shopInput({ slug: "app" })), "VALIDATION");
  });
});

describe("shop configuration", () => {
  it("lets owners and managers update the profile and records an audit entry", async () => {
    const { ctx, shopId } = await shopWithOwner();
    const { ctx: manager } = await addMember(shopId, "manager");
    await updateShopProfile(manager, { ...shopInput(), name: "Renamed", slug: "renamed-shop", email: "HELLO@Shop.test" });
    const { rows } = await adminPool.query("select name, email from shops where id = $1", [shopId]);
    expect(rows[0]).toEqual({ name: "Renamed", email: "hello@shop.test" });
    const audit = await adminPool.query("select action, actor_user_id from audit_log where shop_id = $1 and action = 'shop.updated'", [shopId]);
    expect(audit.rows[0].actor_user_id).toBe(manager.userId);
    expect(ctx.role).toBe("owner");
  });

  it("forbids barbers from changing shop settings", async () => {
    const { shopId } = await shopWithOwner();
    const { ctx: barber } = await addMember(shopId, "barber");
    await expectDomainError(updateShopProfile(barber, shopInput()), "FORBIDDEN");
    await expectDomainError(replaceOpeningHours(barber, []), "FORBIDDEN");
  });

  it("replaces opening hours, supports split shifts and rejects overlaps", async () => {
    const { ctx } = await shopWithOwner();
    await replaceOpeningHours(ctx, [
      { weekday: 1, opensAt: "09:00", closesAt: "13:00" },
      { weekday: 1, opensAt: "14:00", closesAt: "19:00" },
      { weekday: 6, opensAt: "08:00", closesAt: "14:00" },
    ]);
    expect(await getOpeningHours(ctx)).toEqual([
      { weekday: 1, opensAt: "09:00", closesAt: "13:00" },
      { weekday: 1, opensAt: "14:00", closesAt: "19:00" },
      { weekday: 6, opensAt: "08:00", closesAt: "14:00" },
    ]);
    await expectDomainError(
      replaceOpeningHours(ctx, [
        { weekday: 2, opensAt: "09:00", closesAt: "13:00" },
        { weekday: 2, opensAt: "12:00", closesAt: "18:00" },
      ]),
      "VALIDATION",
    );
    await expectDomainError(replaceOpeningHours(ctx, [{ weekday: 2, opensAt: "18:00", closesAt: "09:00" }]), "VALIDATION");
    // The failed attempts did not change anything.
    expect(await getOpeningHours(ctx)).toHaveLength(3);
  });
});
