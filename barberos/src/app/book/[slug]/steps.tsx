import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";

export function StepHeader({ step, title, backHref }: { step: number; title: string; backHref?: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between">
        {backHref ? (
          <Link href={backHref} className="-ml-1 inline-flex items-center gap-1 text-[13px] text-fg-muted hover:text-fg">
            <ChevronLeft className="size-4" /> Back
          </Link>
        ) : (
          <span />
        )}
        <div className="flex gap-1" aria-label={`Step ${step} of 4`}>
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={cn("h-1 w-6 rounded-full", i <= step ? "bg-primary" : "bg-border")} />
          ))}
        </div>
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
    </div>
  );
}

export function ChoiceLink({ href, title, meta, aside }: { href: string; title: string; meta?: string; aside?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3.5 shadow-card transition-colors hover:border-fg active:bg-surface-muted"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {meta ? <span className="mt-0.5 block text-[13px] text-fg-muted">{meta}</span> : null}
      </span>
      {aside ? <span className="shrink-0 text-sm font-medium tabular">{aside}</span> : null}
    </Link>
  );
}
