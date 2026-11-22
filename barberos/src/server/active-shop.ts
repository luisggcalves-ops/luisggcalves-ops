import "server-only";
import { cookies } from "next/headers";

export const ACTIVE_SHOP_COOKIE = "barberos_shop";

/**
 * Remembers which shop a multi-shop user is working in. It's only a preference:
 * the shop is used only if the user is an active member (see resolveShopContext).
 * Kept out of "use server" files on purpose, so it isn't callable from the browser.
 */
export async function setActiveShopCookie(shopId: string) {
  (await cookies()).set(ACTIVE_SHOP_COOKIE, shopId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
