"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActionContext } from "@/server/tenancy";
import { runAction, type ActionState } from "@/server/actions";
import { addCustomerNote, anonymizeCustomer, deleteCustomerNote, updateCustomer } from "@/server/domain/customers/crm";
import { readString } from "@/server/form";

function revalidateCustomers() {
  revalidatePath("/app", "layout");
  revalidatePath("/barber", "layout");
}

export async function addNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext();
    await addCustomerNote(
      ctx,
      readString(formData, "customerId"),
      {
        body: readString(formData, "body"),
        kind: readString(formData, "kind") || "haircut",
        appointmentId: readString(formData, "appointmentId") || null,
      },
      ctx.user.name,
    );
    revalidateCustomers();
    return { status: "success", message: "Note added." };
  });
}

export async function deleteNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext();
    await deleteCustomerNote(ctx, readString(formData, "noteId"));
    revalidateCustomers();
    return { status: "success" };
  });
}

export async function updateCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("customers.edit");
    await updateCustomer(ctx, readString(formData, "customerId"), {
      fullName: readString(formData, "fullName"),
      phone: readString(formData, "phone"),
      email: readString(formData, "email"),
      preferredStaffMemberId: readString(formData, "preferredStaffMemberId"),
      hairPreferences: readString(formData, "hairPreferences"),
      marketingConsent: formData.get("marketingConsent") === "on",
    });
    revalidateCustomers();
    return { status: "success", message: "Customer saved." };
  });
}

export async function anonymizeCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const ctx = await requireActionContext("customers.delete");
    await anonymizeCustomer(ctx, readString(formData, "customerId"));
    revalidateCustomers();
    return { status: "success" };
  });
  if (result.status === "success") redirect("/app/customers?deleted=1");
  return result;
}
