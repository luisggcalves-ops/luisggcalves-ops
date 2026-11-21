"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NavIcon } from "./nav-icon";
import type { NavItem } from "./nav-config";

export function BottomTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const inner = (
            <>
              <NavIcon name={item.icon} className="size-[22px]" />
              <span className="text-[10.5px] font-medium">{item.label}</span>
            </>
          );
          return (
            <li key={item.href}>
              {item.available ? (
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex h-16 flex-col items-center justify-center gap-1", active ? "text-fg" : "text-fg-muted")}
                >
                  {inner}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  title="Coming in an upcoming release"
                  className="flex h-16 flex-col items-center justify-center gap-1 text-fg-subtle/60"
                >
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
