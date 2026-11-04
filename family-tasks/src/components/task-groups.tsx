"use client";

import { AnimatePresence } from "motion/react";
import { endOfDay, isToday } from "date-fns";
import type { Task } from "@/lib/types";
import { isOverdue, sortTasks } from "@/lib/stats";
import { weekEnd } from "@/lib/dates";
import { TaskItem } from "./task-item";

export type Bucket = "overdue" | "today" | "week" | "later" | "someday" | "done";

const LABELS: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
  someday: "No due date",
  done: "Completed",
};

export function bucketOf(t: Task, now = new Date()): Bucket {
  if (t.status === "completed") return "done";
  if (!t.due_at) return "someday";
  const d = new Date(t.due_at);
  if (isOverdue(t, now)) return "overdue";
  if (isToday(d) || d <= endOfDay(now)) return "today";
  if (d <= weekEnd(now)) return "week";
  return "later";
}

export function TaskGroups({
  tasks,
  showAssignee = true,
  emptyText,
  order = ["overdue", "today", "week", "later", "someday", "done"],
  headers = true,
}: {
  headers?: boolean;
  tasks: Task[];
  showAssignee?: boolean;
  emptyText?: React.ReactNode;
  order?: Bucket[];
}) {
  const now = new Date();
  const groups = new Map<Bucket, Task[]>();
  for (const t of sortTasks(tasks, now)) {
    const b = bucketOf(t, now);
    if (!order.includes(b)) continue;
    groups.set(b, [...(groups.get(b) ?? []), t]);
  }
  const present = order.filter((b) => groups.get(b)?.length);
  if (!present.length) return <>{emptyText}</>;

  return (
    <div className="space-y-5">
      {present.map((b) => (
        <section key={b}>
          {headers && <div className="mb-1 flex items-center gap-2 px-3">
            <h3 className={b === "overdue" ? "section-title text-danger!" : "section-title"}>{LABELS[b]}</h3>
            <span className="text-xs text-muted">{groups.get(b)!.length}</span>
          </div>}
          <ul>
            <AnimatePresence initial={false}>
              {groups.get(b)!.map((t) => (
                <TaskItem key={t.id} task={t} showAssignee={showAssignee} />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}
    </div>
  );
}
