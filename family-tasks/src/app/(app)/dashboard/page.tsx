"use client";

import Link from "next/link";
import { format } from "date-fns";
import { AlertCircle, ArrowRight, CheckCircle2, Circle, ListTodo, Plus, Sparkles, Trophy } from "lucide-react";
import clsx from "clsx";
import { useFamily } from "@/components/family-provider";
import { TaskGroups } from "@/components/task-groups";
import { ActivityFeed } from "@/components/activity-feed";
import { MemberCard } from "@/components/member-card";
import { EmptyState, PageHeader, ProgressBar, ProgressRing } from "@/components/ui";
import { challengeIsActive, challengeProgress, computeStats } from "@/lib/stats";
import { weekEnd } from "@/lib/dates";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const { me, members, tasks, activity, family, challenges, completions } = useFamily();
  const stats = computeStats(tasks);
  const we = weekEnd();
  const focus = tasks.filter(
    (t) => t.status === "pending" && (!t.due_at || new Date(t.due_at) <= we),
  );
  const recentlyDone = tasks
    .filter((t) => t.status === "completed")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, 5);
  const activeChallenge = family.gamification_enabled ? challenges.find((c) => challengeIsActive(c)) : undefined;

  return (
    <div className="animate-rise">
      <PageHeader
        title={`${greeting()}, ${me.profile.display_name.split(" ")[0]}`}
        subtitle={format(new Date(), "EEEE, d MMMM")}
        actions={
          <Link href="/tasks/new" className="btn-primary hidden sm:inline-flex">
            <Plus className="size-4" /> New task
          </Link>
        }
      />

      {/* Overview */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card flex flex-col items-center gap-5 p-5 sm:flex-row sm:gap-6 sm:p-6 lg:col-span-2">
          <ProgressRing value={stats.completion} size={128} stroke={11}>
            <div className="text-center">
              <p className="text-3xl font-semibold tracking-tight tabular-nums" data-testid="family-completion">
                {stats.completion}%
              </p>
              <p className="text-[11px] font-medium text-muted">this week</p>
            </div>
          </ProgressRing>
          <div className="grid w-full flex-1 grid-cols-3 gap-2 sm:gap-3">
            <Stat icon={CheckCircle2} tone="text-success" label="Completed" value={stats.completed} testId="stat-completed" />
            <Stat icon={Circle} tone="text-accent" label="Pending" value={stats.pending} testId="stat-pending" />
            <Stat icon={AlertCircle} tone="text-danger" label="Overdue" value={stats.overdue} testId="stat-overdue" />
          </div>
        </div>

        {activeChallenge ? (
          <ChallengeCard challenge={activeChallenge} progress={challengeProgress(activeChallenge, completions)} />
        ) : (
          <div className="card flex flex-col justify-between p-5 sm:p-6">
            <div>
              <p className="section-title">Family</p>
              <p className="mt-2 text-sm text-ink-2">
                {members.length} {members.length === 1 ? "member" : "members"} · {tasks.filter((t) => t.status === "pending").length} open tasks
              </p>
            </div>
            <Link href="/members" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              Invite family members <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}
      </div>

      {/* Members */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Everyone</h2>
          <Link href="/members" className="text-sm text-muted hover:text-ink">Manage</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((m) => (
            <MemberCard key={m.user_id} member={m} />
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-4 lg:grid-cols-5">
        <section className="card p-2 sm:p-3 lg:col-span-3">
          <div className="flex items-center justify-between px-3 pt-2 pb-3">
            <h2 className="text-[15px] font-semibold">Up next</h2>
            <Link href="/tasks" className="text-sm text-muted hover:text-ink">All tasks</Link>
          </div>
          <TaskGroups
            tasks={focus}
            order={["overdue", "today", "week", "someday"]}
            emptyText={
              <EmptyState
                icon={ListTodo}
                title="Nothing on the list"
                body="Add a few household tasks and assign them to the family."
                action={<Link href="/tasks/new" className="btn-secondary"><Plus className="size-4" /> Add a task</Link>}
              />
            }
          />
        </section>

        <div className="space-y-4 lg:col-span-2">
          <section className="card p-4 sm:p-5">
            <h2 className="mb-1 text-[15px] font-semibold">Recently completed</h2>
            {recentlyDone.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No completed tasks yet.</p>
            ) : (
              <TaskGroups tasks={recentlyDone} order={["done"]} headers={false} />
            )}
          </section>
          <section className="card p-4 sm:p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Activity</h2>
              <Link href="/activity" className="text-sm text-muted hover:text-ink">See all</Link>
            </div>
            {activity.length ? <ActivityFeed items={activity.slice(0, 6)} compact /> : <p className="py-6 text-center text-sm text-muted">No activity yet.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  label: string;
  value: number;
  testId: string;
}) {
  return (
    <div className="rounded-xl bg-surface-2/60 px-3 py-2.5 sm:px-4 sm:py-3">
      <Icon className={clsx("size-4", tone)} />
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums" data-testid={testId}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function ChallengeCard({ challenge, progress }: { challenge: import("@/lib/types").Challenge; progress: number }) {
  const pct = Math.min(100, Math.round((progress / challenge.target) * 100));
  const done = progress >= challenge.target;
  return (
    <Link href="/rewards" className="card relative block overflow-hidden p-5 transition hover:shadow-pop sm:p-6">
      <div className="absolute -top-10 -right-10 size-32 rounded-full bg-accent/10 blur-2xl" />
      <p className="section-title flex items-center gap-1.5">
        {done ? <Trophy className="size-3.5 text-amber-500" /> : <Sparkles className="size-3.5 text-accent" />}
        Family challenge
      </p>
      <p className="mt-2 text-[15px] font-semibold text-ink">{challenge.title}</p>
      <p className="mt-0.5 text-sm text-muted">
        {progress} / {challenge.target} {challenge.metric === "tasks" ? "tasks" : "points"}
        {challenge.reward_text && <> · 🎁 {challenge.reward_text}</>}
      </p>
      <ProgressBar value={pct} className="mt-4 h-2" barClass={done ? "bg-success" : "bg-accent"} />
      <p className="mt-2 text-xs text-muted">{done ? "Challenge complete! 🎉" : `Ends ${format(new Date(challenge.ends_on + "T00:00:00"), "EEE d MMM")}`}</p>
    </Link>
  );
}
