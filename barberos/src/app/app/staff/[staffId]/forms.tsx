"use client";

import { useState } from "react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { OpeningHoursEditor } from "@/components/shop/opening-hours-editor";
import { ColorPicker } from "@/components/shop/color-picker";
import type { OpeningInterval } from "@/lib/validation/shop";
import { centsToInput, formatMoney } from "@/lib/money";
import {
  addTimeOffAction,
  replaceWorkingHoursAction,
  setStaffServicesAction,
  updateStaffProfileAction,
} from "../actions";

export function ProfileForm({
  staffMemberId,
  defaults,
}: {
  staffMemberId: string;
  defaults: { displayName: string; bio: string; calendarColor: string; isBookable: boolean };
}) {
  const { state, onSubmit, pending, fieldErrors: fe } = useFormAction(updateStaffProfileAction);
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="staffMemberId" value={staffMemberId} />
      <Card>
        <CardHeader title="Profile" />
        <CardBody className="flex flex-col gap-4">
          <Field label="Name on the calendar" htmlFor="displayName" error={fe.displayName}>
            <Input id="displayName" name="displayName" defaultValue={defaults.displayName} required aria-invalid={!!fe.displayName} />
          </Field>
          <Field label="Short bio (optional)" htmlFor="bio" hint="Shown on the booking page." error={fe.bio}>
            <Textarea id="bio" name="bio" defaultValue={defaults.bio} rows={2} className="min-h-0" maxLength={300} />
          </Field>
          <ColorPicker name="calendarColor" defaultValue={defaults.calendarColor} />
          <label className="flex items-start gap-3">
            <Checkbox name="isBookable" defaultChecked={defaults.isBookable} className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Customers can book online</span>
              <span className="block text-[13px] text-fg-muted">Staff can still book them from the calendar.</span>
            </span>
          </label>
        </CardBody>
        <CardFooter className="justify-between">
          <FormMessage state={state} className="py-1" />
          <SubmitButton pending={pending} className="ml-auto">
            Save profile
          </SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}

export function WorkingHoursForm({ staffMemberId, hours }: { staffMemberId: string; hours: OpeningInterval[] }) {
  const { state, onSubmit, pending } = useFormAction(replaceWorkingHoursAction);
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="staffMemberId" value={staffMemberId} />
      <Card>
        <CardHeader title="Working hours" description="Bookable time is where these overlap the shop's opening hours." />
        <CardBody>
          <OpeningHoursEditor name="workingHours" defaultValue={hours} />
        </CardBody>
        <CardFooter className="justify-between">
          <FormMessage state={state} className="py-1" />
          <SubmitButton pending={pending} className="ml-auto">
            Save hours
          </SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}

type ServiceRow = {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  offered: boolean;
  priceCentsOverride: number | null;
  durationMinOverride: number | null;
};

export function ServicesForm({ staffMemberId, services, currency }: { staffMemberId: string; services: ServiceRow[]; currency: string }) {
  const { state, onSubmit, pending } = useFormAction(setStaffServicesAction);
  const [offered, setOffered] = useState(() => new Set(services.filter((s) => s.offered).map((s) => s.id)));
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="staffMemberId" value={staffMemberId} />
      <Card>
        <CardHeader title="Services" description="What this barber offers. Leave price or duration empty to use the shop's standard." />
        {services.length ? (
          <ul className="divide-y divide-border">
            {services.map((s) => {
              const on = offered.has(s.id);
              return (
                <li key={s.id} className="grid gap-3 px-5 py-3 sm:grid-cols-[1fr_110px_110px] sm:items-center">
                  <label className="flex items-center gap-3 text-sm">
                    <Checkbox
                      name="serviceIds"
                      value={s.id}
                      checked={on}
                      onChange={(e) =>
                        setOffered((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(s.id);
                          else next.delete(s.id);
                          return next;
                        })
                      }
                    />
                    <span>
                      <span className="block font-medium">{s.name}</span>
                      <span className="block text-[12px] text-fg-muted">
                        Standard: {s.durationMin} min · {formatMoney(s.priceCents, currency)}
                      </span>
                    </span>
                  </label>
                  <Input
                    name={`price:${s.id}`}
                    inputMode="decimal"
                    placeholder={centsToInput(s.priceCents)}
                    defaultValue={s.priceCentsOverride !== null ? centsToInput(s.priceCentsOverride) : ""}
                    disabled={!on}
                    aria-label={`${s.name} price for this barber`}
                    className="h-9"
                  />
                  <Input
                    name={`duration:${s.id}`}
                    type="number"
                    min={5}
                    max={480}
                    step={5}
                    placeholder={`${s.durationMin} min`}
                    defaultValue={s.durationMinOverride ?? ""}
                    disabled={!on}
                    aria-label={`${s.name} duration for this barber`}
                    className="h-9"
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-fg-muted">No services yet. Add them in Settings → Services.</p>
        )}
        <CardFooter className="justify-between">
          <FormMessage state={state} className="py-1" />
          <SubmitButton pending={pending} className="ml-auto" disabled={!services.length}>
            Save services
          </SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}

export function TimeOffForm({ staffMemberId, today }: { staffMemberId: string; today: string }) {
  const { state, onSubmit, pending, fieldErrors: fe } = useFormAction(addTimeOffAction);
  const [allDay, setAllDay] = useState(true);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="staffMemberId" value={staffMemberId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From" htmlFor="to-start" error={fe.startsOn}>
          <Input id="to-start" name="startsOn" type="date" min={today} required />
        </Field>
        <Field label="Until (inclusive)" htmlFor="to-end" error={fe.endsOn}>
          <Input id="to-end" name="endsOn" type="date" min={today} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <Checkbox name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
      </label>
      {!allDay ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start time" htmlFor="to-st" error={fe.startTime}>
            <Input id="to-st" name="startTime" type="time" step={900} required />
          </Field>
          <Field label="End time" htmlFor="to-et" error={fe.endTime}>
            <Input id="to-et" name="endTime" type="time" step={900} required />
          </Field>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <Field label="Type" htmlFor="to-type">
          <Select id="to-type" name="type" defaultValue="holiday">
            <option value="holiday">Holiday</option>
            <option value="sick">Sick</option>
            <option value="personal">Personal</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Note (optional)" htmlFor="to-note">
          <Input id="to-note" name="note" maxLength={200} />
        </Field>
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} variant="secondary" className="self-end">
        Add time off
      </SubmitButton>
    </form>
  );
}
