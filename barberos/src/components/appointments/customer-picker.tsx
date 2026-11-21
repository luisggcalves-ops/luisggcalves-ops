"use client";

import { useEffect, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { searchCustomersAction } from "@/app/actions/appointments";
import { Field, Input } from "@/components/ui/field";

type Customer = { id: string; fullName: string; phone: string; email: string | null; visitCount: number };

/** Find an existing customer by name, phone or email, or add a new one inline. */
export function CustomerPicker({ fieldErrors }: { fieldErrors: Record<string, string> }) {
  const [mode, setMode] = useState<"search" | "new">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);

  useEffect(() => {
    if (mode !== "search" || selected || query.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      searchCustomersAction(query).then((rows) => {
        if (!cancelled) setResults(rows);
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, mode, selected]);

  const error = fieldErrors.customer ?? fieldErrors["newCustomer.fullName"] ?? fieldErrors["newCustomer.phone"];

  if (selected) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Customer</span>
        <input type="hidden" name="customerId" value={selected.id} />
        <div className="flex items-center gap-3 rounded-lg border border-border-strong bg-surface px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{selected.fullName}</span>
            <span className="block truncate text-[12px] text-fg-muted">
              {[selected.phone, selected.visitCount ? `${selected.visitCount} visit${selected.visitCount > 1 ? "s" : ""}` : "New customer"]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface-muted"
            aria-label="Change customer"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  if (mode === "new") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium">New customer</span>
          <button type="button" onClick={() => setMode("search")} className="text-[13px] text-fg-muted hover:text-fg">
            Search instead
          </button>
        </div>
        <Field label="Name" htmlFor="customerName" error={fieldErrors["newCustomer.fullName"]}>
          <Input id="customerName" name="customerName" required autoComplete="off" aria-invalid={!!fieldErrors["newCustomer.fullName"]} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone" htmlFor="customerPhone" error={fieldErrors["newCustomer.phone"]} hint="Used to recognise them next time.">
            <Input id="customerPhone" name="customerPhone" type="tel" autoComplete="off" aria-invalid={!!fieldErrors["newCustomer.phone"]} />
          </Field>
          <Field label="Email (optional)" htmlFor="customerEmail" error={fieldErrors["newCustomer.email"]}>
            <Input id="customerEmail" name="customerEmail" type="email" autoComplete="off" />
          </Field>
        </div>
      </div>
    );
  }

  const showResults = query.trim().length >= 2;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="customer-search" className="text-[13px] font-medium">
        Customer
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
        <Input
          id="customer-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone or email"
          autoComplete="off"
          className="pl-9"
          aria-invalid={!!error}
        />
      </div>
      {showResults ? (
        <ul className="overflow-hidden rounded-lg border border-border bg-surface shadow-pop" role="listbox" aria-label="Customers">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => setSelected(c)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-muted"
              >
                <span className="truncate text-sm">{c.fullName}</span>
                <span className="shrink-0 text-[12px] text-fg-muted">{c.phone}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setMode("new")}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm font-medium hover:bg-surface-muted"
            >
              <UserPlus className="size-4" /> Add “{query.trim()}” as a new customer
            </button>
          </li>
        </ul>
      ) : (
        <button type="button" onClick={() => setMode("new")} className="inline-flex items-center gap-1.5 self-start text-[13px] text-fg-muted hover:text-fg">
          <UserPlus className="size-3.5" /> New customer
        </button>
      )}
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
