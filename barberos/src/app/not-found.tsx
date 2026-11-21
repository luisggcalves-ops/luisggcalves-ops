import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo withWordmark={false} />
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm text-fg-muted">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <ButtonLink href="/start" variant="secondary">
        Go to BarberOS
      </ButtonLink>
    </div>
  );
}
