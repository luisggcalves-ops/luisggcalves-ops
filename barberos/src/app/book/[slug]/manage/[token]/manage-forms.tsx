"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { cancelBookingAction, rescheduleBookingAction } from "../../actions";
import { cn } from "@/lib/cn";

export function CancelBooking({ token }: { token: string }) {
  const { state, onSubmit, pending } = useFormAction(cancelBookingAction);
  const [confirming, setConfirming] = useState(false);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <input type="hidden" name="token" value={token} />
          <p className="text-sm">Cancel this booking?</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)} className="flex-1">
              Keep it
            </Button>
            <SubmitButton variant="danger" pending={pending} className="flex-1">
              Yes, cancel
            </SubmitButton>
          </div>
        </form>
      ) : (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Cancel booking
        </Button>
      )}
      <FormMessage state={state} />
    </div>
  );
}

export function RescheduleBooking({ token, slug, days }: { token: string; slug: string; days: { date: string; label: string; times: string[] }[] }) {
  const { state, onSubmit, pending } = useFormAction(rescheduleBookingAction);
  const [open, setOpen] = useState(false);
  const firstWithTimes = days.find((d) => d.times.length)?.date ?? days[0]?.date;
  const [date, setDate] = useState(firstWithTimes);
  const [time, setTime] = useState<string | null>(null);
  const current = days.find((d) => d.date === date);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Change date or time
      </Button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="date" value={date ?? ""} />
      <input type="hidden" name="time" value={time ?? ""} />
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex gap-2">
          {days.map((d) => (
            <button
              key={d.date}
              type="button"
              disabled={!d.times.length}
              onClick={() => {
                setDate(d.date);
                setTime(null);
              }}
              className={cn(
                "w-16 shrink-0 rounded-xl border py-2 text-[12px] disabled:opacity-40",
                d.date === date ? "border-primary bg-primary text-primary-fg" : "border-border hover:border-fg",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2" role="listbox" aria-label="New time">
        {current?.times.map((t) => (
          <button
            key={t}
            type="button"
            role="option"
            aria-selected={time === t}
            onClick={() => setTime(t)}
            className={cn(
              "h-10 rounded-xl border text-sm tabular",
              time === t ? "border-primary bg-primary text-primary-fg" : "border-border hover:border-fg",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)} className="flex-1">
          Close
        </Button>
        <SubmitButton pending={pending} disabled={!time} className="flex-1">
          Move booking
        </SubmitButton>
      </div>
    </form>
  );
}
