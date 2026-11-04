"use client";

import Link from "next/link";
import { useState } from "react";
import { format } from "date-fns";
import { CalendarCheck, Flame, ListTodo, Plus, Repeat, Star, Trophy } from "lucide-react";
import type { Member } from "@/lib/types";
import { useFamily } from "./family-provider";
import { TaskGroups } from "./task-groups";
import { Avatar, EmptyState, ProgressRing, Segmented } from "./ui";
import { computeStats, pointsBalance, pointsEarned, streak } from "@/lib/stats";
import { dayHeading, weekStart } from "@/lib/dates";
import { describeRecurrence } from "@/lib/recurrence";
import { getCategory } from "@/lib/constants";

type Tab = "todo" | "history" | "routines";

export function MemberView({ member }: { member: Member }) {
  const { tasks, completions, redemptions, family, userId, isAdmin } = useFamily();
  const [tab, setTab] = useState<Tab>("todo");
  const isMe = member.user_id === userId;
  const mine = tasks.filter((t) => t.assigned_to === member.user_id);
  const stats = computeStats(mine);
  const pending = mine.filter((t) => t.status === "pending");
  const history = completions.filter((c) => c.user_id === member.user_id);
  const st = streak(completions, member.user_id);

  // responsibilities = one entry per recurring series still active
  const routines = Array.from(
    new Map(
      pending.filter((t) => t.recurrence_freq).map((t) => [t.series_id ?? t.id, t]),
    ).values(),
  );

  const byDay = new Map<string, typeof history>();
  for (const c of history.slice(0, 200)) {
    const k = format(new Date(c.completed_at), "yyyy-MM-dd");
    byDay.set(k, [...(byDay.get(k) ?? []), c]);
  }

  const first = member.profile.display_name.split(" ")[0];

  return (
    <div className="animate-rise">
      {/* Profile header */}
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex flex-1 items-center gap-4">
            <Avatar profile={member.profile} size="xl" />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{isMe ? "My tasks" : member.profile.display_name}</h1>
              <p className="mt-0.5 text-sm text-muted">
                {isMe ? member.profile.display_name + " · " : ""}
                <span className="capitalize">{member.role}</span> · joined {format(new Date(member.joined_at), "MMM yyyy")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Pill icon={Flame} tone="text-orange-500">{st} day streak</Pill>
                <Pill icon={CalendarCheck} tone="text-success">{history.length} completed</Pill>
                {family.gamification_enabled && (
                  <Pill icon={Star} tone="text-amber-500">
                    {pointsEarned(completions, member.user_id, weekStart())} pts this week · {pointsBalance(completions, redemptions, member.user_id)} balance
                  </Pill>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5 sm:pr-2">
            <ProgressRing value={stats.completion} size={104} stroke={9}>
              <div className="text-center">
                <p className="text-2xl font-semibold tabular-nums">{stats.completion}%</p>
                <p className="text-[10px] text-muted">this week</p>
              </div>
            </ProgressRing>
            <dl className="space-y-1 text-sm">
              <div className="flex gap-2"><dt className="w-16 text-muted">Done</dt><dd className="font-medium tabular-nums">{stats.completed}</dd></div>
              <div className="flex gap-2"><dt className="w-16 text-muted">To do</dt><dd className="font-medium tabular-nums">{stats.pending}</dd></div>
              <div className="flex gap-2"><dt className="w-16 text-muted">Overdue</dt><dd className={stats.overdue ? "font-medium text-danger tabular-nums" : "font-medium tabular-nums"}>{stats.overdue}</dd></div>
            </dl>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "todo", label: <>To do <span className="text-muted">{pending.length}</span></> },
            { value: "routines", label: <>Responsibilities <span className="text-muted">{routines.length}</span></> },
            { value: "history", label: "History" },
          ]}
        />
        {(isMe || isAdmin) && (
          <Link href={`/tasks/new?assignee=${member.user_id}`} className="btn-secondary">
            <Plus className="size-4" /> {isMe ? "Add task" : `Assign to ${first}`}
          </Link>
        )}
      </div>

      <div className="card mt-4 p-2 sm:p-3">
        {tab === "todo" && (
          <TaskGroups
            tasks={pending}
            showAssignee={false}
            order={["overdue", "today", "week", "later", "someday"]}
            emptyText={<EmptyState icon={Trophy} title="All clear!" body={isMe ? "You have nothing left to do. Enjoy it." : `${first} has nothing left to do.`} />}
          />
        )}

        {tab === "routines" &&
          (routines.length ? (
            <ul>
              {routines.map((t) => {
                const cat = getCategory(t.category);
                return (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-surface-2">
                      <span className={`grid size-9 place-items-center rounded-xl ${cat.tint}`}>
                        <cat.icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <p className="flex items-center gap-1 text-xs text-muted"><Repeat className="size-3" /> {describeRecurrence(t)}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={Repeat} title="No recurring responsibilities" body="Recurring tasks assigned here show up as ongoing responsibilities." />
          ))}

        {tab === "history" &&
          (history.length ? (
            <div className="space-y-4 p-1">
              {Array.from(byDay.entries()).map(([day, items]) => (
                <section key={day}>
                  <h3 className="section-title px-2 pb-1">{dayHeading(day + "T12:00:00")}</h3>
                  <ul>
                    {items.map((c) => {
                      const cat = getCategory(c.category);
                      return (
                        <li key={c.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                          <span className={`grid size-8 place-items-center rounded-lg ${cat.tint}`}>
                            <cat.icon className="size-3.5" />
                          </span>
                          <p className="flex-1 truncate text-sm">{c.task_title}</p>
                          <span className="text-xs text-muted tabular-nums">{format(new Date(c.completed_at), "HH:mm")}</span>
                          {family.gamification_enabled && c.points > 0 && (
                            <span className="w-12 text-right text-xs font-medium text-success tabular-nums">+{c.points}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState icon={ListTodo} title="No history yet" body="Completed tasks will be recorded here." />
          ))}
      </div>
    </div>
  );
}

function Pill({ icon: Icon, tone, children }: { icon: React.ComponentType<{ className?: string }>; tone: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-2">
      <Icon className={`size-3.5 ${tone}`} />
      {children}
    </span>
  );
}
