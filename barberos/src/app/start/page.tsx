import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { resolveShopContext } from "@/server/tenancy";
import { homePathFor } from "@/server/authz/permissions";

/** Post-sign-in router: sends users to their workspace, or to onboarding if they have no shop yet. */
export default async function StartPage() {
  await requireUser();
  const ctx = await resolveShopContext();
  redirect(ctx ? homePathFor(ctx.role) : "/onboarding");
}
