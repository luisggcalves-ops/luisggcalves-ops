"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "./button";
import { cn } from "@/lib/cn";

/** A submit button that disables itself and shows a spinner while its form submits. */
export function SubmitButton({
  children,
  pendingLabel,
  pending: pendingProp,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string; pending?: boolean }) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

export function FormMessage({
  state,
  className,
}: {
  state: { status: string; message?: string };
  className?: string;
}) {
  if (state.status === "idle" || !state.message) return null;
  const error = state.status === "error";
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "rounded-lg px-3 py-2 text-[13px] animate-in",
        error ? "bg-danger-bg text-danger" : "bg-success-bg text-success",
        className,
      )}
    >
      {state.message}
    </p>
  );
}
