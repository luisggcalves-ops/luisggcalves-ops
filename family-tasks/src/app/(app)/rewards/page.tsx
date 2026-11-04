"use client";

import Link from "next/link";
import { useState } from "react";
import { format } from "date-fns";
import { Gift, Medal, Pencil, Plus, Sparkles, Star, Trash2, Trophy } from "lucide-react";
import clsx from "clsx";
import { useFamily } from "@/components/family-provider";
import { Avatar, EmptyState, Modal, PageHeader, ProgressBar, Segmented } from "@/components/ui";
import { useToast } from "@/components/toast";
import { challengeIsActive, challengeProgress, pointsBalance, pointsEarned } from "@/lib/stats";
import { weekEnd, weekStart, relativeTime } from "@/lib/dates";
import type { Challenge, Reward } from "@/lib/types";

const REWARD_EMOJIS = ["🎁", "🍦", "🎮", "🎬", "🍕", "📱", "🛝", "📚", "🧸", "💷", "🌙", "🎨"];

export default function RewardsPage() {
  const ctx = useFamily();
  const { family, members, completions, redemptions, rewards, challenges, isAdmin, userId, redeemReward, deleteReward, deleteChallenge, memberById } = ctx;
  const toast = useToast();
  const [editingReward, setEditingReward] = useState<Partial<Reward> | null>(null);
  const [editingChallenge, setEditingChallenge] = useState<Partial<Challenge> | null>(null);

  if (!family.gamification_enabled) {
    return (
      <div className="card mx-auto max-w-lg">
        <EmptyState
          icon={Gift}
          title="Points & rewards are turned off"
          body={isAdmin ? "Turn them on in Settings to award points, run challenges and set up rewards." : "A family admin can turn them on in Settings."}
          action={isAdmin && <Link href="/settings" className="btn-secondary">Open settings</Link>}
        />
      </div>
    );
  }

  const ws = weekStart();
  const board = members
    .map((m) => ({ m, week: pointsEarned(completions, m.user_id, ws), tasks: completions.filter((c) => c.user_id === m.user_id && new Date(c.completed_at) >= ws).length }))
    .sort((a, b) => b.week - a.week);
  const balance = pointsBalance(completions, redemptions, userId);
  const active = challenges.filter((c) => challengeIsActive(c));
  const past = challenges.filter((c) => !challengeIsActive(c)).slice(0, 6);
  const activeRewards = rewards.filter((r) => r.active);
  const medal = ["text-amber-500", "text-zinc-400", "text-orange-700"];

  return (
    <div className="animate-rise">
      <PageHeader title="Rewards" subtitle="Points, weekly challenges and treats — earned together." />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card relative overflow-hidden p-5 sm:p-6">
          <div className="absolute -top-12 -right-12 size-40 rounded-full bg-amber-400/15 blur-2xl" />
          <p className="section-title">Your balance</p>
          <p className="mt-2 flex items-baseline gap-1.5 text-4xl font-semibold tracking-tight tabular-nums" data-testid="balance">
            {balance}
            <span className="text-base font-medium text-muted">pts</span>
          </p>
          <p className="mt-1 text-sm text-muted">+{pointsEarned(completions, userId, ws)} this week</p>
        </div>

        <div className="card p-5 sm:p-6 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Trophy className="size-4 text-amber-500" /> This week&apos;s leaderboard</h2>
            <span className="text-xs text-muted">{format(ws, "d MMM")} – {format(weekEnd(), "d MMM")}</span>
          </div>
          <ol className="space-y-2">
            {board.map(({ m, week, tasks }, i) => (
              <li key={m.user_id} className="flex items-center gap-3">
                <span className="w-5 text-center">
                  {i < 3 && week > 0 ? <Medal className={clsx("size-4", medal[i])} /> : <span className="text-xs text-muted">{i + 1}</span>}
                </span>
                <Avatar profile={m.profile} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.profile.display_name}</p>
                  <ProgressBar value={board[0].week ? (week / board[0].week) * 100 : 0} className="mt-1" barClass="bg-amber-400" />
                </div>
                <span className="w-20 text-right text-xs text-muted">{tasks} tasks</span>
                <span className="w-14 text-right text-sm font-semibold tabular-nums">{week}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Challenges */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Family challenges</h2>
          {isAdmin && (
            <button
              className="btn-secondary h-9"
              onClick={() =>
                setEditingChallenge({
                  metric: "tasks",
                  target: 20,
                  starts_on: format(ws, "yyyy-MM-dd"),
                  ends_on: format(weekEnd(), "yyyy-MM-dd"),
                })
              }
            >
              <Plus className="size-4" /> New challenge
            </button>
          )}
        </div>
        {active.length === 0 && past.length === 0 ? (
          <div className="card"><EmptyState icon={Sparkles} title="No challenges yet" body={isAdmin ? "Set a weekly goal the whole family works towards together." : "An admin can set a weekly goal for the family."} /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...active, ...past].map((c) => {
              const prog = challengeProgress(c, completions);
              const pct = Math.min(100, Math.round((prog / c.target) * 100));
              const isActive = active.includes(c);
              const done = prog >= c.target;
              return (
                <div key={c.id} className={clsx("card group p-5", !isActive && "opacity-70")}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[15px] font-semibold">{c.title}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {format(new Date(c.starts_on + "T00:00:00"), "d MMM")} – {format(new Date(c.ends_on + "T00:00:00"), "d MMM")}
                        {!isActive && " · ended"}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                        <button className="btn-ghost size-8 px-0" onClick={() => setEditingChallenge(c)} aria-label="Edit challenge"><Pencil className="size-3.5" /></button>
                        <button className="btn-ghost size-8 px-0 text-danger" onClick={() => deleteChallenge(c.id)} aria-label="Delete challenge"><Trash2 className="size-3.5" /></button>
                      </div>
                    )}
                  </div>
                  {c.description && <p className="mt-2 text-sm text-ink-2">{c.description}</p>}
                  <ProgressBar value={pct} className="mt-4 h-2" barClass={done ? "bg-success" : "bg-accent"} />
                  <div className="mt-2 flex justify-between text-xs">
                    <span className="text-muted">{prog} / {c.target} {c.metric}</span>
                    <span className={done ? "font-medium text-success" : "text-muted"}>{done ? "Complete 🎉" : `${pct}%`}</span>
                  </div>
                  {c.reward_text && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">🎁 {c.reward_text}</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Reward store */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Rewards</h2>
          {isAdmin && (
            <button className="btn-secondary h-9" onClick={() => setEditingReward({ emoji: "🎁", cost: 100 })}>
              <Plus className="size-4" /> New reward
            </button>
          )}
        </div>
        {(isAdmin ? rewards : activeRewards).length === 0 ? (
          <div className="card"><EmptyState icon={Gift} title="No rewards yet" body={isAdmin ? "Add treats your family can spend their points on." : "An admin can add rewards to spend points on."} /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(isAdmin ? rewards : activeRewards).map((r) => {
              const affordable = balance >= r.cost;
              return (
                <div key={r.id} className={clsx("card group flex flex-col p-5", !r.active && "opacity-60")}>
                  <div className="flex items-start justify-between">
                    <span className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-2xl">{r.emoji}</span>
                    {isAdmin && (
                      <div className="flex opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                        <button className="btn-ghost size-8 px-0" onClick={() => setEditingReward(r)} aria-label="Edit reward"><Pencil className="size-3.5" /></button>
                        <button className="btn-ghost size-8 px-0 text-danger" onClick={() => deleteReward(r.id)} aria-label="Delete reward"><Trash2 className="size-3.5" /></button>
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-[15px] font-semibold">{r.title}</p>
                  {r.description && <p className="mt-0.5 text-sm text-muted">{r.description}</p>}
                  <div className="mt-auto flex items-center justify-between pt-4">
                    <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums"><Star className="size-3.5 text-amber-500" />{r.cost}</span>
                    {r.active ? (
                      <button
                        className={affordable ? "btn-accent h-8 px-3" : "btn-secondary h-8 px-3"}
                        disabled={!affordable}
                        onClick={async () => {
                          await redeemReward(r.id);
                          toast.show({ tone: "success", title: `${r.emoji} Redeemed ${r.title}`, body: "A grown-up has been notified." });
                        }}
                      >
                        {affordable ? "Redeem" : `${r.cost - balance} to go`}
                      </button>
                    ) : (
                      <span className="text-xs text-muted">Hidden</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {redemptions.length > 0 && (
        <section className="card mt-8 p-4 sm:p-5">
          <h2 className="mb-2 text-[15px] font-semibold">Recent redemptions</h2>
          <ul className="divide-y divide-line">
            {redemptions.slice(0, 10).map((r) => {
              const m = memberById(r.user_id);
              return (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <Avatar profile={m?.profile} size="sm" />
                  <p className="flex-1 text-sm"><span className="font-medium">{m?.profile.display_name ?? "Someone"}</span> redeemed {r.title}</p>
                  <span className="text-xs text-muted">{relativeTime(r.created_at)}</span>
                  <span className="w-14 text-right text-sm text-muted tabular-nums">−{r.cost}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <RewardModal value={editingReward} onClose={() => setEditingReward(null)} />
      <ChallengeModal value={editingChallenge} onClose={() => setEditingChallenge(null)} />
    </div>
  );
}

function RewardModal({ value, onClose }: { value: Partial<Reward> | null; onClose: () => void }) {
  const { saveReward } = useFamily();
  const [draft, setDraft] = useState<Partial<Reward>>({});
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value ?? {});
  }
  return (
    <Modal open={!!value} onClose={onClose} title={value?.id ? "Edit reward" : "New reward"}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await saveReward({ ...draft, title: draft.title?.trim() ?? "", cost: draft.cost ?? 100 });
          onClose();
        }}
      >
        <div className="flex flex-wrap gap-1.5">
          {REWARD_EMOJIS.map((em) => (
            <button key={em} type="button" onClick={() => setDraft((d) => ({ ...d, emoji: em }))} className={clsx("grid size-9 place-items-center rounded-xl text-lg", draft.emoji === em ? "bg-ink" : "bg-surface-2 hover:bg-line")}>
              {em}
            </button>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="rw-title">Reward</label>
          <input id="rw-title" className="input" required maxLength={80} placeholder="e.g. Movie night pick" value={draft.title ?? ""} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
        </div>
        <div>
          <label className="label" htmlFor="rw-desc">Description</label>
          <input id="rw-desc" className="input" placeholder="Optional" value={draft.description ?? ""} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
        </div>
        <div>
          <label className="label" htmlFor="rw-cost">Cost (points)</label>
          <input id="rw-cost" type="number" min={1} max={100000} className="input" required value={draft.cost ?? 100} onChange={(e) => setDraft((d) => ({ ...d, cost: Number(e.target.value) }))} />
        </div>
        {value?.id && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.active ?? true} onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))} /> Visible to the family
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary">Save reward</button>
        </div>
      </form>
    </Modal>
  );
}

function ChallengeModal({ value, onClose }: { value: Partial<Challenge> | null; onClose: () => void }) {
  const { saveChallenge } = useFamily();
  const [draft, setDraft] = useState<Partial<Challenge>>({});
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value ?? {});
  }
  return (
    <Modal open={!!value} onClose={onClose} title={value?.id ? "Edit challenge" : "New family challenge"}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await saveChallenge({
            id: draft.id,
            title: draft.title?.trim() ?? "",
            description: draft.description ?? "",
            metric: draft.metric ?? "tasks",
            target: draft.target ?? 20,
            starts_on: draft.starts_on!,
            ends_on: draft.ends_on!,
            reward_text: draft.reward_text ?? "",
          });
          onClose();
        }}
      >
        <div>
          <label className="label" htmlFor="ch-title">Challenge</label>
          <input id="ch-title" className="input" required maxLength={80} placeholder="e.g. 30 tasks this week" value={draft.title ?? ""} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
        </div>
        <div>
          <p className="label">Goal</p>
          <div className="flex items-center gap-2">
            <input type="number" min={1} className="input w-28" value={draft.target ?? 20} onChange={(e) => setDraft((d) => ({ ...d, target: Number(e.target.value) }))} aria-label="Target" />
            <Segmented value={draft.metric ?? "tasks"} onChange={(m) => setDraft((d) => ({ ...d, metric: m }))} options={[{ value: "tasks", label: "tasks" }, { value: "points", label: "points" }]} />
            <span className="text-sm text-muted">together</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="ch-start">Starts</label>
            <input id="ch-start" type="date" className="input" required value={draft.starts_on ?? ""} onChange={(e) => setDraft((d) => ({ ...d, starts_on: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="ch-end">Ends</label>
            <input id="ch-end" type="date" className="input" required min={draft.starts_on} value={draft.ends_on ?? ""} onChange={(e) => setDraft((d) => ({ ...d, ends_on: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ch-reward">Family reward</label>
          <input id="ch-reward" className="input" placeholder="e.g. Pizza night on Friday" value={draft.reward_text ?? ""} onChange={(e) => setDraft((d) => ({ ...d, reward_text: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary">Save challenge</button>
        </div>
      </form>
    </Modal>
  );
}
