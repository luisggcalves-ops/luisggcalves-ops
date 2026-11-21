import type { Metadata } from "next";
import { ForgotPasswordForm } from "./form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mb-6 mt-1 text-sm text-fg-muted">We&apos;ll email you a link to choose a new one.</p>
      <ForgotPasswordForm />
    </>
  );
}
