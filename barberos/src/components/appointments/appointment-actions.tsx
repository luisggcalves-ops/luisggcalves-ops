"use client";

import { useState } from "react";
import { Check, CheckCheck, UserX, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { changeStatusAction, rescheduleAction, updateNotesAction } from "@/app/actions/appointments";
import { SlotPicker } from "./slot-picker";

type Transition = "confirmed" | "completed" | "cancelled" | "no_show";

const BUTTONS: Record<Exclude<Transition, "cancelled">, { label: string; icon: typeof Check }> = {
  confirmed: { label: "Confirm", icon: Check },
  completed: { label: "Mark completed", icon: CheckCheck },
  no_show: { label: "No-show", icon: UserX },
};

/** Status buttons for the allowed transitions. Cancelling asks for an optional reason. */
export function StatusActions({
  appointmentId,
  version,
  allowed,
  started,
}: {
  appointmentId: string;
  version: number;
  allowed: Transition[];
  started: boolean;
}) {
  const { state, onSubmit, pending } = useFormAction(changeStatusAction);
  const [cancelling, setCancelling] = useState(false);
  const [to, setTo] = useState<Transition | null>(null);
  if (!allowed.length) return null;

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
        <input type="hidden" name="appointmentId" value={appointmentId} />
        <input type="hidden" name="version" value={version} />
        {(Object.keys(BUTTONS) as (keyof typeof BUTTONS)[])
          .filter((t) => allowed.includes(t))
          .map((t) => {
            const { label, icon: Icon } = BUTTONS[t];
            const needsStart = t === "completed" || t === "no_show";
            return (
              <SubmitButton
                key={t}
                name="to"
                value={t}
                variant={t === "completed" ? "primary" : "secondary"}
                size="sm"
                pending={pending && to === t}
                disabled={pending || (needsStart && !started)}
                title={needsStart && !started ? "Available once the appointment has started" : undefined}
                onClick={() => setTo(t)}
              >
                <Icon className="size-3.5" /> {label}
              </SubmitButton>
            );
          })}
        {allowed.includes("cancelled") && !cancelling ? (
          <Button variant="danger" size="sm" onClick={() => setCancelling(true)}>
            <XCircle className="size-3.5" /> Cancel
          </Button>
        ) : null}
      </form>
      {!started && (allowed.includes("completed") || allowed.includes("no_show")) ? (
        <p className="text-[12px] text-fg-subtle">“Completed” and “No-show” unlock when the appointment starts.</p>
      ) : null}
      {cancelling ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-lg border border-border p-3 animate-in">
          <input type="hidden" name="appointmentId" value={appointmentId} />
          <input type="hidden" name="version" value={version} />
          <Field label="Reason (optional)" htmlFor="cancel-reason">
            <Input id="cancel-reason" name="reason" placeholder="e.g. Customer called to cancel" maxLength={300} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCancelling(false)}>
              Keep appointment
            </Button>
            <SubmitButton variant="danger" size="sm" name="to" value="cancelled" pending={pending} onClick={() => setTo("cancelled")}>
              Cancel appointment
            </SubmitButton>
          </div>
        </form>
      ) : null}
      <FormMessage state={state} />
    </div>
  );
}

export function RescheduleForm({
  appointmentId,
  version,
  serviceId,
  staff,
  defaults,
  canManageAll,
}: {
  appointmentId: string;
  version: number;
  serviceId: string;
  staff: { id: string; displayName: string }[];
  defaults: { staffMemberId: string; date: string; time: string };
  canManageAll: boolean;
}) {
  const { state, onSubmit, pending, fieldErrors } = useFormAction(rescheduleAction);
  const [open, setOpen] = useState(false);
  const [staffMemberId, setStaffMemberId] = useState(defaults.staffMemberId);
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="secondary" size="sm" className="self-start" onClick={() => setOpen(true)}>
          Reschedule
        </Button>
        <FormMessage state={state} />
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        onSubmit(e);
      }}
      className="flex flex-col gap-3 rounded-lg border border-border p-3 animate-in"
    >
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="version" value={version} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Barber" htmlFor="rs-staff" error={fieldErrors.staffMemberId}>
          <Select id="rs-staff" name="staffMemberId" value={staffMemberId} onChange={(e) => setStaffMemberId(e.target.value)} disabled={!canManageAll}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </Select>
          {!canManageAll ? <input type="hidden" name="staffMemberId" value={staffMemberId} /> : null}
        </Field>
        <Field label="Date" htmlFor="rs-date" error={fieldErrors.date}>
          <Input id="rs-date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>
      <SlotPicker
        staffMemberId={staffMemberId}
        serviceId={serviceId}
        date={date}
        excludeAppointmentId={appointmentId}
        value={time}
        onChange={setTime}
        error={fieldErrors.time}
      />
      {canManageAll ? (
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox name="allowOutsideHours" /> Book outside working hours
        </label>
      ) : null}
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
        <SubmitButton size="sm" pending={pending}>
          Move appointment
        </SubmitButton>
      </div>
    </form>
  );
}

export function NotesForm({ appointmentId, note }: { appointmentId: string; note: string }) {
  const { state, onSubmit, pending } = useFormAction(updateNotesAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <Field label="Internal note" htmlFor="internalNote" hint="Only staff can see this.">
        <Textarea id="internalNote" name="internalNote" defaultValue={note} rows={3} className="min-h-0" maxLength={1000} />
      </Field>
      <div className="flex items-center justify-between gap-2">
        <FormMessage state={state} className="py-1" />
        <SubmitButton size="sm" variant="secondary" pending={pending} className="ml-auto">
          Save note
        </SubmitButton>
      </div>
    </form>
  );
}
