import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-fg-muted">Set up your barbershop in a few minutes.</p>
      <Suspense>
        <AuthForm mode="sign-up" />
      </Suspense>
    </>
  );
}
