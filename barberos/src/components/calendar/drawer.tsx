"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

/** Side panel for creating and viewing appointments. Its open state lives in the URL. */
export function Drawer({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(closeHref, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, router]);

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={title}>
      <Link href={closeHref} scroll={false} className="absolute inset-0 bg-black/20" aria-label="Close" tabIndex={-1} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col border-l border-border bg-bg shadow-pop animate-in">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <Link href={closeHref} scroll={false} className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted" aria-label="Close panel">
            <X className="size-4" />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
