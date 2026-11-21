"use server";

import { revalidatePath } from "next/cache";
import { requireActionContext } from "@/server/tenancy";
import { runAction, type ActionState } from "@/server/actions";
import { changeMemberRole, inviteMember, revokeInvitation, setMemberActive } from "@/server/domain/team/service";
import { readString } from "@/server/form";
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
