import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A horizontally scrollable region that keyboard users can focus and scroll with the arrow keys. */
export function ScrollArea({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      data-scroll-x
      className={cn("overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", className)}
    >
      {children}
    </div>
  );
}
