"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { acceptInvitation } from "@/server/domain/team/service";
import { runAction, type ActionState } from "@/server/actions";
import { readString } from "@/server/form";
import { setActiveShopCookie } from "@/server/active-shop";
import { homePathFor } from "@/server/authz/permissions";

export async function acceptInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = readString(formData, "token");
  const user = await requireUser(`/invite/${token}`);
  let destination: string | null = null;
  const result = await runAction(async () => {
    const { shopId, role } = await acceptInvitation(user, token);
    await setActiveShopCookie(shopId);
    destination = homePathFor(role);
    return { status: "success" };
  });
  if (destination) redirect(destination);
  return result;
}
