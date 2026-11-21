"use client";

import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { createBookingAction } from "./actions";

export function DetailsForm({
  hidden,
  requireEmail,
  shopName,
  privacyHref,
}: {
  hidden: Record<string, string>;
  requireEmail: boolean;
  shopName: string;
  privacyHref: string;
}) {
  const { state, onSubmit, pending, fieldErrors: fe } = useFormAction(createBookingAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {/* Honeypot: hidden from people, irresistible to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <Field label="Your name" htmlFor="fullName" error={fe.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" required aria-invalid={!!fe.fullName} />
      </Field>
      <Field label="Mobile number" htmlFor="phone" error={fe.phone ?? fe["newCustomer.phone"]} hint="So the shop can reach you about your booking.">
        <Input id="phone" name="phone" type="tel" autoComplete="tel" required aria-invalid={!!(fe.phone ?? fe["newCustomer.phone"])} />
      </Field>
      <Field
        label={requireEmail ? "Email" : "Email (optional)"}
        htmlFor="email"
        error={fe.email}
        hint="We'll send your confirmation and a link to change or cancel."
      >
        <Input id="email" name="email" type="email" autoComplete="email" required={requireEmail} aria-invalid={!!fe.email} />
      </Field>
      <Field label="Anything the barber should know? (optional)" htmlFor="note" error={fe.note}>
        <Textarea id="note" name="note" rows={2} className="min-h-0" maxLength={300} />
      </Field>
      <label className="flex items-start gap-3 text-[13px]">
        <Checkbox name="marketingOptIn" className="mt-0.5" />
        <span className="text-fg-muted">Send me occasional news and offers from {shopName}. You can unsubscribe any time.</span>
      </label>
      <FormMessage state={state} />
      <SubmitButton size="lg" pending={pending} pendingLabel="Booking…">
        Confirm booking
      </SubmitButton>
      <p className="text-center text-[12px] text-fg-subtle">
        Your details are used only to manage your booking.{" "}
        <a href={privacyHref} className="underline underline-offset-2">
          Privacy
        </a>
      </p>
    </form>
  );
}
