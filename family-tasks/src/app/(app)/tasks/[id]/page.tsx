"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, CalendarClock, Pencil, Repeat, SearchX, Star, Trash2, User, Flag, Tag, History } from "lucide-react";
import clsx from "clsx";
import { useFamily } from "@/components/family-provider";
import { TaskForm } from "@/components/task-form";
import { TaskCheckbox, canComplete } from "@/components/task-item";
import { ActivityFeed } from "@/components/activity-feed";
import { Avatar, EmptyState, Modal } from "@/components/ui";
import { useToast } from "@/components/toast";
import { getCategory, PRIORITIES } from "@/lib/constants";
import { describeRecurrence } from "@/lib/recurrence";
import { isOverdue } from "@/lib/stats";

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { tasks, memberById, updateTask, deleteTask, isAdmin, userId, activity, family, completions } = useFamily();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const task = tasks.find((t) => t.id === id);

  if (!task) {
    return (
      <EmptyState
        icon={SearchX}
        title="Task not found"
        body="It may have been deleted, or it's an older completed task."
        action={<Link href="/tasks" className="btn-secondary">Back to tasks</Link>}
      />
    );
  }

  const assignee = memberById(task.assigned_to);
  const creator = memberById(task.created_by);
  const completer = memberById(task.completed_by);
  const cat = getCategory(task.category);
  const prio = PRIORITIES.find((p) => p.id === task.priority)!;
  const done = task.status === "completed";
  const overdue = isOverdue(task);
  const canEdit = isAdmin || task.created_by === userId;
  const repeat = describeRecurrence(task);
  const history = activity.filter((a) => a.task_id === task.id);
  const seriesDone = task.series_id ? completions.filter((c) => tasks.some((t) => t.id === c.task_id && t.series_id === task.series_id)).length : 0;
  const nextOccurrence = task.next_task_id ? tasks.find((t) => t.id === task.next_task_id) : undefined;

  return (
    <div className="mx-auto max-w-3xl animate-rise">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => router.back()} className="btn-ghost -ml-3 h-8 text-muted">
          <ArrowLeft className="size-4" /> Back
        </button>
        {canEdit && !editing && (
          <div className="flex gap-1">
            <button className="btn-ghost h-9" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit
            </button>
            <button className="btn-ghost h-9 text-danger hover:text-danger" onClick={() => setConfirmDelete(true)} aria-label="Delete task">
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>

      <div className="card p-5 sm:p-7">
        {editing ? (
          <TaskForm
            initial={task}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={async (input) => {
              await updateTask(task.id, input);
              setEditing(false);
              toast.show({ tone: "success", title: "Task updated" });
            }}
          />
        ) : (
          <>
            <div className="flex items-start gap-4">
              <div className="pt-1">
                <TaskCheckbox task={task} size="lg" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", cat.tint)}>
                    <cat.icon className="size-3" /> {cat.label}
                  </span>
                  {done ? (
                    <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">Completed</span>
                  ) : overdue ? (
                    <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">Overdue</span>
                  ) : (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink">To do</span>
                  )}
                </div>
                <h1 className={clsx("mt-2 text-2xl font-semibold tracking-tight", done && "text-muted line-through decoration-line-strong")} data-testid="task-title">
                  {task.title}
                </h1>
                {task.description && <p className="mt-2 text-sm whitespace-pre-wrap text-ink-2">{task.description}</p>}
                {!canComplete(task, userId, isAdmin) && !done && (
                  <p className="mt-3 text-xs text-muted">Only {assignee?.profile.display_name ?? "the assignee"} or an admin can tick this off.</p>
                )}
              </div>
            </div>

            <dl className="mt-7 grid gap-x-6 gap-y-4 border-t border-line pt-6 sm:grid-cols-2">
              <Detail icon={User} label="Assigned to">
                {assignee ? (
                  <Link href={assignee.user_id === userId ? "/me" : `/members/${assignee.user_id}`} className="inline-flex items-center gap-2 hover:underline">
                    <Avatar profile={assignee.profile} size="xs" /> {assignee.profile.display_name}
                  </Link>
                ) : (
                  <span className="text-muted">Anyone</span>
                )}
              </Detail>
              <Detail icon={CalendarClock} label="Due">
                {task.due_at ? (
                  <span className={clsx(overdue && "font-medium text-danger")}>{format(new Date(task.due_at), "EEE d MMM yyyy, HH:mm")}</span>
                ) : (
                  <span className="text-muted">No due date</span>
                )}
              </Detail>
              <Detail icon={Flag} label="Priority">
                <span className="inline-flex items-center gap-2"><span className={clsx("size-2 rounded-full", prio.dot)} /> {prio.label}</span>
              </Detail>
              <Detail icon={Repeat} label="Repeats">
                {repeat ? (
                  <span>
                    {repeat}
                    {seriesDone > 0 && <span className="text-muted"> · done {seriesDone}×</span>}
                  </span>
                ) : (
                  <span className="text-muted">Doesn&apos;t repeat</span>
                )}
              </Detail>
              {family.gamification_enabled && (
                <Detail icon={Star} label="Points">{task.points}</Detail>
              )}
              <Detail icon={Tag} label="Created">
                {creator?.profile.display_name ?? "Someone"} · {format(new Date(task.created_at), "d MMM")}
              </Detail>
              {done && task.completed_at && (
                <Detail icon={History} label="Completed">
                  {completer?.profile.display_name ?? "Someone"} · {format(new Date(task.completed_at), "EEE d MMM, HH:mm")}
                </Detail>
              )}
            </dl>

            {nextOccurrence && (
              <Link href={`/tasks/${nextOccurrence.id}`} className="mt-6 flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3 text-sm hover:bg-line/60">
                <Repeat className="size-4 text-accent" />
                <span className="flex-1">Next occurrence</span>
                <span className="text-muted">{nextOccurrence.due_at && format(new Date(nextOccurrence.due_at), "EEE d MMM, HH:mm")}</span>
              </Link>
            )}
          </>
        )}
      </div>

      {history.length > 0 && !editing && (
        <section className="card mt-4 p-4 sm:p-5">
          <h2 className="mb-1 text-[15px] font-semibold">History</h2>
          <ActivityFeed items={history} compact />
        </section>
      )}

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this task?">
        <p className="text-sm text-muted">
          &ldquo;{task.title}&rdquo; will be removed for everyone.{task.recurrence_freq && " Future occurrences won't be created."} Completion history is kept.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
          <button
            className="btn-danger"
            onClick={async () => {
              await deleteTask(task.id);
              setConfirmDelete(false);
              toast.show({ title: "Task deleted", body: task.title });
              router.push("/tasks");
            }}
          >
            Delete task
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Detail({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted" />
      <div className="min-w-0">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="mt-0.5 text-sm text-ink">{children}</dd>
      </div>
    </div>
  );
}
