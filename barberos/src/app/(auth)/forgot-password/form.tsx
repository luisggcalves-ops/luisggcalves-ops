"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function ForgotPasswordForm() {
  const [state, setState] = useState<"idle" | "pending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim().toLowerCase();
    setState("pending");
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    if (error && error.status === 429) {
      setState("error");
      setMessage("Too many requests. Please wait a minute and try again.");
      return;
    }
    // Same message whether or not the account exists, so emails can't be enumerated.
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="rounded-lg bg-success-bg px-3 py-2 text-[13px] text-success">
          If an account exists for that email, a reset link is on its way. It expires in one hour.
        </p>
        <Link href="/sign-in" className="text-center text-[13px] font-medium hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      {state === "error" ? (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">
          {message}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={state === "pending"}>
        {state === "pending" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Send reset link
      </Button>
      <Link href="/sign-in" className="text-center text-[13px] text-fg-muted hover:text-fg">
        Back to sign in
      </Link>
    </form>
  );
}
