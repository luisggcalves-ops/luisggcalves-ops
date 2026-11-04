"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity as ActivityIcon,
  Bell,
  CheckSquare,
  Gift,
  Home,
  Plus,
  Settings,
  User,
  Users,
  CheckCheck,
} from "lucide-react";
import clsx from "clsx";
import { useFamily } from "./family-provider";
import { Avatar } from "./ui";
import { relativeTime } from "@/lib/dates";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/me", label: "My tasks", icon: User },
  { href: "/tasks", label: "All tasks", icon: CheckSquare },
  { href: "/members", label: "Family", icon: Users },
  { href: "/rewards", label: "Rewards", icon: Gift, gamified: true },
  { href: "/activity", label: "Activity", icon: ActivityIcon },
  { href: "/settings", label: "Settings", icon: Settings },
];

const MOBILE_NAV = ["/dashboard", "/me", "/tasks", "/members", "/settings"];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { family, me, live } = useFamily();
  const nav = NAV.filter((n) => !n.gamified || family.gamification_enabled);

  return (
    <div className="min-h-dvh md:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/60 px-3 py-4 backdrop-blur md:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2.5 px-2">
          <Logo />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{family.name}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <span className={clsx("size-1.5 rounded-full", live ? "bg-success" : "bg-line-strong")} />
              {live ? "Live" : "Connecting…"}
            </p>
          </div>
        </Link>
        <Link href="/tasks/new" className="btn-primary mb-4 w-full">
          <Plus className="size-4" /> New task
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5">
          {nav.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={clsx(
                  "relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  active ? "text-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-lg bg-surface-2"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <n.icon className="relative size-4" />
                <span className="relative">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <Link
          href="/me"
          className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2"
        >
          <Avatar profile={me.profile} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{me.profile.display_name}</p>
            <p className="text-xs text-muted capitalize">{me.role}</p>
          </div>
        </Link>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-bg/80 px-4 backdrop-blur-md md:justify-end md:px-8">
        <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
          <Logo />
          <span className="max-w-[45vw] truncate text-sm font-semibold">{family.name}</span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 md:px-8 md:pb-12">{children}</main>

      {/* Mobile FAB + tab bar */}
      <Link
        href="/tasks/new"
        aria-label="New task"
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-30 grid size-14 place-items-center rounded-full bg-ink text-surface shadow-pop transition active:scale-95 md:hidden"
      >
        <Plus className="size-6" />
      </Link>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="grid grid-cols-5">
          {MOBILE_NAV.map((href) => {
            const n = NAV.find((x) => x.href === href)!;
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-ink" : "text-muted",
                )}
              >
                <n.icon className={clsx("size-5", active && "stroke-[2.25]")} />
                {n.label === "All tasks" ? "Tasks" : n.label === "My tasks" ? "Me" : n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function Logo() {
  return (
    <span className="grid size-8 place-items-center rounded-[10px] bg-ink text-surface">
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" aria-hidden>
        <path d="M5 11 12 5l7 6v7.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="m9 14 2 2 4-4" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function NotificationBell() {
  const { notifications, markRead, markAllRead } = useFamily();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const unread = notifications.filter((n) => !n.read_at).length;

  // close the panel on navigation
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost relative size-10 px-0"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        data-testid="bell"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span
            key={unread}
            className="animate-pop absolute top-1.5 right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 500, damping: 36 }}
            className="fixed inset-x-3 top-16 z-40 origin-top-right overflow-hidden rounded-2xl border border-line bg-surface shadow-pop sm:absolute sm:inset-x-auto sm:top-12 sm:right-0 sm:w-96"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              {unread > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                  <CheckCheck className="size-3.5" /> Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-[60dvh] overflow-y-auto">
              {notifications.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-muted">You&apos;re all caught up.</li>
              )}
              {notifications.slice(0, 30).map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.task_id ? `/tasks/${n.task_id}` : n.type === "reward" ? "/rewards" : "/activity"}
                    onClick={() => !n.read_at && markRead(n.id)}
                    className="flex gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <span
                      className={clsx(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        n.read_at ? "bg-transparent" : n.type === "overdue" ? "bg-danger" : "bg-accent",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={clsx("text-sm", n.read_at ? "text-ink-2" : "font-medium text-ink")}>{n.title}</p>
                      <p className="truncate text-[13px] text-muted">{n.body}</p>
                      <p className="mt-0.5 text-[11px] text-muted">{relativeTime(n.created_at)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/settings#notifications" className="block border-t border-line px-4 py-2.5 text-center text-xs font-medium text-muted hover:text-ink">
              Notification settings
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
