import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { BARBER_NAV } from "@/components/shell/nav-config";
import { BottomTabs } from "@/components/shell/bottom-tabs";
import { Logo } from "@/components/logo";
import { can } from "@/server/authz/permissions";
import { DemoBanner } from "@/components/shell/demo-banner";

export const metadata: Metadata = { title: { default: "Today", template: "%s · BarberOS" } };

export default async function BarberLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageContext("barber_app.view", "/barber");
  return (
    <div className="min-h-dvh pb-24">
      {ctx.shop.isDemo ? <DemoBanner /> : null}
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <Logo withWordmark={false} />
          <span className="truncate px-3 text-sm font-medium">{ctx.shop.shopName}</span>
          {can(ctx.role, "dashboard.view") ? (
            <Link href="/app" className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted" aria-label="Open dashboard">
              <LayoutGrid className="size-5" />
            </Link>
          ) : (
            <span className="size-9" />
          )}
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-5 animate-in">{children}</main>
      <BottomTabs items={BARBER_NAV} />
    </div>
  );
}
