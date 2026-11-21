"use client";

import type { ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "./use-form-action";
import { SubmitButton } from "./form-status";
import { Button } from "./button";

/**
 * A one-click server action (revoke, deactivate, …) with optional confirmation
 * and an inline error message.
 */
export function ActionButton({
  action,
  fields,
  children,
  variant = "ghost",
  confirm,
  ariaLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  confirm?: string;
  ariaLabel?: string;
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  return (
    <form
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) {
          e.preventDefault();
          return;
        }
        onSubmit(e);
      }}
      className="inline-flex flex-col items-end gap-1"
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} size="sm" pending={pending} aria-label={ariaLabel}>
        {children}
      </SubmitButton>
      {state.status === "error" ? (
        <span role="alert" className="max-w-56 text-right text-[12px] text-danger">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export { Button };
