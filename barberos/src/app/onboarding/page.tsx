import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { requireUser } from "@/server/auth/session";
import { resolveShopContext } from "@/server/tenancy";
import { listTimeZones } from "@/lib/time";
import { CreateShopForm } from "./form";

export const metadata: Metadata = { title: "Create your shop" };

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const ctx = await resolveShopContext();
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between px-6 py-5">
        <Logo />
        {ctx ? (
          <Link href="/start" className="text-[13px] text-fg-muted hover:text-fg">
            Back to {ctx.shop.shopName}
          </Link>
        ) : null}
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-4 sm:pt-10 animate-in">
        <p className="text-[13px] font-medium uppercase tracking-wider text-fg-subtle">Set up</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Let&apos;s set up your shop</h1>
        <p className="mt-2 text-sm text-fg-muted">
          You can change all of this later in Settings. Services and your team come next.
        </p>
        <CreateShopForm ownerName={user.name} timeZones={listTimeZones()} />
      </main>
    </div>
  );
}
