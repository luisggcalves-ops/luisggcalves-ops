"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { requireUser } from "@/server/auth/session";
import { listUserMemberships } from "@/server/domain/shops/service";
import { homePathFor } from "@/server/authz/permissions";
import { ACTIVE_SHOP_COOKIE } from "@/server/tenancy";

export async function signOutAction(formData?: FormData) {
  await auth.api.signOut({ headers: await headers() });
  (await cookies()).delete(ACTIVE_SHOP_COOKIE);
  const next = formData?.get("next");
  // Only same-site relative paths, never another origin.
  if (typeof next === "string" && next.startsWith("/") && !next.startsWith("//")) {
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }
  redirect("/sign-in");
}

export async function setActiveShopCookie(shopId: string) {
  (await cookies()).set(ACTIVE_SHOP_COOKIE, shopId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** Switches the active shop, but only to a shop the user is an active member of. */
export async function switchShopAction(formData: FormData) {
  const user = await requireUser();
  const shopId = String(formData.get("shopId") ?? "");
  const membership = (await listUserMemberships(user.id)).find((m) => m.shopId === shopId);
  if (!membership) redirect("/start");
  await setActiveShopCookie(membership.shopId);
  redirect(homePathFor(membership.role));
}
