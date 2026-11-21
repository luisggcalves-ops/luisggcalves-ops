import type { Metadata } from "next";
import { requirePageContext } from "@/server/tenancy";
import { getOpeningHours, getShop } from "@/server/domain/shops/service";
import { OpeningHoursForm } from "./form";

export const metadata: Metadata = { title: "Opening hours" };

export default async function OpeningHoursPage() {
  const ctx = await requirePageContext("shop.update");
  const [shop, hours] = await Promise.all([getShop(ctx), getOpeningHours(ctx)]);
  return <OpeningHoursForm hours={hours} timezone={shop.timezone} />;
}
