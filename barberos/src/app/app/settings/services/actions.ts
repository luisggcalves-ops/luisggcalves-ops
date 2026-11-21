"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActionContext } from "@/server/tenancy";
import { runAction, type ActionState } from "@/server/actions";
import { createService, setServiceActive, updateService } from "@/server/domain/services/service";
import { readString } from "@/server/form";

function readServiceForm(formData: FormData) {
  return {
    name: readString(formData, "name"),
    description: readString(formData, "description"),
    durationMin: readString(formData, "durationMin"),
    bufferAfterMin: readString(formData, "bufferAfterMin") || "0",
    price: readString(formData, "price"),
    isPublic: formData.get("isPublic") === "on",
    staffMemberIds: formData.getAll("staffMemberIds").map(String),
  };
}

export async function createServiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireActionContext("services.manage");
    await createService(ctx, readServiceForm(formData));
    revalidatePath("/app", "layout");
    return { status: "success", message: "Service added." };
  });
  if (result.status === "success") redirect("/app/settings/services");
  return result;
}

export async function updateServiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("services.manage");
    await updateService(ctx, readString(formData, "serviceId"), readServiceForm(formData));
    revalidatePath("/app", "layout");
    return { status: "success", message: "Service saved. New prices apply to new bookings." };
  });
}

export async function setServiceActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("services.manage");
    await setServiceActive(ctx, readString(formData, "serviceId"), readString(formData, "active") === "true");
    revalidatePath("/app", "layout");
    return { status: "success" };
  });
}
