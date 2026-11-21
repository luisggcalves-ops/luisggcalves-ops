"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NavIcon } from "./nav-icon";
import type { NavItem } from "./nav-config";

export function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        if (!item.available) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title="Coming in an upcoming release"
              className="flex h-9 cursor-default items-center gap-3 rounded-lg px-2.5 text-sm text-fg-subtle"
            >
              <NavIcon name={item.icon} className="size-[18px]" />
              <span className="flex-1">{item.label}</span>
              <span className="rounded-full border border-border px-1.5 text-[10px] font-medium uppercase tracking-wider">Soon</span>
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors",
              active ? "bg-surface font-medium text-fg shadow-card ring-1 ring-border" : "text-fg-muted hover:bg-surface-muted hover:text-fg",
            )}
          >
            <NavIcon name={item.icon} className="size-[18px]" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
