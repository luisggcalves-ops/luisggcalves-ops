import type { Metadata } from "next";
import { requirePageContext } from "@/server/tenancy";
import { ChangePasswordForm, ProfileNameForm } from "@/components/account/account-forms";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const ctx = await requirePageContext();
  return (
    <div className="flex flex-col gap-6">
      <ProfileNameForm name={ctx.user.name} email={ctx.user.email} />
      <ChangePasswordForm />
    </div>
  );
}
