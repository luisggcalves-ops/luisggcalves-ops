"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

/** Hamburger menu that shows the sidebar as a drawer on small screens. */
export function MobileDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Close the drawer after navigating to another page.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-fg lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-bg p-3 shadow-pop animate-in">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mb-2 ml-auto grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
}
