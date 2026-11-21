"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { IDLE, type ActionState } from "@/lib/action-state";

/**
 * Wraps a server action for a form. Unlike `<form action>`, it does not reset
 * the form after submission, so users keep their input when validation fails.
 */
export function useFormAction(action: (prev: ActionState, formData: FormData) => Promise<ActionState>) {
  const [state, dispatch, pending] = useActionState(action, IDLE);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => dispatch(formData));
  };
  const fieldErrors: Record<string, string> = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  return { state, onSubmit, pending, fieldErrors };
}
