"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSlotsAction } from "@/app/actions/appointments";
import { cn } from "@/lib/cn";

type Load = { key: string; slots: string[]; error: string | null };

/**
 * Shows the free start times for a barber, service and date, and lets staff
 * type any other time (validated on the server).
 */
export function SlotPicker({
  staffMemberId,
  serviceId,
  date,
  excludeAppointmentId,
  value,
  onChange,
  error,
}: {
  staffMemberId: string;
  serviceId: string;
  date: string;
  excludeAppointmentId?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const key = `${staffMemberId}|${serviceId}|${date}|${excludeAppointmentId ?? ""}`;
  const ready = Boolean(staffMemberId && serviceId && date);
  const [load, setLoad] = useState<Load | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    getSlotsAction({ staffMemberId, serviceId, date, excludeAppointmentId }).then((res) => {
      if (cancelled) return;
      setLoad("error" in res ? { key, slots: [], error: res.error } : { key, slots: res.slots, error: null });
    });
    return () => {
      cancelled = true;
    };
  }, [key, ready, staffMemberId, serviceId, date, excludeAppointmentId]);

  const current = load?.key === key ? load : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">Time</span>
        <input
          type="time"
          step={300}
          name="time"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Start time"
          aria-invalid={!!error}
          className="h-8 rounded-lg border border-border-strong bg-surface px-2 text-sm tabular focus:border-fg focus:outline-none aria-[invalid=true]:border-danger"
        />
      </div>
      {!ready ? (
        <p className="text-[13px] text-fg-muted">Choose a barber, service and date to see free times.</p>
      ) : !current ? (
        <p className="flex items-center gap-2 text-[13px] text-fg-muted">
          <Loader2 className="size-3.5 animate-spin" /> Loading free times…
        </p>
      ) : current.error ? (
        <p className="text-[13px] text-danger">{current.error}</p>
      ) : current.slots.length === 0 ? (
        <p className="text-[13px] text-fg-muted">No free times on this day. Pick another date or type a time.</p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6" role="listbox" aria-label="Free times">
          {current.slots.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={value === s}
              onClick={() => onChange(s)}
              className={cn(
                "h-8 rounded-lg border text-[13px] tabular transition-colors",
                value === s
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-border-strong bg-surface hover:border-fg",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
