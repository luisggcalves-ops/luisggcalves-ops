"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { voidPaymentAction } from "@/app/actions/finance";

/** Void with a mandatory reason. The ledger keeps the original and its reversals. */
export function VoidPaymentButton({ paymentId }: { paymentId: string }) {
  const { state, onSubmit, pending, fieldErrors } = useFormAction(voidPaymentAction);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="self-start">
          Void payment
        </Button>
        <FormMessage state={state} />
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <input type="hidden" name="paymentId" value={paymentId} />
      <Field label="Why is it being voided?" htmlFor={`void-${paymentId}`} error={fieldErrors.reason}>
        <Input id={`void-${paymentId}`} name="reason" required placeholder="e.g. Charged the wrong amount" />
      </Field>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Keep it
        </Button>
        <SubmitButton variant="danger" size="sm" pending={pending}>
          Void payment
        </SubmitButton>
      </div>
    </form>
  );
}
