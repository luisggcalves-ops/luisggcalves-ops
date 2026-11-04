"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import clsx from "clsx";
import { avatarColor } from "@/lib/constants";
import type { Profile } from "@/lib/types";

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
};

export function Avatar({
  profile,
  size = "md",
  className,
}: {
  profile?: Pick<Profile, "display_name" | "avatar_color" | "avatar_emoji"> | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const c = avatarColor(profile?.avatar_color);
  return (
    <span
      className={clsx(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold select-none",
        profile ? [c.bg, c.fg] : "border border-dashed border-line-strong text-muted",
        SIZES[size],
        className,
      )}
      title={profile?.display_name}
      aria-hidden
    >
      {profile ? profile.avatar_emoji || initials(profile.display_name) : "?"}
    </span>
  );
}

export function ProgressRing({
  value,
  size = 120,
  stroke = 10,
  children,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={clsx("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-surface-2" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          className="fill-none stroke-accent"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c - (pct / 100) * c }}
          transition={{ type: "spring", stiffness: 80, damping: 20 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, className, barClass }: { value: number; className?: string; barClass?: string }) {
  return (
    <div className={clsx("h-1.5 overflow-hidden rounded-full bg-surface-2", className)}>
      <motion.div
        className={clsx("h-full rounded-full", barClass ?? "bg-accent")}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ type: "spring", stiffness: 90, damping: 20 }}
      />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-label={title}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 400, damping: 34 }}
            className={clsx(
              "relative max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface p-5 shadow-pop sm:rounded-3xl sm:p-6",
              wide ? "sm:max-w-2xl" : "sm:max-w-md",
            )}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">{title}</h2>
              <button onClick={onClose} className="btn-ghost -mr-2 size-9 px-0" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={clsx("inline-flex rounded-xl bg-surface-2 p-1", className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
            value === o.value ? "text-ink" : "text-muted hover:text-ink",
          )}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${options.map((x) => x.value).join("-")}`}
              className="absolute inset-0 rounded-lg bg-surface shadow-card"
              transition={{ type: "spring", stiffness: 500, damping: 38 }}
            />
          )}
          <span className="relative flex items-center gap-1.5">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-accent" : "bg-line-strong",
      )}
    >
      <motion.span
        className="absolute size-5 rounded-full bg-white shadow"
        initial={false}
        animate={{ x: checked ? 18 : 2 }}
        transition={{ type: "spring", stiffness: 600, damping: 35 }}
      />
    </button>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
