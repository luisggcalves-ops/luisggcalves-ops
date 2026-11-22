"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { setCommissionRuleAction } from "@/app/actions/finance";

export function CommissionRuleForm({ staff, services }: { staff: { id: string; name: string }[]; services: { id: string; name: string }[] }) {
  const { state, onSubmit, pending, fieldErrors: fe } = useFormAction(setCommissionRuleAction);
  const [appliesTo, setAppliesTo] = useState("services");
  const [type, setType] = useState("percent");
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Applies to" htmlFor="cr-applies">
          <Select id="cr-applies" name="appliesTo" value={appliesTo} onChange={(e) => setAppliesTo(e.target.value)}>
            <option value="services">Services</option>
            <option value="products">Product sales</option>
          </Select>
        </Field>
        <Field label="Barber" htmlFor="cr-staff" hint="Empty = everyone">
          <Select id="cr-staff" name="staffMemberId" defaultValue="">
            <option value="">All barbers</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        {appliesTo === "services" ? (
          <Field label="Service" htmlFor="cr-service" hint="Empty = every service" error={fe.serviceId}>
            <Select id="cr-service" name="serviceId" defaultValue="">
              <option value="">All services</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Type" htmlFor="cr-type">
          <Select id="cr-type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="percent">Percentage of the price</option>
            <option value="fixed">Fixed amount per item</option>
          </Select>
        </Field>
        {type === "percent" ? (
          <Field label="Percentage" htmlFor="cr-percent" error={fe.percent}>
            <Input id="cr-percent" name="percent" type="number" min={0} max={100} step={0.5} required placeholder="40" />
          </Field>
        ) : (
          <Field label="Amount" htmlFor="cr-amount" error={fe.amount}>
            <Input id="cr-amount" name="amount" inputMode="decimal" required placeholder="6.00" />
          </Field>
        )}
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="self-end">
        Save rule
      </SubmitButton>
    </form>
  );
}
