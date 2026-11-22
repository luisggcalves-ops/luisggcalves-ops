"use client";

import { useMemo, useState } from "react";
import { Banknote, CreditCard, Landmark, MoreHorizontal, Plus, X } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { recordPaymentAction } from "@/app/actions/finance";
import { formatMoney, parseMoneyToCents, centsToInput } from "@/lib/money";
import { cn } from "@/lib/cn";

type Product = { id: string; name: string; priceCents: number; stockQty: number };
type Line = {
  key: string;
  kind: "service" | "product";
  serviceId?: string;
  productId?: string;
  description: string;
  quantity: number;
  price: string;
  staffMemberId?: string;
};

const METHODS = [
  { value: "card", label: "Card", icon: CreditCard },
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "transfer", label: "Transfer", icon: Landmark },
  { value: "other", label: "Other", icon: MoreHorizontal },
] as const;

let seq = 0;
const key = () => `l${++seq}`;

/**
 * Takes a payment: the appointment's service (price editable for discounts),
 * optional products, an optional tip and the payment method. A random
 * idempotency key means a double tap records only one payment.
 */
export function PaymentForm({
  appointmentId,
  serviceLine,
  products,
  staff,
  canChooseStaff,
  defaultStaffId,
  currency,
  submitLabel = "Record payment",
}: {
  appointmentId?: string;
  serviceLine?: { serviceId: string; description: string; priceCents: number; staffMemberId: string };
  products: Product[];
  staff: { id: string; displayName: string }[];
  canChooseStaff: boolean;
  defaultStaffId?: string;
  currency: string;
  submitLabel?: string;
}) {
  const { state, onSubmit, pending } = useFormAction(recordPaymentAction);
  const initialLines = (): Line[] =>
    serviceLine
      ? [{ key: key(), kind: "service", serviceId: serviceLine.serviceId, description: serviceLine.description, quantity: 1, price: centsToInput(serviceLine.priceCents), staffMemberId: serviceLine.staffMemberId }]
      : [];
  const [lines, setLines] = useState<Line[]>(initialLines);
  const [method, setMethod] = useState<string>("card");
  const [tip, setTip] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  // A standalone sale form resets after each successful sale (adjusting state when the result changes).
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.status === "success" && !appointmentId) {
      setLines(initialLines());
      setTip("");
      setIdempotencyKey(crypto.randomUUID());
    }
  }

  const totals = useMemo(() => {
    let subtotal = 0;
    let valid = lines.length > 0;
    for (const l of lines) {
      const c = parseMoneyToCents(l.price);
      if (c === null) valid = false;
      else subtotal += c * l.quantity;
    }
    const tipCents = tip ? parseMoneyToCents(tip) : 0;
    if (tipCents === null) valid = false;
    return { subtotal, tip: tipCents ?? 0, total: subtotal + (tipCents ?? 0), valid };
  }, [lines, tip]);

  const update = (k: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const payload = JSON.stringify(
    lines.map((l) => ({
      kind: l.kind,
      serviceId: l.serviceId ?? null,
      productId: l.productId ?? null,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.price,
      staffMemberId: l.staffMemberId || defaultStaffId || null,
    })),
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {appointmentId ? <input type="hidden" name="appointmentId" value={appointmentId} /> : null}
      <input type="hidden" name="items" value={payload} />
      <input type="hidden" name="method" value={method} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <ul className="flex flex-col gap-2">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm">{l.description}</span>
            {l.kind === "product" ? (
              <select
                aria-label={`Quantity of ${l.description}`}
                value={l.quantity}
                onChange={(e) => update(l.key, { quantity: Number(e.target.value) })}
                className="h-8 shrink-0 rounded-md border border-border-strong bg-surface px-1 text-[13px]"
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((q) => (
                  <option key={q} value={q}>
                    ×{q}
                  </option>
                ))}
              </select>
            ) : null}
            {canChooseStaff && l.kind === "product" ? (
              <select
                aria-label={`Who sold ${l.description}`}
                value={l.staffMemberId ?? ""}
                onChange={(e) => update(l.key, { staffMemberId: e.target.value || undefined })}
                className="h-8 w-28 shrink-0 rounded-md border border-border-strong bg-surface px-1 text-[13px]"
              >
                <option value="">No barber</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="w-20 shrink-0">
              <Input
                aria-label={`Price of ${l.description}`}
                inputMode="decimal"
                value={l.price}
                onChange={(e) => update(l.key, { price: e.target.value })}
                className="h-8 px-2 text-right tabular"
              />
            </div>
            {l.kind === "product" || !serviceLine ? (
              <button
                type="button"
                onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface-muted"
                aria-label={`Remove ${l.description}`}
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {products.length ? (
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-fg-muted" aria-hidden />
          <Select
            aria-label="Add a product"
            value=""
            onChange={(e) => {
              const p = products.find((x) => x.id === e.target.value);
              if (p) {
                setLines((ls) => [
                  ...ls,
                  { key: key(), kind: "product", productId: p.id, description: p.name, quantity: 1, price: centsToInput(p.priceCents), staffMemberId: defaultStaffId },
                ]);
              }
            }}
            className="h-9 text-[13px]"
          >
            <option value="">Add a product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id} disabled={p.stockQty <= 0}>
                {p.name} · {formatMoney(p.priceCents, currency)} {p.stockQty <= 0 ? "(out of stock)" : `(${p.stockQty} in stock)`}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Payment method">
        {METHODS.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={method === m.value}
            onClick={() => setMethod(m.value)}
            className={cn(
              "flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[12px] transition-colors",
              method === m.value ? "border-primary bg-primary text-primary-fg" : "border-border-strong bg-surface hover:border-fg",
            )}
          >
            <m.icon className="size-4" aria-hidden />
            {m.label}
          </button>
        ))}
      </div>

      <Field label="Tip (optional)" htmlFor="tip" hint="Tips go to the barber and aren't counted as shop revenue.">
        <Input id="tip" name="tip" inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} placeholder="0.00" className="tabular" />
      </Field>

      <div className="flex items-baseline justify-between border-t border-border pt-3">
        <span className="text-sm text-fg-muted">Total</span>
        <span className="text-2xl font-semibold tracking-tight tabular" data-testid="payment-total">
          {totals.valid ? formatMoney(totals.total, currency) : "–"}
        </span>
      </div>
      <FormMessage state={state} />
      <SubmitButton size="lg" pending={pending} disabled={!totals.valid} pendingLabel="Recording…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
