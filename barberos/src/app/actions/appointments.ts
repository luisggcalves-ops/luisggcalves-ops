"use server";

import { revalidatePath } from "next/cache";
import { requireActionContext } from "@/server/tenancy";
import { runAction, type ActionState } from "@/server/actions";
import {
  changeAppointmentStatus,
  createAppointment,
  getAvailableSlots,
  rescheduleAppointment,
  updateAppointmentNotes,
} from "@/server/domain/appointments/service";
import { searchCustomers } from "@/server/domain/customers/service";
import { readString } from "@/server/form";
import { errorFields, logEvent } from "@/server/log";
import { formatClock } from "@/lib/time";
import { formatPhone } from "@/lib/phone";
import { DomainError } from "@/server/errors";

function revalidateCalendars() {
  revalidatePath("/app", "layout");
  revalidatePath("/barber", "layout");
}

/** Free start times ("HH:MM") for the booking and reschedule forms. */
export async function getSlotsAction(input: {
  staffMemberId: string;
  serviceId: string;
  date: string;
  excludeAppointmentId?: string;
}): Promise<{ slots: string[] } | { error: string }> {
  try {
    const ctx = await requireActionContext();
    const slots = await getAvailableSlots(ctx, input);
    return { slots: slots.map((s) => formatClock(s, ctx.shop.timezone)) };
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    logEvent("error", "slots_error", errorFields(err));
    return { error: "Couldn't load available times." };
  }
}

export async function searchCustomersAction(query: string) {
  try {
    const ctx = await requireActionContext("customers.search");
    const rows = await searchCustomers(ctx, query);
    return rows.map((r) => ({ ...r, phone: formatPhone(r.phoneE164) }));
  } catch {
    return [];
  }
}

export async function createAppointmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext();
    const customerId = readString(formData, "customerId");
    const { appointmentId } = await createAppointment(ctx, {
      staffMemberId: readString(formData, "staffMemberId"),
      serviceId: readString(formData, "serviceId"),
      date: readString(formData, "date"),
      time: readString(formData, "time"),
      customerId: customerId || null,
      newCustomer: customerId
        ? null
        : {
            fullName: readString(formData, "customerName"),
            phone: readString(formData, "customerPhone"),
            email: readString(formData, "customerEmail"),
          },
      internalNote: readString(formData, "internalNote"),
      allowOutsideHours: formData.get("allowOutsideHours") === "on",
      source: formData.get("walkIn") === "on" ? "walk_in" : "staff",
    });
    revalidateCalendars();
    return { status: "success", message: "Appointment booked.", data: { appointmentId } };
  });
}

export async function rescheduleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext();
    await rescheduleAppointment(ctx, {
      appointmentId: readString(formData, "appointmentId"),
      staffMemberId: readString(formData, "staffMemberId"),
      date: readString(formData, "date"),
      time: readString(formData, "time"),
      version: readString(formData, "version"),
      allowOutsideHours: formData.get("allowOutsideHours") === "on",
    });
    revalidateCalendars();
    return { status: "success", message: "Appointment moved." };
  });
}

const STATUS_MESSAGES: Record<string, string> = {
  confirmed: "Appointment confirmed.",
  completed: "Marked as completed.",
  cancelled: "Appointment cancelled.",
  no_show: "Marked as no-show.",
};

export async function changeStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext();
    const to = readString(formData, "to");
    await changeAppointmentStatus(ctx, {
      appointmentId: readString(formData, "appointmentId"),
      to,
      reason: readString(formData, "reason"),
      version: readString(formData, "version"),
    });
    revalidateCalendars();
    return { status: "success", message: STATUS_MESSAGES[to] ?? "Updated." };
  });
}

export async function updateNotesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext();
    await updateAppointmentNotes(ctx, {
      appointmentId: readString(formData, "appointmentId"),
      internalNote: readString(formData, "internalNote"),
    });
    revalidateCalendars();
    return { status: "success", message: "Note saved." };
  });
}
