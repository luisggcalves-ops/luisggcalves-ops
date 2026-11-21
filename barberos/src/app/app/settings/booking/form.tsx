"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { CALENDAR_COLOR_HEX } from "@/lib/calendar-colors";
import { updateBookingSettingsAction } from "../actions";

export type BookingSettingsDefaults = {
  onlineBookingEnabled: boolean;
  autoConfirmOnline: boolean;
  requireCustomerEmail: boolean;
  slotIntervalMin: number;
  bookingLeadTimeMin: number;
  bookingHorizonDays: number;
  cancellationWindowHours: number;
  brandColor: string | null;
};

const BRAND = [{ key: "default", hex: "#0a0a0b" }, ...Object.values(CALENDAR_COLOR_HEX).slice(1).map((hex) => ({ key: hex, hex }))];

export function BookingSettingsForm({ defaults, bookingUrl, hasServices }: { defaults: BookingSettingsDefaults; bookingUrl: string; hasServices: boolean }) {
  const { state, onSubmit, pending } = useFormAction(updateBookingSettingsAction);
  const [copied, setCopied] = useState(false);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Your booking page" description="Share this link on Instagram, Google Maps and WhatsApp." />
        <CardBody className="flex flex-col gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted p-2">
            <code className="min-w-0 flex-1 truncate px-1 text-[13px]" data-testid="booking-url">
              {bookingUrl}
            </code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(bookingUrl);
                setCopied(true);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-medium hover:bg-surface-muted"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
            </button>
            <a
              href={bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-medium hover:bg-surface-muted"
            >
              <ExternalLink className="size-3.5" /> Open
            </a>
          </div>
          <label className="flex items-start gap-3">
            <Checkbox name="onlineBookingEnabled" defaultChecked={defaults.onlineBookingEnabled} className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Accept online bookings</span>
              <span className="block text-[13px] text-fg-muted">
                {hasServices
                  ? "When off, the page shows your contact details and asks customers to call."
                  : "Add at least one service before opening online booking."}
              </span>
            </span>
          </label>
          <fieldset>
            <legend className="text-[13px] font-medium">Accent colour on the booking page</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {BRAND.map((b) => (
                <label key={b.key} className="cursor-pointer">
                  <input
                    type="radio"
                    name="brandColor"
                    value={b.key}
                    defaultChecked={(defaults.brandColor ?? "default") === b.key}
                    className="peer sr-only"
                  />
                  <span
                    className="block size-7 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-fg"
                    style={{ background: b.hex }}
                  />
                  <span className="sr-only">{b.key === "default" ? "Black" : b.hex}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Booking rules" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum notice" htmlFor="lead" hint="How soon before a slot customers can book it.">
            <Select id="lead" name="bookingLeadTimeMin" defaultValue={String(defaults.bookingLeadTimeMin)}>
              {[0, 30, 60, 120, 240, 720, 1440].map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "No minimum" : m < 60 ? `${m} minutes` : m < 1440 ? `${m / 60} hour${m > 60 ? "s" : ""}` : "1 day"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Book up to" htmlFor="horizon" hint="How far ahead customers can book.">
            <Select id="horizon" name="bookingHorizonDays" defaultValue={String(defaults.bookingHorizonDays)}>
              {[7, 14, 30, 60, 90, 180].map((d) => (
                <option key={d} value={d}>
                  {d} days ahead
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cancel or change online until" htmlFor="window" hint="After this, customers are asked to call.">
            <Select id="window" name="cancellationWindowHours" defaultValue={String(defaults.cancellationWindowHours)}>
              {[0, 2, 4, 12, 24, 48].map((h) => (
                <option key={h} value={h}>
                  {h === 0 ? "Up to the start time" : `${h} hours before`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Time slots every" htmlFor="interval">
            <Select id="interval" name="slotIntervalMin" defaultValue={String(defaults.slotIntervalMin)}>
              {[10, 15, 20, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-start gap-3 sm:col-span-2">
            <Checkbox name="autoConfirmOnline" defaultChecked={defaults.autoConfirmOnline} className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Confirm online bookings automatically</span>
              <span className="block text-[13px] text-fg-muted">Untick to review each request first (it still holds the slot).</span>
            </span>
          </label>
          <label className="flex items-start gap-3 sm:col-span-2">
            <Checkbox name="requireCustomerEmail" defaultChecked={defaults.requireCustomerEmail} className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Require an email address</span>
              <span className="block text-[13px] text-fg-muted">Phone is always required. Email enables confirmations and the manage-booking link.</span>
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
