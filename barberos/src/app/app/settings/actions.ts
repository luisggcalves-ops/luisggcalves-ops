"use server";

import { revalidatePath } from "next/cache";
import { requireActionContext } from "@/server/tenancy";
import { runAction, type ActionState } from "@/server/actions";
import { addClosure, deleteClosure, replaceOpeningHours, updateShopProfile } from "@/server/domain/shops/service";
import { readJson, readString } from "@/server/form";

export async function updateShopProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("shop.update");
    await updateShopProfile(ctx, {
      name: readString(formData, "name"),
      slug: readString(formData, "slug"),
      timezone: readString(formData, "timezone"),
      currency: readString(formData, "currency"),
      phone: readString(formData, "phone"),
      email: readString(formData, "email"),
      addressLine: readString(formData, "addressLine"),
      city: readString(formData, "city"),
      postalCode: readString(formData, "postalCode"),
    });
    revalidatePath("/app", "layout");
    return { status: "success", message: "Shop profile saved." };
  });
}

export async function updateOpeningHoursAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("shop.update");
    await replaceOpeningHours(ctx, readJson(formData, "openingHours"));
    revalidatePath("/app", "layout");
    return { status: "success", message: "Opening hours saved." };
  });
}

export async function addClosureAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("shop.update");
    await addClosure(ctx, {
      startsOn: readString(formData, "startsOn"),
      endsOn: readString(formData, "endsOn") || readString(formData, "startsOn"),
      reason: readString(formData, "reason"),
    });
    revalidatePath("/app", "layout");
    return { status: "success", message: "Closure added." };
  });
}

export async function deleteClosureAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("shop.update");
    await deleteClosure(ctx, readString(formData, "closureId"));
    revalidatePath("/app", "layout");
    return { status: "success" };
  });
}
