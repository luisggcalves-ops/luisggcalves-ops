"use client";

import { Field, Input } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { addClosureAction } from "../actions";

export function ClosureForm({ today }: { today: string }) {
  const { state, onSubmit, pending, fieldErrors: fe } = useFormAction(addClosureAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
        <Field label="From" htmlFor="cl-start" error={fe.startsOn}>
          <Input id="cl-start" name="startsOn" type="date" min={today} required />
        </Field>
        <Field label="Until (inclusive)" htmlFor="cl-end" error={fe.endsOn}>
          <Input id="cl-end" name="endsOn" type="date" min={today} />
        </Field>
        <Field label="Reason (optional)" htmlFor="cl-reason">
          <Input id="cl-reason" name="reason" placeholder="e.g. Christmas" maxLength={120} />
        </Field>
        <SubmitButton pending={pending} variant="secondary">
          Add closure
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
