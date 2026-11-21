import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-fg-muted">Sign in to manage your shop.</p>
      <Suspense>
        <AuthForm mode="sign-in" />
      </Suspense>
    </>
  );
}
