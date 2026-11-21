"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { createAppointmentAction } from "@/app/actions/appointments";
import { formatMoney } from "@/lib/money";
import { SlotPicker } from "./slot-picker";
import { CustomerPicker } from "./customer-picker";

export type BookingOptions = {
  staff: { id: string; displayName: string }[];
  offers: { staffMemberId: string; serviceId: string; name: string; durationMin: number; priceCents: number }[];
  canManageAll: boolean;
};

export function NewAppointmentForm({
  options,
  currency,
  defaults,
  successHref,
}: {
  options: BookingOptions;
  currency: string;
  defaults: { staffMemberId?: string; date: string; time?: string };
  /** Where to go after booking. `{id}` is replaced with the new appointment's id. */
  successHref: string;
}) {
  const router = useRouter();
  const { state, onSubmit, pending, fieldErrors } = useFormAction(createAppointmentAction);
  const [staffMemberId, setStaffMemberId] = useState(defaults.staffMemberId ?? options.staff[0]?.id ?? "");
  const offers = useMemo(() => options.offers.filter((o) => o.staffMemberId === staffMemberId), [options.offers, staffMemberId]);
  const [serviceId, setServiceId] = useState(offers[0]?.serviceId ?? "");
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time ?? "");

  // Keep the service valid when the barber changes.
  const effectiveServiceId = offers.some((o) => o.serviceId === serviceId) ? serviceId : (offers[0]?.serviceId ?? "");

  useEffect(() => {
    if (state.status === "success" && state.data?.appointmentId) {
      router.push(successHref.replace("{id}", String(state.data.appointmentId)));
    }
  }, [state, router, successHref]);

  if (!options.staff.length) {
    return <p className="text-sm text-fg-muted">There are no active barbers yet. Add a barber profile in Staff first.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Barber" htmlFor="staffMemberId" error={fieldErrors.staffMemberId}>
          <Select
            id="staffMemberId"
            name="staffMemberId"
            value={staffMemberId}
            onChange={(e) => setStaffMemberId(e.target.value)}
            disabled={!options.canManageAll && options.staff.length === 1}
          >
            {options.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </Select>
          {!options.canManageAll && options.staff.length === 1 ? <input type="hidden" name="staffMemberId" value={staffMemberId} /> : null}
        </Field>
        <Field label="Service" htmlFor="serviceId" error={fieldErrors.serviceId}>
          {offers.length ? (
            <Select id="serviceId" name="serviceId" value={effectiveServiceId} onChange={(e) => setServiceId(e.target.value)}>
              {offers.map((o) => (
                <option key={o.serviceId} value={o.serviceId}>
                  {o.name} · {o.durationMin} min · {formatMoney(o.priceCents, currency)}
                </option>
              ))}
            </Select>
          ) : (
            <p className="flex h-10 items-center text-[13px] text-fg-muted">This barber has no services yet.</p>
          )}
        </Field>
      </div>

      <Field label="Date" htmlFor="date" error={fieldErrors.date}>
        <Input id="date" name="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <SlotPicker
        staffMemberId={staffMemberId}
        serviceId={effectiveServiceId}
        date={date}
        value={time}
        onChange={setTime}
        error={fieldErrors.time}
      />

      <CustomerPicker fieldErrors={fieldErrors} />

      <Field label="Internal note (optional)" htmlFor="internalNote" hint="Only staff can see this.">
        <Textarea id="internalNote" name="internalNote" rows={2} className="min-h-0" maxLength={1000} />
      </Field>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox name="walkIn" /> Walk-in customer
        </label>
        {options.canManageAll ? (
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox name="allowOutsideHours" /> Book outside working hours
          </label>
        ) : null}
      </div>

      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Booking…" disabled={!offers.length} size="lg">
        Book appointment
      </SubmitButton>
    </form>
  );
}
