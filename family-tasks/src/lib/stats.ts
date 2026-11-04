import type { Challenge, Completion, Redemption, Task } from "./types";
import { PRIORITY_RANK } from "./constants";
import { weekEnd, weekStart } from "./dates";
import { differenceInCalendarDays, startOfDay } from "date-fns";

export function isOverdue(t: Task, now = new Date()): boolean {
  return t.status === "pending" && !!t.due_at && new Date(t.due_at) < now;
}

/**
 * Tasks that are "on the plate" this week: anything due this week, anything
 * still pending without a date or overdue, and anything completed this week.
 * Future recurring occurrences (due next week+) are excluded.
 */
export function inWeekScope(t: Task, now = new Date()): boolean {
  const ws = weekStart(now);
  const we = weekEnd(now);
  if (t.status === "completed") {
    return !!t.completed_at && new Date(t.completed_at) >= ws;
  }
  if (!t.due_at) return true;
  return new Date(t.due_at) <= we;
}

export interface TaskStats {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  /** 0–100 */
  completion: number;
}

export function computeStats(tasks: Task[], now = new Date()): TaskStats {
  const scoped = tasks.filter((t) => inWeekScope(t, now));
  const completed = scoped.filter((t) => t.status === "completed").length;
  const pending = scoped.length - completed;
  const overdue = scoped.filter((t) => isOverdue(t, now)).length;
  return {
    total: scoped.length,
    completed,
    pending,
    overdue,
    completion: scoped.length ? Math.round((completed / scoped.length) * 100) : 0,
  };
}

export function pointsEarned(completions: Completion[], userId: string, since?: Date): number {
  return completions
    .filter((c) => c.user_id === userId && (!since || new Date(c.completed_at) >= since))
    .reduce((s, c) => s + c.points, 0);
}

export function pointsBalance(completions: Completion[], redemptions: Redemption[], userId: string) {
  const spent = redemptions.filter((r) => r.user_id === userId).reduce((s, r) => s + r.cost, 0);
  return pointsEarned(completions, userId) - spent;
}

/** Consecutive days (ending today or yesterday) with at least one completion. */
export function streak(completions: Completion[], userId: string, now = new Date()): number {
  const days = new Set(
    completions
      .filter((c) => c.user_id === userId)
      .map((c) => startOfDay(new Date(c.completed_at)).getTime()),
  );
  let cursor = startOfDay(now);
  if (!days.has(cursor.getTime())) cursor = new Date(cursor.getTime() - 86400000);
  let n = 0;
  while (days.has(cursor.getTime())) {
    n++;
    cursor = startOfDay(new Date(cursor.getTime() - 86400000 / 2)); // DST-safe step back
  }
  return n;
}

export function challengeProgress(ch: Challenge, completions: Completion[]): number {
  const start = new Date(ch.starts_on + "T00:00:00");
  const end = new Date(ch.ends_on + "T23:59:59.999");
  const inRange = completions.filter((c) => {
    const d = new Date(c.completed_at);
    return d >= start && d <= end;
  });
  return ch.metric === "tasks" ? inRange.length : inRange.reduce((s, c) => s + c.points, 0);
}

export function challengeIsActive(ch: Challenge, now = new Date()): boolean {
  const today = startOfDay(now);
  return (
    differenceInCalendarDays(new Date(ch.ends_on + "T00:00:00"), today) >= 0 &&
    differenceInCalendarDays(today, new Date(ch.starts_on + "T00:00:00")) >= 0
  );
}

/** Pending first (overdue → due soonest → priority), then completed (newest first). */
export function sortTasks(tasks: Task[], now = new Date()): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
    if (a.status === "completed") {
      return (b.completed_at ?? "").localeCompare(a.completed_at ?? "");
    }
    const ao = isOverdue(a, now) ? 0 : 1;
    const bo = isOverdue(b, now) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const bd = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });
}
