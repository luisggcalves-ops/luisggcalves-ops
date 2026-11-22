"use client";

import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { createExpenseAction } from "@/app/actions/finance";
import { EXPENSE_CATEGORIES } from "@/lib/validation/finance";

export function ExpenseForm({ today }: { today: string }) {
  const { state, onSubmit, pending, fieldErrors: fe } = useFormAction(createExpenseAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" htmlFor="ex-cat">
          <Select id="ex-cat" name="category" defaultValue="rent">
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" htmlFor="ex-amount" error={fe.amount}>
          <Input id="ex-amount" name="amount" inputMode="decimal" required placeholder="0.00" aria-invalid={!!fe.amount} />
        </Field>
        <Field label="Date" htmlFor="ex-date" error={fe.incurredOn}>
          <Input id="ex-date" name="incurredOn" type="date" defaultValue={today} required />
        </Field>
        <Field label="Supplier (optional)" htmlFor="ex-vendor">
          <Input id="ex-vendor" name="vendor" maxLength={80} />
        </Field>
        <Field label="Description (optional)" htmlFor="ex-desc" className="sm:col-span-2">
          <Input id="ex-desc" name="description" maxLength={200} />
        </Field>
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="self-end">
        Add expense
      </SubmitButton>
    </form>
  );
}
