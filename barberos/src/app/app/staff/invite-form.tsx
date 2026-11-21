"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { inviteAction } from "./actions";

export function InviteForm({ roles }: { roles: { value: string; label: string }[] }) {
  const { state, onSubmit, pending, fieldErrors } = useFormAction(inviteAction);
  const url = state.status === "success" ? (state.data?.url as string | undefined) : undefined;
  const [copied, setCopied] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
        <Field label="Email" htmlFor="invite-email" error={fieldErrors.email}>
          <Input id="invite-email" name="email" type="email" required placeholder="barber@example.com" aria-invalid={!!fieldErrors.email} />
        </Field>
        <Field label="Role" htmlFor="invite-role" error={fieldErrors.role}>
          <Select id="invite-role" name="role" defaultValue={roles[roles.length - 1]?.value}>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton pending={pending}>Send invite</SubmitButton>
      </form>
      <FormMessage state={state} />
      {url ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted p-2 animate-in">
          <code className="min-w-0 flex-1 truncate px-1 text-[12px]" data-testid="invite-link">
            {url}
          </code>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(url);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-medium hover:bg-surface-muted"
          >
            {copied === url ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied === url ? "Copied" : "Copy link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
