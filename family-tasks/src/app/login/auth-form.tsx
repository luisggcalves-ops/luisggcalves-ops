"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { Segmented } from "@/components/ui";

export function AuthForm({
  next,
  initialMode,
  authError,
}: {
  next: string;
  initialMode: "signin" | "signup";
  authError?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(authError ? "That sign-in link is invalid or has expired." : null);
  const [checkEmail, setCheckEmail] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = getSupabase();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setCheckEmail(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (checkEmail) {
    return (
      <div className="animate-rise text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <MailCheck className="size-5" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="mt-2 text-sm text-muted">
          We sent a confirmation link to <span className="font-medium text-ink">{email}</span>. Open it to finish creating your account.
        </p>
        <button className="btn-ghost mt-6" onClick={() => setCheckEmail(false)}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <h1 className="text-2xl font-semibold tracking-tight">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
      <p className="mt-1.5 text-sm text-muted">
        {mode === "signin" ? "Sign in to see what's on today." : "Start a family workspace or join one with an invite code."}
      </p>

      <Segmented
        className="mt-6 w-full"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
        options={[
          { value: "signin", label: "Sign in" },
          { value: "signup", label: "Sign up" },
        ]}
      />

      <form onSubmit={submit} className="mt-5 space-y-4">
        {mode === "signup" && (
          <div>
            <label className="label" htmlFor="name">Your name</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ana" required maxLength={60} autoComplete="given-name" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
            minLength={mode === "signup" ? 8 : undefined}
            required
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </div>
        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <button type="submit" className="btn-primary h-11 w-full" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <>{mode === "signin" ? "Sign in" : "Create account"} <ArrowRight className="size-4" /></>}
        </button>
      </form>
    </div>
  );
}
