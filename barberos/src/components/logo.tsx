import { cn } from "@/lib/cn";

export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-fg" aria-hidden>
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M8 3v18M16 3v18" />
          <path d="M8 7l8 4M8 13l8 4" />
        </svg>
      </span>
      {withWordmark ? <span className="text-[15px]">BarberOS</span> : null}
    </span>
  );
}
