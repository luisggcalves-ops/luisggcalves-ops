"use client";

import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import type { ActionState } from "@/lib/action-state";

export type ServiceFormDefaults = {
  serviceId?: string;
  name: string;
  description: string;
  durationMin: number;
  bufferAfterMin: number;
  price: string;
  isPublic: boolean;
  staffMemberIds: string[];
};

export function ServiceForm({
  action,
  defaults,
  staff,
  currency,
  title,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults: ServiceFormDefaults;
  staff: { id: string; displayName: string }[];
  currency: string;
  title: string;
  submitLabel: string;
}) {
  const { state, onSubmit, pending, fieldErrors: fe } = useFormAction(action);
  return (
    <form onSubmit={onSubmit}>
      {defaults.serviceId ? <input type="hidden" name="serviceId" value={defaults.serviceId} /> : null}
      <Card>
        <CardHeader title={title} description="Duration sets how long the appointment blocks the barber's calendar." />
        <CardBody className="grid gap-4 sm:grid-cols-6">
          <Field label="Name" htmlFor="svc-name" error={fe.name} className="sm:col-span-6">
            <Input id="svc-name" name="name" defaultValue={defaults.name} required placeholder="e.g. Skin fade" aria-invalid={!!fe.name} />
          </Field>
          <Field label="Duration (min)" htmlFor="svc-duration" error={fe.durationMin} className="sm:col-span-2">
            <Input id="svc-duration" name="durationMin" type="number" min={5} max={480} step={5} defaultValue={defaults.durationMin} required aria-invalid={!!fe.durationMin} />
          </Field>
          <Field label="Clean-up buffer (min)" htmlFor="svc-buffer" error={fe.bufferAfterMin} hint="Time blocked after the cut." className="sm:col-span-2">
            <Input id="svc-buffer" name="bufferAfterMin" type="number" min={0} max={120} step={5} defaultValue={defaults.bufferAfterMin} />
          </Field>
          <Field label={`Price (${currency})`} htmlFor="svc-price" error={fe.price} className="sm:col-span-2">
            <Input id="svc-price" name="price" inputMode="decimal" defaultValue={defaults.price} required placeholder="15.00" aria-invalid={!!fe.price} />
          </Field>
          <Field label="Description (optional)" htmlFor="svc-desc" error={fe.description} className="sm:col-span-6">
            <Textarea id="svc-desc" name="description" defaultValue={defaults.description} rows={2} className="min-h-0" maxLength={500} />
          </Field>
          <fieldset className="sm:col-span-6">
            <legend className="text-[13px] font-medium">Barbers who offer it</legend>
            {staff.length ? (
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {staff.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox name="staffMemberIds" value={s.id} defaultChecked={defaults.staffMemberIds.includes(s.id)} />
                    {s.displayName}
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[13px] text-fg-muted">No barbers yet. New barbers get all active services automatically.</p>
            )}
          </fieldset>
          <label className="flex items-start gap-3 sm:col-span-6">
            <Checkbox name="isPublic" defaultChecked={defaults.isPublic} className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Show on the online booking page</span>
              <span className="block text-[13px] text-fg-muted">Untick for services only staff should book.</span>
            </span>
          </label>
        </CardBody>
        <CardFooter className="justify-between">
          <FormMessage state={state} className="py-1" />
          <SubmitButton pending={pending} className="ml-auto">
            {submitLabel}
          </SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}
