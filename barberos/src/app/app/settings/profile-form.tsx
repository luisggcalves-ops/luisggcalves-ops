"use client";

import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { CURRENCIES } from "@/lib/validation/shop";
import { updateShopProfileAction } from "./actions";

export type ProfileDefaults = {
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  phone: string;
  email: string;
  addressLine: string;
  city: string;
  postalCode: string;
};

export function ShopProfileForm({ defaults, timeZones, disabled }: { defaults: ProfileDefaults; timeZones: string[]; disabled: boolean }) {
  const { state, onSubmit, pending, fieldErrors: fe } = useFormAction(updateShopProfileAction);
  return (
    <form onSubmit={onSubmit}>
      <fieldset disabled={disabled} className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Shop details" description="Shown on your booking page and confirmations." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Shop name" htmlFor="name" error={fe.name} className="sm:col-span-2">
              <Input id="name" name="name" defaultValue={defaults.name} required aria-invalid={!!fe.name} />
            </Field>
            <Field
              label="Booking link"
              htmlFor="slug"
              error={fe.slug}
              hint="Changing this breaks links you've already shared."
              className="sm:col-span-2"
            >
              <div className="flex items-center rounded-lg border border-border-strong bg-surface shadow-card focus-within:border-fg">
                <span className="pl-3 text-sm text-fg-subtle">/book/</span>
                <input
                  id="slug"
                  name="slug"
                  defaultValue={defaults.slug}
                  required
                  aria-invalid={!!fe.slug}
                  className="h-10 w-full rounded-r-lg bg-transparent pr-3 text-sm focus:outline-none"
                />
              </div>
            </Field>
            <Field label="Phone" htmlFor="phone" error={fe.phone}>
              <Input id="phone" name="phone" type="tel" defaultValue={defaults.phone} />
            </Field>
            <Field label="Email" htmlFor="email" error={fe.email}>
              <Input id="email" name="email" type="email" defaultValue={defaults.email} aria-invalid={!!fe.email} />
            </Field>
            <Field label="Address" htmlFor="addressLine" error={fe.addressLine} className="sm:col-span-2">
              <Input id="addressLine" name="addressLine" defaultValue={defaults.addressLine} autoComplete="street-address" />
            </Field>
            <Field label="City" htmlFor="city" error={fe.city}>
              <Input id="city" name="city" defaultValue={defaults.city} />
            </Field>
            <Field label="Postal code" htmlFor="postalCode" error={fe.postalCode}>
              <Input id="postalCode" name="postalCode" defaultValue={defaults.postalCode} />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Regional" description="Used for all times, prices and reports." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Time zone" htmlFor="timezone" error={fe.timezone}>
              <Select id="timezone" name="timezone" defaultValue={defaults.timezone}>
                {timeZones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Currency" htmlFor="currency" error={fe.currency}>
              <Select id="currency" name="currency" defaultValue={defaults.currency}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
          <CardFooter className="justify-between">
            <FormMessage state={state} className="py-1" />
            <SubmitButton pending={pending} className="ml-auto">
              Save changes
            </SubmitButton>
          </CardFooter>
        </Card>
      </fieldset>
    </form>
  );
}
