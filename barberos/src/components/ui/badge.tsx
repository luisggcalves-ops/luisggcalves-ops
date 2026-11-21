import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "success" | "warning" | "danger" | "inverse";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-muted text-fg-muted border-border",
  success: "bg-success-bg text-success border-transparent",
  warning: "bg-warning-bg text-warning border-transparent",
  danger: "bg-danger-bg text-danger border-transparent",
  inverse: "bg-primary text-primary-fg border-transparent",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
