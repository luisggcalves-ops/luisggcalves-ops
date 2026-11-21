import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { signOutAction, switchShopAction } from "@/app/session-actions";
import { ROLE_LABELS } from "@/server/authz/permissions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChangePasswordForm, ProfileNameForm } from "@/components/account/account-forms";
import { initials } from "@/components/shell/user-menu";

export const metadata: Metadata = { title: "Profile" };

export default async function BarberProfilePage() {
  const ctx = await requirePageContext("barber_app.view");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 py-2">
        <span className="grid size-14 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-fg">
          {initials(ctx.user.name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{ctx.user.name}</h1>
          <p className="truncate text-[13px] text-fg-muted">
            {ROLE_LABELS[ctx.role]} at {ctx.shop.shopName}
          </p>
        </div>
      </div>

      {ctx.memberships.length > 1 ? (
        <Card>
          <CardHeader title="Your shops" />
          <ul className="divide-y divide-border">
            {ctx.memberships.map((m) => (
              <li key={m.shopId}>
                <form action={switchShopAction}>
                  <input type="hidden" name="shopId" value={m.shopId} />
                  <button type="submit" className="flex w-full items-center justify-between px-5 py-3 text-left text-sm hover:bg-surface-muted">
                    <span>{m.shopName}</span>
                    {m.shopId === ctx.shopId ? <Badge tone="inverse">Current</Badge> : <Badge>{ROLE_LABELS[m.role]}</Badge>}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <ProfileNameForm name={ctx.user.name} email={ctx.user.email} />
      <ChangePasswordForm />

      <Card>
        <CardBody>
          <form action={signOutAction}>
            <button type="submit" className="flex w-full items-center justify-center gap-2 py-1 text-sm font-medium text-danger">
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
