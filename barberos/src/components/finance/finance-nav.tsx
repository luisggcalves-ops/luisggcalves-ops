"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { PERIODS } from "@/lib/period";

const TABS = [
  { href: "/app/finance", label: "Overview" },
  { href: "/app/finance/payments", label: "Payments" },
  { href: "/app/finance/commissions", label: "Commissions" },
  { href: "/app/finance/expenses", label: "Expenses" },
];

/** Section tabs and the period picker. Both keep the chosen period in the URL. */
export function FinanceNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const qs = params.toString() ? `?${params}` : "";
  const current = params.get("p") ?? "month";
  const setPeriod = (p: Record<string, string>) => router.push(`${pathname}?${new URLSearchParams(p)}`);
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-border lg:flex-row lg:items-end lg:justify-between">
      <nav aria-label="Finance sections" className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={`${t.href}${qs}`}
            aria-current={pathname === t.href ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm",
              pathname === t.href ? "border-fg font-medium" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border-strong bg-surface p-0.5" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={current === p.key}
              onClick={() => setPeriod({ p: p.key })}
              className={cn("rounded-md px-2.5 py-1 text-[13px]", current === p.key ? "bg-primary text-primary-fg" : "text-fg-muted hover:text-fg")}
            >
              {p.label}
            </button>
          ))}
        </div>
        <form
          className="inline-flex items-center gap-1 text-[13px]"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setPeriod({ p: "custom", from: String(f.get("from")), to: String(f.get("to")) });
          }}
        >
          <input type="date" name="from" required defaultValue={params.get("from") ?? ""} aria-label="From" className="h-8 rounded-md border border-border-strong bg-surface px-1.5" />
          <span className="text-fg-subtle">–</span>
          <input type="date" name="to" required defaultValue={params.get("to") ?? ""} aria-label="To" className="h-8 rounded-md border border-border-strong bg-surface px-1.5" />
          <button type="submit" className={cn("h-8 rounded-md border px-2.5", current === "custom" ? "border-primary bg-primary text-primary-fg" : "border-border-strong bg-surface")}>
            Apply
          </button>
        </form>
      </div>
    </div>
  );
}
