"use client";

import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { createStaffProfileAction } from "./actions";

export function AddBarberForm({ members }: { members: { membershipId: string; name: string }[] }) {
  const { state, onSubmit, pending, fieldErrors: fe } = useFormAction(createStaffProfileAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Name on the calendar" htmlFor="new-barber-name" error={fe.displayName}>
          <Input id="new-barber-name" name="displayName" required placeholder="e.g. Miguel" aria-invalid={!!fe.displayName} />
        </Field>
        <Field label="Signs in as" htmlFor="new-barber-member" hint="Optional. Leave empty for barbers who don't use the app.">
          <Select id="new-barber-member" name="membershipId" defaultValue="">
            <option value="">No login</option>
            {members.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton pending={pending} variant="secondary" className="sm:mb-[22px]">
          Add barber
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
