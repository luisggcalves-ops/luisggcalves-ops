import type { Metadata } from "next";
import { AuthForm } from "./auth-form";
import { Logo } from "@/components/app-shell";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/dashboard";
  const mode = sp.mode === "signup" ? "signup" : "signin";
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Hearth</span>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <AuthForm next={next} initialMode={mode} authError={sp.error === "auth"} />
        </div>
        <p className="text-xs text-muted">Every family member gets their own account. Your data is only visible to your family.</p>
      </div>
      <Showcase />
    </div>
  );
}

function Showcase() {
  const rows = [
    { t: "Feed the dog", who: "Mia", c: "bg-amber-100 text-amber-800", done: true, meta: "Every morning" },
    { t: "Take out the rubbish", who: "Leo", c: "bg-sky-100 text-sky-700", done: false, meta: "Every Tuesday" },
    { t: "Clean the kitchen", who: "Sam", c: "bg-violet-100 text-violet-700", done: true, meta: "Every evening" },
    { t: "Weekly food shop", who: "Ana", c: "bg-emerald-100 text-emerald-700", done: false, meta: "Saturday" },
  ];
  return (
    <div className="relative hidden overflow-hidden bg-[#1c1b19] lg:block">
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_20%,rgba(128,128,242,0.35),transparent),radial-gradient(50%_40%_at_20%_90%,rgba(76,195,138,0.18),transparent)]" />
      <div className="relative flex h-full flex-col justify-center px-16">
        <h2 className="max-w-md text-4xl font-semibold tracking-tight text-white">
          Household life, <span className="text-[#b4b4ff]">organised together.</span>
        </h2>
        <p className="mt-4 max-w-md text-[15px] text-white/60">
          Share one family workspace. Assign chores, set routines, and watch progress update live as everyone ticks things off.
        </p>
        <div className="mt-10 max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-3 backdrop-blur">
          <div className="flex items-center justify-between px-3 pt-2 pb-3">
            <p className="text-sm font-medium text-white">This week</p>
            <p className="text-sm text-white/60">68% done</p>
          </div>
          {rows.map((r) => (
            <div key={r.t} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
              <span className={`grid size-5 place-items-center rounded-full border-[1.5px] ${r.done ? "border-[#4cc38a] bg-[#4cc38a]" : "border-white/30"}`}>
                {r.done && (
                  <svg viewBox="0 0 12 12" className="size-3 text-white" fill="none"><path d="m2.5 6.2 2.2 2.2 4.8-4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                )}
              </span>
              <div className="flex-1">
                <p className={`text-sm ${r.done ? "text-white/40 line-through" : "text-white"}`}>{r.t}</p>
                <p className="text-xs text-white/40">{r.meta}</p>
              </div>
              <span className={`grid size-7 place-items-center rounded-full text-[11px] font-semibold ${r.c}`}>{r.who[0]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
