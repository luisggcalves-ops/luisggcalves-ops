import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { getSessionUser } from "@/server/auth/session";
import { getInvitationPreview } from "@/server/domain/team/service";
import { ROLE_LABELS } from "@/server/authz/permissions";
import { ButtonLink } from "@/components/ui/button";
import { signOutAction } from "@/app/session-actions";
import { AcceptInviteForm } from "./accept-form";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, user] = await Promise.all([getInvitationPreview(token), getSessionUser()]);
  const next = `/invite/${token}`;

  let body: React.ReactNode;
  if (!invite || invite.state !== "valid") {
    const reason =
      !invite || invite.state === "revoked"
        ? "This invitation link isn't valid anymore."
        : invite.state === "expired"
          ? "This invitation has expired."
          : "This invitation has already been used.";
    body = (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Invitation unavailable</h1>
        <p className="mt-2 text-sm text-fg-muted">{reason} Ask the shop owner to send you a new one.</p>
        <ButtonLink href={user ? "/start" : "/sign-in"} variant="secondary" className="mt-6 w-full">
          {user ? "Go to BarberOS" : "Sign in"}
        </ButtonLink>
      </>
    );
  } else {
    const query = `next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`;
    const emailMatches = user && user.email.toLowerCase() === invite.email.toLowerCase();
    body = (
      <>
        <p className="text-[13px] font-medium uppercase tracking-wider text-fg-subtle">You&apos;re invited</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Join {invite.shopName}</h1>
        <p className="mt-2 text-sm text-fg-muted">
          You&apos;ve been invited as <strong className="font-medium text-fg">{ROLE_LABELS[invite.role].toLowerCase()}</strong> ({invite.email}).
        </p>
        <div className="mt-6">
          {!user ? (
            <div className="flex flex-col gap-2">
              <ButtonLink href={`/sign-up?${query}`} size="lg">
                Create account and join
              </ButtonLink>
              <ButtonLink href={`/sign-in?${query}`} size="lg" variant="secondary">
                I already have an account
              </ButtonLink>
            </div>
          ) : emailMatches ? (
            <AcceptInviteForm token={token} shopName={invite.shopName} />
          ) : (
            <div className="flex flex-col gap-3">
              <p role="alert" className="rounded-lg bg-warning-bg px-3 py-2 text-[13px] text-warning">
                You&apos;re signed in as {user.email}. This invitation is for {invite.email}.
              </p>
              <form action={signOutAction}>
                <input type="hidden" name="next" value={next} />
                <button type="submit" className="w-full text-sm font-medium hover:underline">
                  Sign out and switch account
                </button>
              </form>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-6 py-5">
        <Link href="/" aria-label="BarberOS home">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 sm:pt-16">
        <div className="w-full max-w-sm animate-in">{body}</div>
      </main>
    </div>
  );
}
