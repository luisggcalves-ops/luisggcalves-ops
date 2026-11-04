import { describe, expect, it } from "vitest";
import {
  challengeIsActive,
  challengeProgress,
  computeStats,
  inWeekScope,
  isOverdue,
  pointsBalance,
  pointsEarned,
  sortTasks,
  streak,
} from "@/lib/stats";
import type { Challenge, Completion, Redemption, Task } from "@/lib/types";

// Wednesday 4 Nov 2026, 12:00 local
const NOW = new Date(2026, 10, 4, 12, 0);
const at = (d: number, h = 12) => new Date(2026, 10, d, h, 0).toISOString();

let n = 0;
function task(p: Partial<Task>): Task {
  n++;
  return {
    id: `t${n}`,
    family_id: "f",
    title: `Task ${n}`,
    description: "",
    category: "other",
    priority: "medium",
    points: 10,
    assigned_to: "u1",
    created_by: "u1",
    due_at: null,
    recurrence_freq: null,
    recurrence_interval: 1,
    recurrence_weekdays: [],
    series_id: null,
    status: "pending",
    completed_at: null,
    completed_by: null,
    next_task_id: null,
    created_at: at(1),
    updated_at: at(1),
    ...p,
  };
}
const comp = (user: string, d: number, points = 10, h = 12): Completion => ({
  id: `c${++n}`,
  family_id: "f",
  task_id: null,
  user_id: user,
  task_title: "x",
  category: "other",
  points,
  completed_at: at(d, h),
});

describe("isOverdue", () => {
  it("pending + past due", () => expect(isOverdue(task({ due_at: at(3) }), NOW)).toBe(true));
  it("completed is never overdue", () =>
    expect(isOverdue(task({ due_at: at(3), status: "completed" }), NOW)).toBe(false));
  it("no date is never overdue", () => expect(isOverdue(task({}), NOW)).toBe(false));
});

describe("week scope + computeStats", () => {
  const tasks = [
    task({ due_at: at(3) }), // overdue (in scope)
    task({ due_at: at(6) }), // due Fri (in scope)
    task({}), // no date (in scope)
    task({ due_at: at(12) }), // next week (out)
    task({ status: "completed", completed_at: at(4, 9), due_at: at(4) }), // done this week (in)
    task({ status: "completed", completed_at: at(1), due_at: at(1) }), // done last week (out)
  ];

  it("filters to this week's plate", () => {
    expect(tasks.filter((t) => inWeekScope(t, NOW)).length).toBe(4);
  });

  it("computes completion %", () => {
    expect(computeStats(tasks, NOW)).toEqual({ total: 4, completed: 1, pending: 3, overdue: 1, completion: 25 });
  });

  it("empty is 0%", () => expect(computeStats([], NOW).completion).toBe(0));
});

describe("points", () => {
  const cs = [comp("u1", 2, 10), comp("u1", 4, 20), comp("u2", 4, 5)];
  const rs: Redemption[] = [{ id: "r", family_id: "f", reward_id: null, user_id: "u1", title: "x", cost: 15, created_at: at(4) }];
  it("earned (all time / since)", () => {
    expect(pointsEarned(cs, "u1")).toBe(30);
    expect(pointsEarned(cs, "u1", new Date(2026, 10, 3))).toBe(20);
  });
  it("balance subtracts redemptions", () => expect(pointsBalance(cs, rs, "u1")).toBe(15));
});

describe("streak", () => {
  it("counts consecutive days ending today", () => {
    const cs = [comp("u1", 4), comp("u1", 3), comp("u1", 2), comp("u1", 2, 5, 8), comp("u1", 1)];
    // days 4,3,2,1 → 4 days
    expect(streak(cs, "u1", NOW)).toBe(4);
  });
  it("still counts when the last completion was yesterday", () => {
    expect(streak([comp("u1", 3), comp("u1", 2)], "u1", NOW)).toBe(2);
  });
  it("breaks on a gap", () => {
    expect(streak([comp("u1", 4), comp("u1", 2)], "u1", NOW)).toBe(1);
    expect(streak([comp("u1", 1)], "u1", NOW)).toBe(0);
  });
});

describe("challenges", () => {
  const ch: Challenge = {
    id: "c", family_id: "f", title: "x", description: "", metric: "tasks", target: 3,
    starts_on: "2026-11-02", ends_on: "2026-11-08", reward_text: "", created_by: null, created_at: at(1),
  };
  const cs = [comp("u1", 2, 10, 0), comp("u2", 4), comp("u1", 8, 10, 23), comp("u1", 1), comp("u1", 9, 10, 1)];
  it("counts tasks within the inclusive date range", () => expect(challengeProgress(ch, cs)).toBe(3));
  it("sums points", () => expect(challengeProgress({ ...ch, metric: "points" }, cs)).toBe(30));
  it("active window", () => {
    expect(challengeIsActive(ch, NOW)).toBe(true);
    expect(challengeIsActive(ch, new Date(2026, 10, 8, 23))).toBe(true);
    expect(challengeIsActive(ch, new Date(2026, 10, 9, 0, 1))).toBe(false);
  });
});

describe("sortTasks", () => {
  it("overdue → soonest → priority, completed last", () => {
    const a = task({ title: "later", due_at: at(7) });
    const b = task({ title: "overdue", due_at: at(2) });
    const c = task({ title: "nodate-high", priority: "high" });
    const d = task({ title: "nodate-low", priority: "low" });
    const e = task({ title: "done", status: "completed", completed_at: at(4) });
    const f = task({ title: "soon", due_at: at(5) });
    expect(sortTasks([a, b, c, d, e, f], NOW).map((t) => t.title)).toEqual([
      "overdue", "soon", "later", "nodate-high", "nodate-low", "done",
    ]);
  });
});
