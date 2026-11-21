"use client";

import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { updateCustomerAction } from "@/app/actions/customers";

export function EditCustomerForm({
  customerId,
  defaults,
  staff,
}: {
  customerId: string;
  defaults: { fullName: string; phone: string; email: string; preferredStaffMemberId: string; hairPreferences: string; marketingConsent: boolean };
  staff: { id: string; displayName: string }[];
}) {
  const { state, onSubmit, pending, fieldErrors: fe } = useFormAction(updateCustomerAction);
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="customerId" value={customerId} />
      <Card>
        <CardHeader title="Details & preferences" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="c-name" error={fe.fullName} className="sm:col-span-2">
            <Input id="c-name" name="fullName" defaultValue={defaults.fullName} required aria-invalid={!!fe.fullName} />
          </Field>
          <Field label="Phone" htmlFor="c-phone" error={fe.phone}>
            <Input id="c-phone" name="phone" type="tel" defaultValue={defaults.phone} aria-invalid={!!fe.phone} />
          </Field>
          <Field label="Email" htmlFor="c-email" error={fe.email}>
            <Input id="c-email" name="email" type="email" defaultValue={defaults.email} aria-invalid={!!fe.email} />
          </Field>
          <Field label="Preferred barber" htmlFor="c-pref" error={fe.preferredStaffMemberId}>
            <Select id="c-pref" name="preferredStaffMemberId" defaultValue={defaults.preferredStaffMemberId}>
              <option value="">No preference</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Hair preferences" htmlFor="c-hair" className="sm:col-span-2" hint="Standing preferences. Use notes for each visit.">
            <Textarea id="c-hair" name="hairPreferences" defaultValue={defaults.hairPreferences} rows={2} className="min-h-0" maxLength={1000} />
          </Field>
          <label className="flex items-start gap-3 sm:col-span-2">
            <Checkbox name="marketingConsent" defaultChecked={defaults.marketingConsent} className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Agreed to marketing messages</span>
              <span className="block text-[13px] text-fg-muted">Only tick this if the customer has said yes.</span>
            </span>
          </label>
        </CardBody>
        <CardFooter className="justify-between">
          <FormMessage state={state} className="py-1" />
          <SubmitButton pending={pending} className="ml-auto">
            Save
          </SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}
