import Link from "next/link";
import { Logo } from "@/components/logo";
import { requirePageContext } from "@/server/tenancy";
import { OWNER_NAV } from "@/components/shell/nav-config";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { ShopSwitcher } from "@/components/shell/shop-switcher";
import { UserMenu } from "@/components/shell/user-menu";
import { MobileDrawer } from "@/components/shell/mobile-drawer";
import { DemoBanner } from "@/components/shell/demo-banner";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageContext("dashboard.view", "/app");

  const sidebar = (
    <div className="flex h-full flex-col gap-4">
      <ShopSwitcher ctx={ctx} />
      <div className="flex-1">
        <SidebarNav items={OWNER_NAV} />
      </div>
      <UserMenu user={ctx.user} showBarberLink />
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border px-3 py-4 lg:flex">
        <Link href="/app" className="mb-4 px-2.5">
          <Logo />
        </Link>
        {sidebar}
      </aside>
      <div className="min-w-0">
        {ctx.shop.isDemo ? <DemoBanner /> : null}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur lg:hidden">
          <MobileDrawer>{sidebar}</MobileDrawer>
          <Logo />
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10 animate-in">{children}</main>
      </div>
    </div>
  );
}
