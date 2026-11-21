import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "./form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  if (!token || error) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Link expired</h1>
        <p className="mb-6 mt-1 text-sm text-fg-muted">
          This reset link is invalid or has expired. Request a new one.
        </p>
        <Link href="/forgot-password" className="text-sm font-medium hover:underline">
          Request a new link
        </Link>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mb-6 mt-1 text-sm text-fg-muted">You&apos;ll be signed out on your other devices.</p>
      <ResetPasswordForm token={token} />
    </>
  );
}
