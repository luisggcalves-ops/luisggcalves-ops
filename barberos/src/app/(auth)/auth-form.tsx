"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { authClient, safeNext } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

type Mode = "sign-in" | "sign-up";

function friendlyError(code: string | undefined, message: string | undefined, status: number | undefined) {
  if (status === 429) return "Too many attempts. Please wait a minute and try again.";
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account with this email already exists. Try signing in.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 8 characters for your password.";
    case "INVALID_ORIGIN":
    case "MISSING_OR_NULL_ORIGIN":
      return "This app doesn't recognise the address you opened it from. Please open it from the shop's usual link.";
    default:
      return message || "Something went wrong. Please try again.";
  }
}

const DEMO_PASSWORD = "barberos-demo";

export function AuthForm({ mode, demoLogins = false }: { mode: Mode; demoLogins?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const presetEmail = params.get("email") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function demoSignIn(email: string) {
    setError(null);
    setPending(true);
    const { error } = await authClient.signIn.email({ email, password: DEMO_PASSWORD });
    if (error) {
      setPending(false);
      return setError(
        error.code === "INVALID_EMAIL_OR_PASSWORD"
          ? "The demo accounts don't exist here yet. Run the demo setup, or create your own account below."
          : friendlyError(error.code, error.message, error.status),
      );
    }
    router.replace(next);
    router.refresh();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    if (mode === "sign-up" && name.length < 2) return setError("Please enter your name.");
    if (password.length < 8) return setError("Use at least 8 characters for your password.");

    setPending(true);
    const { error } =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name });
    if (error) {
      setPending(false);
      return setError(friendlyError(error.code, error.message, error.status));
    }
    router.replace(next);
    router.refresh();
  }

  const otherHref = `${mode === "sign-in" ? "/sign-up" : "/sign-in"}${params.toString() ? `?${params}` : ""}`;

  return (
    <>
      {mode === "sign-in" && demoLogins ? (
        <div className="mb-6 flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
          <p className="text-[12px] font-medium uppercase tracking-wider text-fg-subtle">Try the demo</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" disabled={pending} onClick={() => demoSignIn("owner@demo.barberos.test")}>
              Demo owner
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => demoSignIn("barber@demo.barberos.test")}>
              Demo barber
            </Button>
          </div>
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {params.get("reset") === "1" ? (
          <p role="status" className="rounded-lg bg-success-bg px-3 py-2 text-[13px] text-success">
            Your password was changed. Sign in with your new password.
          </p>
        ) : null}
        {mode === "sign-up" ? (
          <Field label="Your name" htmlFor="name">
            <Input id="name" name="name" autoComplete="name" required autoFocus />
          </Field>
        ) : null}
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={presetEmail}
            autoFocus={mode === "sign-in"}
          />
        </Field>
        <Field
          label={
            <span className="flex w-full justify-between">
              Password
              {mode === "sign-in" ? (
                <Link href="/forgot-password" className="font-normal text-fg-muted hover:text-fg">
                  Forgot password?
                </Link>
              ) : null}
            </span>
          }
          htmlFor="password"
          hint={mode === "sign-up" ? "At least 8 characters." : undefined}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            required
            minLength={8}
          />
        </Field>
        {error ? (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger animate-in">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={pending} className="mt-1">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </Button>
        <p className="text-center text-[13px] text-fg-muted">
          {mode === "sign-in" ? "New to BarberOS? " : "Already have an account? "}
          <Link href={otherHref} className="font-medium text-fg underline-offset-4 hover:underline">
            {mode === "sign-in" ? "Create an account" : "Sign in"}
          </Link>
        </p>
      </form>
    </>
  );
}
