import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser, requireUser } from "@/server/auth/session";
import { listUserMemberships, type UserMembership } from "@/server/domain/shops/service";
import { can, homePathFor, type Permission } from "@/server/authz/permissions";
import type { ActorContext, SessionUser } from "@/server/domain/context";
import { forbidden } from "@/server/errors";

import { ACTIVE_SHOP_COOKIE } from "@/server/active-shop";
export { ACTIVE_SHOP_COOKIE };

export type ShopContext = ActorContext & {
  user: SessionUser;
  shop: UserMembership;
  memberships: UserMembership[];
};

const memberships = cache((userId: string) => listUserMemberships(userId));

/**
 * Resolves the user and the shop they are acting in. The active shop comes from
 * a cookie, but it is only used if the user is an active member of that shop.
 * Otherwise the first membership is used. Returns null when signed out or
 * without any membership.
 */
export const resolveShopContext = cache(async (): Promise<ShopContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const list = await memberships(user.id);
  if (!list.length) return null;
  const preferred = (await cookies()).get(ACTIVE_SHOP_COOKIE)?.value;
  const active = list.find((m) => m.shopId === preferred) ?? list[0];
  return {
    user,
    userId: user.id,
    shopId: active.shopId,
    membershipId: active.membershipId,
    role: active.role,
    shop: active,
    memberships: list,
  };
});

/**
 * For pages: makes sure there is a user, a shop and, optionally, a permission.
 * Redirects to the right place instead of showing an error.
 */
export async function requirePageContext(permission?: Permission, next?: string): Promise<ShopContext> {
  await requireUser(next);
  const ctx = await resolveShopContext();
  if (!ctx) redirect("/onboarding");
  if (permission && !can(ctx.role, permission)) redirect(homePathFor(ctx.role));
  return ctx;
}

/** For server actions: like requirePageContext, but throws on a missing permission. */
export async function requireActionContext(permission?: Permission): Promise<ShopContext> {
  const ctx = await resolveShopContext();
  if (!ctx) throw forbidden("Your session has expired. Please sign in again.");
  if (permission && !can(ctx.role, permission)) throw forbidden();
  return ctx;
}
