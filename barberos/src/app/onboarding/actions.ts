"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { createShop } from "@/server/domain/shops/service";
import { runAction, type ActionState } from "@/server/actions";
import { setActiveShopCookie } from "@/app/session-actions";
import { readJson, readString } from "@/server/form";

export async function createShopAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  let shopId: string | undefined;
  const result = await runAction(async () => {
    ({ shopId } = await createShop(user, {
      name: readString(formData, "name"),
      slug: readString(formData, "slug"),
      timezone: readString(formData, "timezone"),
      currency: readString(formData, "currency"),
      phone: readString(formData, "phone"),
      openingHours: readJson(formData, "openingHours"),
      ownerIsBarber: formData.get("ownerIsBarber") === "on",
    }));
    return { status: "success" };
  });
  if (result.status === "success" && shopId) {
    await setActiveShopCookie(shopId);
    redirect("/app");
  }
  return result;
}
