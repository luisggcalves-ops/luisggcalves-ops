"use client";

import { useEffect, useRef } from "react";
import { Select, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { addNoteAction } from "@/app/actions/customers";

export function AddNoteForm({ customerId, appointmentId }: { customerId: string; appointmentId?: string }) {
  const { state, onSubmit, pending } = useFormAction(addNoteAction);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} onSubmit={onSubmit} className="flex flex-col gap-2">
      <input type="hidden" name="customerId" value={customerId} />
      {appointmentId ? <input type="hidden" name="appointmentId" value={appointmentId} /> : null}
      <Textarea
        name="body"
        rows={2}
        className="min-h-0"
        maxLength={2000}
        required
        placeholder="e.g. Skin fade, #1 on the sides, 3cm on top, beard lined up"
        aria-label="New note"
      />
      <div className="flex items-center gap-2">
        <Select name="kind" defaultValue="haircut" aria-label="Note type" className="h-8 w-32 text-[13px]">
          <option value="haircut">Haircut</option>
          <option value="general">General</option>
        </Select>
        <FormMessage state={state} className="py-1" />
        <SubmitButton size="sm" variant="secondary" pending={pending} className="ml-auto">
          Add note
        </SubmitButton>
      </div>
    </form>
  );
}
