"use client";

import Link from "next/link";
import { ArrowRightLeft, CheckCircle2, Gift, LogOut, PlusCircle, RotateCcw, Trash2, UserPlus } from "lucide-react";
import clsx from "clsx";
import type { Activity } from "@/lib/types";
import { relativeTime } from "@/lib/dates";
import { useFamily } from "./family-provider";
import { Avatar } from "./ui";

const META: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  task_completed: { icon: CheckCircle2, color: "text-success" },
  task_created: { icon: PlusCircle, color: "text-accent" },
  task_assigned: { icon: ArrowRightLeft, color: "text-accent" },
  task_reopened: { icon: RotateCcw, color: "text-warning" },
  task_deleted: { icon: Trash2, color: "text-muted" },
  member_joined: { icon: UserPlus, color: "text-success" },
  member_left: { icon: LogOut, color: "text-muted" },
  reward_redeemed: { icon: Gift, color: "text-warning" },
};

export function ActivityFeed({ items, compact }: { items: Activity[]; compact?: boolean }) {
  const { memberById, tasks, family } = useFamily();

  return (
    <ul className="relative">
      {items.map((a, i) => {
        const actor = memberById(a.actor_id);
        const subject = memberById(a.subject_id);
        const m = META[a.type] ?? META.task_created;
        const Icon = m.icon;
        const actorName = actor?.profile.display_name ?? "Someone";
        const subjName = subject?.profile.display_name ?? "someone";
        const title = a.meta.title ? <span className="font-medium text-ink">{a.meta.title}</span> : null;
        const taskExists = a.task_id && tasks.some((t) => t.id === a.task_id);

        let text: React.ReactNode;
        switch (a.type) {
          case "task_completed":
            text = (
              <>
                {a.subject_id && a.subject_id !== a.actor_id ? <>{actorName} completed {title} for {subjName}</> : <>{actorName} completed {title}</>}
                {family.gamification_enabled && !!a.meta.points && <span className="ml-1 text-success">+{a.meta.points}</span>}
              </>
            );
            break;
          case "task_created":
            text = (
              <>
                {actorName} created {title}
                {subject && subject.user_id !== a.actor_id && <> for {subjName}</>}
              </>
            );
            break;
          case "task_assigned":
            text = <>{actorName} assigned {title} to {subjName}</>;
            break;
          case "task_reopened":
            text = <>{actorName} reopened {title}</>;
            break;
          case "task_deleted":
            text = <>{actorName} deleted {title}</>;
            break;
          case "member_joined":
            text = <>{subject?.profile.display_name ?? actorName} joined the family{a.meta.role === "admin" ? " as admin" : ""}</>;
            break;
          case "member_left":
            text = a.actor_id === a.subject_id ? <>{actorName} left the family</> : <>{actorName} removed {subjName}</>;
            break;
          case "reward_redeemed":
            text = <>{actorName} redeemed {title} <span className="text-muted">· {a.meta.cost} pts</span></>;
            break;
          default:
            text = a.type;
        }

        const body = (
          <div className={clsx("flex gap-3", compact ? "py-2" : "py-3")}>
            <div className="relative">
              <Avatar profile={actor?.profile} size="sm" />
              <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-surface">
                <Icon className={clsx("size-3.5", m.color)} />
              </span>
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm text-ink-2">{text}</p>
              <p className="mt-0.5 text-xs text-muted">{relativeTime(a.created_at)}</p>
            </div>
          </div>
        );
        return (
          <li key={a.id} className={clsx(i > 0 && "border-t border-line/60")}>
            {taskExists ? (
              <Link href={`/tasks/${a.task_id}`} className="-mx-2 block rounded-xl px-2 transition-colors hover:bg-surface-2">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
