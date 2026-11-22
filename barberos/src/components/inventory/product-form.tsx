"use client";

import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { createProductAction, updateProductAction } from "@/app/actions/finance";

export type ProductDefaults = { name: string; sku: string; category: string; kind: string; cost: string; price: string; lowStockThreshold: number };

export function ProductForm({ productId, defaults }: { productId?: string; defaults?: ProductDefaults }) {
  const { state, onSubmit, pending, fieldErrors: fe } = useFormAction(productId ? updateProductAction : createProductAction);
  const d = defaults ?? { name: "", sku: "", category: "", kind: "retail", cost: "", price: "", lowStockThreshold: 2 };
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {productId ? <input type="hidden" name="productId" value={productId} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="p-name" error={fe.name} className="sm:col-span-2">
          <Input id="p-name" name="name" defaultValue={d.name} required placeholder="e.g. Matte clay 100ml" aria-invalid={!!fe.name} />
        </Field>
        <Field label="Use" htmlFor="p-kind">
          <Select id="p-kind" name="kind" defaultValue={d.kind}>
            <option value="retail">Sold to customers</option>
            <option value="consumable">Used in the shop</option>
            <option value="both">Both</option>
          </Select>
        </Field>
        <Field label="Category (optional)" htmlFor="p-cat">
          <Input id="p-cat" name="category" defaultValue={d.category} placeholder="Styling, Shampoo, Blades…" />
        </Field>
        <Field label="Cost price" htmlFor="p-cost" error={fe.cost} hint="What you pay per unit">
          <Input id="p-cost" name="cost" inputMode="decimal" defaultValue={d.cost} placeholder="0.00" />
        </Field>
        <Field label="Selling price" htmlFor="p-price" error={fe.price}>
          <Input id="p-price" name="price" inputMode="decimal" defaultValue={d.price} placeholder="0.00" />
        </Field>
        <Field label="Low-stock alert at" htmlFor="p-low" hint="0 = no alert">
          <Input id="p-low" name="lowStockThreshold" type="number" min={0} defaultValue={d.lowStockThreshold} />
        </Field>
        {productId ? (
          <Field label="SKU (optional)" htmlFor="p-sku">
            <Input id="p-sku" name="sku" defaultValue={d.sku} />
          </Field>
        ) : (
          <Field label="Opening stock" htmlFor="p-stock">
            <Input id="p-stock" name="initialStock" type="number" min={0} defaultValue={0} />
          </Field>
        )}
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="self-end">
        {productId ? "Save product" : "Add product"}
      </SubmitButton>
    </form>
  );
}
