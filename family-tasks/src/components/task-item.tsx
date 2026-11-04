"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { Check, Clock, Repeat, Star } from "lucide-react";
import clsx from "clsx";
import type { Task } from "@/lib/types";
import { getCategory, PRIORITIES } from "@/lib/constants";
import { formatDue } from "@/lib/dates";
import { describeRecurrence } from "@/lib/recurrence";
import { isOverdue } from "@/lib/stats";
import { useFamily } from "./family-provider";
import { useToast } from "./toast";
import { Avatar } from "./ui";

export function canComplete(task: Task, userId: string, isAdmin: boolean) {
  return isAdmin || !task.assigned_to || task.assigned_to === userId;
}

export function TaskCheckbox({ task, size = "md" }: { task: Task; size?: "md" | "lg" }) {
  const { toggleTask, userId, isAdmin, family } = useFamily();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const done = task.status === "completed";
  const allowed = canComplete(task, userId, isAdmin);

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!allowed || busy) return;
    setBusy(true);
    try {
      await toggleTask(task);
      if (!done) {
        toast.show({
          tone: "success",
          title: "Nice work!",
          body:
            family.gamification_enabled && task.points > 0
              ? `${task.title} · +${task.points} pts`
              : task.title,
          action: {
            label: "Undo",
            onClick: () => toggleTask(task).catch(() => {}),
          },
        });
      }
    } catch {
      /* toast already shown by provider */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
      disabled={!allowed}
      onClick={onClick}
      title={allowed ? undefined : "Only the assignee or an admin can complete this"}
      className={clsx(
        "group/check relative grid shrink-0 place-items-center rounded-full border-[1.5px] transition-colors",
        size === "lg" ? "size-8" : "size-[22px]",
        done ? "border-success bg-success" : "border-line-strong hover:border-success",
        !allowed && "cursor-not-allowed opacity-40",
      )}
    >
      <motion.span
        initial={false}
        animate={{ scale: done ? 1 : 0, opacity: done ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 600, damping: 25 }}
      >
        <Check className={clsx("text-white", size === "lg" ? "size-4" : "size-3")} strokeWidth={3} />
      </motion.span>
      {!done && allowed && (
        <Check
          className={clsx(
            "absolute text-success opacity-0 transition-opacity group-hover/check:opacity-60",
            size === "lg" ? "size-4" : "size-3",
          )}
          strokeWidth={3}
        />
      )}
    </button>
  );
}

export function TaskItem({ task, showAssignee = true }: { task: Task; showAssignee?: boolean }) {
  const { memberById, family } = useFamily();
  const assignee = memberById(task.assigned_to);
  const cat = getCategory(task.category);
  const CatIcon = cat.icon;
  const overdue = isOverdue(task);
  const done = task.status === "completed";
  const repeat = describeRecurrence(task);
  const prio = PRIORITIES.find((p) => p.id === task.priority)!;

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
    >
      <Link
        href={`/tasks/${task.id}`}
        className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2"
        data-testid="task-item"
        data-status={task.status}
      >
        <TaskCheckbox task={task} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {task.priority === "high" && !done && (
              <span className={clsx("size-1.5 shrink-0 rounded-full", prio.dot)} title="High priority" />
            )}
            <p
              className={clsx(
                "truncate text-sm font-medium transition-colors",
                done ? "text-muted line-through decoration-line-strong" : "text-ink",
              )}
            >
              {task.title}
            </p>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <CatIcon className="size-3" />
              {cat.label}
            </span>
            {task.due_at && !done && (
              <span className={clsx("inline-flex items-center gap-1", overdue && "font-medium text-danger")}>
                <Clock className="size-3" />
                {overdue ? `Overdue · ${formatDue(task.due_at)}` : formatDue(task.due_at)}
              </span>
            )}
            {repeat && (
              <span className="inline-flex items-center gap-1">
                <Repeat className="size-3" />
                {repeat}
              </span>
            )}
            {family.gamification_enabled && task.points > 0 && (
              <span className="inline-flex items-center gap-1">
                <Star className="size-3" />
                {task.points}
              </span>
            )}
          </div>
        </div>
        {showAssignee && <Avatar profile={assignee?.profile} size="sm" />}
      </Link>
    </motion.li>
  );
}
