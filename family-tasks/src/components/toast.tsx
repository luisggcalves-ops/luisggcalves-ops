"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Bell, CheckCircle2, XCircle, X } from "lucide-react";
import clsx from "clsx";

type Tone = "info" | "success" | "warning" | "error";
interface ToastItem {
  id: number;
  title: string;
  body?: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}
interface ToastApi {
  show: (t: Omit<ToastItem, "id" | "tone"> & { tone?: Tone; duration?: number }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
};

const ICONS = { info: Bell, success: CheckCircle2, warning: AlertTriangle, error: XCircle };
const COLORS = { info: "text-accent", success: "text-success", warning: "text-warning", error: "text-danger" };

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = useCallback<ToastApi["show"]>(
    ({ duration = 4500, tone = "info", ...t }) => {
      const id = nextId++;
      setItems((xs) => [...xs.slice(-3), { ...t, tone, id }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const Icon = ICONS[t.tone];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.15 } }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-pop"
                role="status"
              >
                <Icon className={clsx("mt-0.5 size-[18px] shrink-0", COLORS[t.tone])} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{t.title}</p>
                  {t.body && <p className="mt-0.5 truncate text-[13px] text-muted">{t.body}</p>}
                </div>
                {t.action && (
                  <button
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                    className="text-sm font-semibold text-accent hover:underline"
                  >
                    {t.action.label}
                  </button>
                )}
                <button onClick={() => dismiss(t.id)} className="text-muted hover:text-ink" aria-label="Dismiss">
                  <X className="size-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
