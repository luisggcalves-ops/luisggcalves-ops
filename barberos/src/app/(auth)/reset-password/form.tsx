"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== form.get("confirm")) return setError("The passwords don't match.");
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setPending(false);
      return setError(error.status === 400 ? "This reset link has expired. Request a new one." : "Something went wrong. Please try again.");
    }
    router.replace("/sign-in?reset=1");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Save new password
      </Button>
    </form>
  );
}
