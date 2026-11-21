"use server";

import { revalidatePath } from "next/cache";
import { requireActionContext } from "@/server/tenancy";
import { runAction, type ActionState } from "@/server/actions";
import { addClosure, deleteClosure, replaceOpeningHours, updateBookingSettings, updateShopProfile } from "@/server/domain/shops/service";
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

export async function updateBookingSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("shop.update");
    const brand = readString(formData, "brandColor");
    await updateBookingSettings(ctx, {
      onlineBookingEnabled: formData.get("onlineBookingEnabled") === "on",
      autoConfirmOnline: formData.get("autoConfirmOnline") === "on",
      requireCustomerEmail: formData.get("requireCustomerEmail") === "on",
      slotIntervalMin: readString(formData, "slotIntervalMin"),
      bookingLeadTimeMin: readString(formData, "bookingLeadTimeMin"),
      bookingHorizonDays: readString(formData, "bookingHorizonDays"),
      cancellationWindowHours: readString(formData, "cancellationWindowHours"),
      brandColor: brand && brand !== "default" ? brand : null,
    });
    revalidatePath("/app", "layout");
    revalidatePath("/book", "layout");
    return { status: "success", message: "Online booking settings saved." };
  });
}
