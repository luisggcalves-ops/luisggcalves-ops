import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-fg-muted">Sign in to manage your shop.</p>
      <Suspense>
        {/* Demo buttons are only shown where demo data is meant to exist (Codespaces, local dev). */}
        <AuthForm mode="sign-in" demoLogins={process.env.SHOW_DEMO_LOGINS === "1"} />
      </Suspense>
    </>
  );
}
