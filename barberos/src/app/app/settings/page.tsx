import type { Metadata } from "next";
import { requirePageContext } from "@/server/tenancy";
import { getShop } from "@/server/domain/shops/service";
import { can } from "@/server/authz/permissions";
import { listTimeZones } from "@/lib/time";
import { ShopProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Shop profile" };

export default async function ShopProfilePage() {
  const ctx = await requirePageContext("shop.view");
  const shop = await getShop(ctx);
  return (
    <ShopProfileForm
      disabled={!can(ctx.role, "shop.update")}
      timeZones={listTimeZones()}
      defaults={{
        name: shop.name,
        slug: shop.slug,
        timezone: shop.timezone,
        currency: shop.currency,
        phone: shop.phone ?? "",
        email: shop.email ?? "",
        addressLine: shop.addressLine ?? "",
        city: shop.city ?? "",
        postalCode: shop.postalCode ?? "",
      }}
    />
  );
}
