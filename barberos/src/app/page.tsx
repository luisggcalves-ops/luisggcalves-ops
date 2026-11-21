import Link from "next/link";
import { CalendarDays, NotebookPen, Smartphone, Users, Wallet, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";
import { getSessionUser } from "@/server/auth/session";

const FEATURES = [
  { icon: CalendarDays, title: "One shared calendar", text: "Every barber's day in one view. Double bookings are blocked by design." },
  { icon: Smartphone, title: "Online booking", text: "Customers book from their phone, no app needed. Bookings land in your calendar instantly." },
  { icon: NotebookPen, title: "Haircut history", text: "Notes on every cut, so any barber knows exactly how a regular likes it." },
  { icon: Users, title: "Your team", text: "Owner, manager and barber roles. Everyone sees what they should, and nothing more." },
  { icon: Wallet, title: "Revenue & commissions", text: "Record payments and see what each barber earned, calculated from your own rules." },
  { icon: ShieldCheck, title: "Private by default", text: "Each shop's data is isolated and stored in the EU, with GDPR export and deletion." },
];

export default async function HomePage() {
  const user = await getSessionUser();
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? (
            <ButtonLink href="/start" size="sm">
              Open BarberOS
            </ButtonLink>
          ) : (
            <>
              <Link href="/sign-in" className="px-3 text-sm text-fg-muted hover:text-fg">
                Sign in
              </Link>
              <ButtonLink href="/sign-up" size="sm">
                Get started
              </ButtonLink>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-28">
          <p className="text-[13px] font-medium uppercase tracking-[0.2em] text-fg-subtle">For independent barbershops</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Everything your barbershop needs, in one place.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-fg-muted">
            Appointments, online booking, customers and their haircut history, your team, and the money. Built for shops with two to five chairs.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <ButtonLink href={user ? "/start" : "/sign-up"} size="lg">
              {user ? "Open your dashboard" : "Set up your shop"}
            </ButtonLink>
            {!user ? (
              <ButtonLink href="/sign-in" size="lg" variant="secondary">
                Sign in
              </ButtonLink>
            ) : null}
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-surface p-8">
                <f.icon className="size-5" strokeWidth={1.75} aria-hidden />
                <h2 className="mt-4 font-semibold tracking-tight">{f.title}</h2>
                <p className="mt-1.5 text-sm text-fg-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-[13px] text-fg-subtle">
        <span>© {new Date().getFullYear()} BarberOS</span>
        <span>Made for barbers</span>
      </footer>
    </div>
  );
}
