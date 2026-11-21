"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActionContext } from "@/server/tenancy";
import { runAction, type ActionState } from "@/server/actions";
import { changeMemberRole, inviteMember, revokeInvitation, setMemberActive } from "@/server/domain/team/service";
import { readJson, readString } from "@/server/form";
import {
  addTimeOff,
  createStaffProfile,
  deleteTimeOff,
  replaceWorkingHours,
  setStaffActive,
  setStaffServices,
  updateStaffProfile,
} from "@/server/domain/staff/service";
import { sendEmail } from "@/server/notifications/mailer";
import { env } from "@/server/env";
import { ROLE_LABELS } from "@/server/authz/permissions";

export async function inviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("team.invite");
    const invite = await inviteMember(ctx, { email: readString(formData, "email"), role: readString(formData, "role") });
    const url = `${env().BETTER_AUTH_URL}/invite/${invite.token}`;
    let emailed = true;
    try {
      await sendEmail({
        to: invite.email,
        subject: `${ctx.user.name} invited you to ${invite.shopName} on BarberOS`,
        text: `Hi,\n\n${ctx.user.name} invited you to join ${invite.shopName} on BarberOS as ${ROLE_LABELS[invite.role].toLowerCase()}.\n\nAccept the invitation (valid for 7 days):\n${url}\n`,
      });
    } catch (err) {
      console.error("[invite] email failed", err);
      emailed = false;
    }
    revalidatePath("/app/staff");
    revalidatePath("/app");
    return {
      status: "success",
      message: emailed
        ? `Invitation sent to ${invite.email}. You can also share the link below.`
        : `Invitation created, but the email couldn't be sent. Share the link below with ${invite.email}.`,
      data: { url },
    };
  });
}

export async function revokeInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("team.invite");
    await revokeInvitation(ctx, readString(formData, "invitationId"));
    revalidatePath("/app/staff");
    revalidatePath("/app");
    return { status: "success" };
  });
}

export async function changeRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("team.manage");
    await changeMemberRole(ctx, { membershipId: readString(formData, "membershipId"), role: readString(formData, "role") });
    revalidatePath("/app/staff");
    return { status: "success", message: "Role updated." };
  });
}

export async function setMemberActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("team.manage");
    await setMemberActive(ctx, readString(formData, "membershipId"), readString(formData, "active") === "true");
    revalidatePath("/app/staff");
    revalidatePath("/app");
    return { status: "success" };
  });
}

/* ------------------------------ barber profiles ------------------------------ */

export async function createStaffProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let created: string | null = null;
  const result = await runAction(async () => {
    const ctx = await requireActionContext("staff.manage");
    const { staffMemberId } = await createStaffProfile(ctx, {
      displayName: readString(formData, "displayName"),
      membershipId: readString(formData, "membershipId") || null,
      calendarColor: readString(formData, "calendarColor") || "graphite",
    });
    created = staffMemberId;
    revalidatePath("/app", "layout");
    return { status: "success" };
  });
  if (created) redirect(`/app/staff/${created}`);
  return result;
}

export async function updateStaffProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("staff.manage");
    await updateStaffProfile(ctx, readString(formData, "staffMemberId"), {
      displayName: readString(formData, "displayName"),
      bio: readString(formData, "bio"),
      calendarColor: readString(formData, "calendarColor"),
      isBookable: formData.get("isBookable") === "on",
    });
    revalidatePath("/app", "layout");
    return { status: "success", message: "Profile saved." };
  });
}

export async function setStaffActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("staff.manage");
    await setStaffActive(ctx, readString(formData, "staffMemberId"), readString(formData, "active") === "true");
    revalidatePath("/app", "layout");
    return { status: "success" };
  });
}

export async function replaceWorkingHoursAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("staff.manage");
    await replaceWorkingHours(ctx, readString(formData, "staffMemberId"), readJson(formData, "workingHours"));
    revalidatePath("/app", "layout");
    return { status: "success", message: "Working hours saved." };
  });
}

export async function setStaffServicesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("staff.manage");
    const offered = formData.getAll("serviceIds").map(String);
    await setStaffServices(
      ctx,
      readString(formData, "staffMemberId"),
      offered.map((serviceId) => ({
        serviceId,
        price: readString(formData, `price:${serviceId}`),
        durationMin: readString(formData, `duration:${serviceId}`),
      })),
    );
    revalidatePath("/app", "layout");
    return { status: "success", message: "Services saved." };
  });
}

export async function addTimeOffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("staff.manage");
    const allDay = formData.get("allDay") === "on";
    await addTimeOff(ctx, readString(formData, "staffMemberId"), {
      startsOn: readString(formData, "startsOn"),
      endsOn: readString(formData, "endsOn") || readString(formData, "startsOn"),
      allDay,
      startTime: allDay ? undefined : readString(formData, "startTime"),
      endTime: allDay ? undefined : readString(formData, "endTime"),
      type: readString(formData, "type") || "holiday",
      note: readString(formData, "note"),
    });
    revalidatePath("/app", "layout");
    return { status: "success", message: "Time off added." };
  });
}

export async function deleteTimeOffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("staff.manage");
    await deleteTimeOff(ctx, readString(formData, "timeOffId"));
    revalidatePath("/app", "layout");
    return { status: "success" };
  });
}
