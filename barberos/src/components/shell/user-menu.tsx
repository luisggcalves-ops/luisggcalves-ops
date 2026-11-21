import Link from "next/link";
import { LogOut, Smartphone } from "lucide-react";
import { signOutAction } from "@/app/session-actions";
import type { SessionUser } from "@/server/domain/context";

export function UserMenu({ user, showBarberLink }: { user: SessionUser; showBarberLink: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-border pt-3">
      {showBarberLink ? (
        <Link href="/barber" className="flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm text-fg-muted hover:bg-surface-muted hover:text-fg">
          <Smartphone className="size-[18px]" strokeWidth={1.75} aria-hidden /> Barber view
        </Link>
      ) : null}
      <div className="flex items-center gap-3 px-2.5 py-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted text-[12px] font-semibold">
          {initials(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{user.name}</span>
          <span className="block truncate text-[12px] text-fg-muted">{user.email}</span>
        </span>
        <form action={signOutAction}>
          <button type="submit" className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label="Sign out" title="Sign out">
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
