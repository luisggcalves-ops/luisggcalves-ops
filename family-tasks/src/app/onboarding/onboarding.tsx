"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Home, KeyRound, Loader2, LogOut } from "lucide-react";
import clsx from "clsx";
import { getSupabase } from "@/lib/supabase/client";
import { Logo } from "@/components/app-shell";

type Step = "choose" | "create" | "join";

export function Onboarding({ name, initialCode }: { name: string; initialCode: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialCode ? "join" : "choose");
  const [familyName, setFamilyName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = (s: Step) => {
    setError(null);
    setStep(s);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = getSupabase();
    const { error } =
      step === "create"
        ? await supabase.rpc("create_family", {
            family_name: familyName,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          })
        : await supabase.rpc("join_family", { code });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  };

  return (
    <div className="flex min-h-dvh flex-col px-6 py-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Hearth</span>
        </div>
        <form action="/auth/signout" method="post">
          <button className="btn-ghost h-9 text-muted">
            <LogOut className="size-4" /> Sign out
          </button>
        </form>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
          >
            {step === "choose" ? (
              <>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {name ? `Hi ${name.split(" ")[0]}, let's get you set up` : "Let's get you set up"}
                </h1>
                <p className="mt-1.5 text-sm text-muted">Every family shares one workspace. Start a new one or join yours.</p>
                <div className="mt-8 grid gap-3">
                  <ChoiceCard
                    icon={Home}
                    title="Create a family"
                    body="You'll be the family admin and can invite everyone else."
                    onClick={() => go("create")}
                  />
                  <ChoiceCard
                    icon={KeyRound}
                    title="Join a family"
                    body="Got an invite code from a parent or guardian? Enter it here."
                    onClick={() => go("join")}
                  />
                </div>
              </>
            ) : (
              <form onSubmit={submit}>
                <button type="button" onClick={() => go("choose")} className="btn-ghost -ml-3 mb-4 h-8 text-muted">
                  <ArrowLeft className="size-4" /> Back
                </button>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {step === "create" ? "Name your family" : "Enter your invite code"}
                </h1>
                <p className="mt-1.5 text-sm text-muted">
                  {step === "create"
                    ? "This is what everyone will see at the top of the dashboard."
                    : "Ask your family admin for the 8-character code in Family → Invite."}
                </p>
                <div className="mt-6">
                  {step === "create" ? (
                    <input
                      autoFocus
                      className="input h-12 text-base"
                      placeholder="e.g. The Silva Family"
                      value={familyName}
                      onChange={(e) => setFamilyName(e.target.value)}
                      maxLength={80}
                      required
                    />
                  ) : (
                    <input
                      autoFocus
                      className="input h-12 text-center font-mono text-lg tracking-[0.35em] uppercase"
                      placeholder="ABCD2345"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                      maxLength={8}
                      minLength={8}
                      required
                    />
                  )}
                </div>
                {error && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
                <button className="btn-primary mt-5 h-11 w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <>{step === "create" ? "Create family" : "Join family"} <ArrowRight className="size-4" /></>}
                </button>
              </form>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function ChoiceCard({
  icon: Icon,
  title,
  body,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx("card group flex items-center gap-4 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-pop")}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        <Icon className="size-5" />
      </span>
      <span className="flex-1">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{body}</span>
      </span>
      <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
    </button>
  );
}
