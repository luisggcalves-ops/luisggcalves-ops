"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { stockMovementAction } from "@/app/actions/finance";

export function StockForm({ productId }: { productId: string }) {
  const { state, onSubmit, pending, fieldErrors: fe } = useFormAction(stockMovementAction);
  const [type, setType] = useState("purchase");
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="productId" value={productId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="What happened" htmlFor="s-type">
          <Select id="s-type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="purchase">Delivery received</option>
            <option value="usage">Used in the shop</option>
            <option value="adjustment">Stock count correction</option>
          </Select>
        </Field>
        <Field
          label="Quantity"
          htmlFor="s-qty"
          error={fe.quantity}
          hint={type === "adjustment" ? "Use a negative number to remove" : undefined}
        >
          <Input id="s-qty" name="quantity" type="number" required min={type === "adjustment" ? -10000 : 1} />
        </Field>
        {type === "purchase" ? (
          <Field label="Cost per unit (optional)" htmlFor="s-cost" error={fe.unitCost}>
            <Input id="s-cost" name="unitCost" inputMode="decimal" placeholder="Same as before" />
          </Field>
        ) : (
          <Field label="Note (optional)" htmlFor="s-note">
            <Input id="s-note" name="note" maxLength={200} />
          </Field>
        )}
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} variant="secondary" className="self-end">
        Update stock
      </SubmitButton>
    </form>
  );
}
