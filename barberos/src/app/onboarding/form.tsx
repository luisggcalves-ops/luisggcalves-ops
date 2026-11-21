"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { OpeningHoursEditor } from "@/components/shop/opening-hours-editor";
import { CURRENCIES, DEFAULT_CURRENCY, DEFAULT_OPENING_HOURS, DEFAULT_TIMEZONE, slugify } from "@/lib/validation/shop";
import { useFormAction } from "@/components/ui/use-form-action";
import { createShopAction } from "./actions";

export function CreateShopForm({ ownerName, timeZones }: { ownerName: string; timeZones: string[] }) {
  const { state, onSubmit, pending, fieldErrors: fe } = useFormAction(createShopAction);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
      <Card>
        <CardHeader title="Your shop" description="This is what customers will see." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Shop name" htmlFor="name" error={fe.name} className="sm:col-span-2">
            <Input
              id="name"
              name="name"
              required
              placeholder="e.g. Northside Barbers"
              value={name}
              aria-invalid={!!fe.name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field
            label="Booking link"
            htmlFor="slug"
            error={fe.slug}
            hint="Lowercase letters, numbers and dashes."
            className="sm:col-span-2"
          >
            <div className="flex items-center rounded-lg border border-border-strong bg-surface shadow-card focus-within:border-fg">
              <span className="pl-3 text-sm text-fg-subtle">/book/</span>
              <input
                id="slug"
                name="slug"
                required
                value={slug}
                aria-invalid={!!fe.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                className="h-10 w-full rounded-r-lg bg-transparent pr-3 text-sm focus:outline-none"
              />
            </div>
          </Field>
          <Field label="Time zone" htmlFor="timezone" error={fe.timezone}>
            <Select id="timezone" name="timezone" defaultValue={DEFAULT_TIMEZONE}>
              {timeZones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Currency" htmlFor="currency" error={fe.currency}>
            <Select id="currency" name="currency" defaultValue={DEFAULT_CURRENCY}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Phone (optional)" htmlFor="phone" error={fe.phone} className="sm:col-span-2">
            <Input id="phone" name="phone" type="tel" autoComplete="tel" />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Opening hours" description="When the shop is open. Each barber's own hours come later." />
        <CardBody>
          <OpeningHoursEditor name="openingHours" defaultValue={DEFAULT_OPENING_HOURS} />
          {fe.openingHours || Object.keys(fe).some((k) => /^openingHours\./.test(k)) ? (
            <p role="alert" className="mt-2 text-[13px] text-danger">
              {fe.openingHours ?? "Please check the opening hours."}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox name="ownerIsBarber" defaultChecked className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">I cut hair too</span>
              <span className="block text-[13px] text-fg-muted">
                Creates a barber profile for {ownerName}, so customers can book with you.
              </span>
            </span>
          </label>
        </CardBody>
      </Card>

      <FormMessage state={state} />
      <div className="flex justify-end">
        <SubmitButton size="lg" pending={pending} pendingLabel="Creating your shop…">
          Create shop
        </SubmitButton>
      </div>
    </form>
  );
}
