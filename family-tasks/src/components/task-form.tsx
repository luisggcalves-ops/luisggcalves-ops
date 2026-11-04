"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, Loader2, Repeat, X } from "lucide-react";
import clsx from "clsx";
import { addDays, format } from "date-fns";
import type { Priority, RecurrenceFreq, Task, TaskInput } from "@/lib/types";
import { CATEGORIES, PRIORITIES, WEEKDAYS } from "@/lib/constants";
import { fromDateTimeInputs, toDateInput, toTimeInput } from "@/lib/dates";
import { alignToWeekdays, describeRecurrence } from "@/lib/recurrence";
import { useFamily } from "./family-provider";
import { Avatar, Segmented } from "./ui";

type RepeatMode = "none" | "daily" | "weekly" | "monthly" | "custom";

function repeatModeOf(t?: Partial<Task>): RepeatMode {
  if (!t?.recurrence_freq) return "none";
  const n = t.recurrence_interval ?? 1;
  if (n !== 1) return "custom";
  if (t.recurrence_freq === "weekly" && (t.recurrence_weekdays?.length ?? 0) > 1) return "custom";
  return t.recurrence_freq;
}

export function TaskForm({
  initial,
  defaultAssignee,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Task;
  defaultAssignee?: string | null;
  submitLabel: string;
  onSubmit: (input: TaskInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const { members, isAdmin, userId, family } = useFamily();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [assignee, setAssignee] = useState<string | null>(
    initial ? initial.assigned_to : (defaultAssignee ?? (isAdmin ? null : userId)),
  );
  const [category, setCategory] = useState(initial?.category ?? "cleaning");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "medium");
  const [points, setPoints] = useState(initial?.points ?? 10);
  const [date, setDate] = useState(toDateInput(initial?.due_at ?? null));
  const [time, setTime] = useState(toTimeInput(initial?.due_at ?? null));
  const [mode, setMode] = useState<RepeatMode>(repeatModeOf(initial));
  const [customFreq, setCustomFreq] = useState<RecurrenceFreq>(initial?.recurrence_freq ?? "weekly");
  const [step, setStep] = useState(initial?.recurrence_interval ?? 1);
  const [weekdays, setWeekdays] = useState<number[]>(initial?.recurrence_weekdays ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // members can only assign to themselves (or leave unassigned)
  const assignable = isAdmin ? members : members.filter((m) => m.user_id === userId);

  const recurrence = useMemo(() => {
    if (mode === "none") return { recurrence_freq: null, recurrence_interval: 1, recurrence_weekdays: [] as number[] };
    if (mode === "custom")
      return {
        recurrence_freq: customFreq,
        recurrence_interval: Math.max(1, step || 1),
        recurrence_weekdays: customFreq === "weekly" ? weekdays : [],
      };
    return {
      recurrence_freq: mode as RecurrenceFreq,
      recurrence_interval: 1,
      recurrence_weekdays: mode === "weekly" ? weekdays.slice(0, 1) : [],
    };
  }, [mode, customFreq, step, weekdays]);

  const chooseMode = (m: RepeatMode) => {
    setMode(m);
    if (m !== "none" && !date) setDate(format(new Date(), "yyyy-MM-dd"));
    if ((m === "weekly" || m === "custom") && weekdays.length === 0) {
      const base = date ? new Date(date + "T12:00:00") : new Date();
      setWeekdays([base.getDay()]);
    }
  };

  const toggleWeekday = (d: number) => {
    if (mode === "weekly") return setWeekdays([d]);
    setWeekdays((ws) => (ws.includes(d) ? ws.filter((x) => x !== d) : [...ws, d]));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError("Give the task a title.");
    if (recurrence.recurrence_freq && !date) return setError("Recurring tasks need a start date.");

    let due = fromDateTimeInputs(date, time);
    // first occurrence of a weekday rule should land on one of those days
    if (due && recurrence.recurrence_freq === "weekly" && recurrence.recurrence_weekdays.length) {
      due = alignToWeekdays(new Date(due), recurrence.recurrence_weekdays).toISOString();
    }

    setBusy(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        assigned_to: assignee,
        category,
        priority,
        points: isAdmin ? points : (initial?.points ?? 5),
        due_at: due,
        ...recurrence,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the task");
    } finally {
      setBusy(false);
    }
  };

  const quickDates = [
    { label: "Today", value: format(new Date(), "yyyy-MM-dd") },
    { label: "Tomorrow", value: format(addDays(new Date(), 1), "yyyy-MM-dd") },
    { label: "In a week", value: format(addDays(new Date(), 7), "yyyy-MM-dd") },
  ];

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <input
          autoFocus={!initial}
          className="w-full bg-transparent text-xl font-semibold tracking-tight text-ink placeholder:text-muted/60 focus:outline-none sm:text-2xl"
          placeholder="What needs doing?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
          aria-label="Title"
          name="title"
        />
        <textarea
          className="mt-2 w-full resize-none bg-transparent text-sm text-ink-2 placeholder:text-muted/70 focus:outline-none"
          placeholder="Add details (optional)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
          aria-label="Description"
        />
      </div>

      {/* Assignee */}
      <Field label="Assign to">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="chip" data-active={assignee === null} onClick={() => setAssignee(null)}>
            Anyone
          </button>
          {assignable.map((m) => (
            <button
              key={m.user_id}
              type="button"
              className="chip pl-1"
              data-active={assignee === m.user_id}
              onClick={() => setAssignee(m.user_id)}
            >
              <Avatar profile={m.profile} size="xs" />
              {m.user_id === userId ? "Me" : m.profile.display_name}
            </button>
          ))}
        </div>
        {!isAdmin && <p className="mt-1.5 text-xs text-muted">Only family admins can assign tasks to other people.</p>}
      </Field>

      {/* Category */}
      <Field label="Category">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className="chip" data-active={category === c.id} onClick={() => setCategory(c.id)}>
              <c.icon className="size-3.5" />
              {c.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Priority">
          <Segmented
            className="w-full"
            value={priority}
            onChange={setPriority}
            options={PRIORITIES.map((p) => ({
              value: p.id,
              label: (
                <>
                  <span className={clsx("size-1.5 rounded-full", p.dot)} />
                  {p.label}
                </>
              ),
            }))}
          />
        </Field>
        {family.gamification_enabled && isAdmin && (
          <Field label="Points">
            <div className="flex gap-2">
              {[5, 10, 20, 50].map((p) => (
                <button key={p} type="button" className="chip flex-1 justify-center" data-active={points === p} onClick={() => setPoints(p)}>
                  {p}
                </button>
              ))}
              <input
                type="number"
                min={0}
                max={1000}
                className="input h-8 w-20 text-center"
                value={points}
                onChange={(e) => setPoints(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))}
                aria-label="Custom points"
              />
            </div>
          </Field>
        )}
      </div>

      {/* Due date */}
      <Field label="Due">
        <div className="flex flex-wrap items-center gap-2">
          {quickDates.map((q) => (
            <button key={q.label} type="button" className="chip" data-active={date === q.value} onClick={() => setDate(q.value)}>
              {q.label}
            </button>
          ))}
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input type="date" className="input h-8 w-auto pl-9" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Due date" />
          </div>
          <input type="time" className="input h-8 w-auto" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Due time" disabled={!date} />
          {date && mode === "none" && (
            <button type="button" className="btn-ghost h-8 px-2 text-muted" onClick={() => { setDate(""); setTime(""); }} aria-label="Clear date">
              <X className="size-4" />
            </button>
          )}
        </div>
      </Field>

      {/* Recurrence */}
      <Field label="Repeat">
        <Segmented
          className="w-full overflow-x-auto"
          value={mode}
          onChange={chooseMode}
          options={[
            { value: "none", label: "Never" },
            { value: "daily", label: "Daily" },
            { value: "weekly", label: "Weekly" },
            { value: "monthly", label: "Monthly" },
            { value: "custom", label: "Custom" },
          ]}
        />
        <AnimatePresence initial={false}>
          {mode !== "none" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-3 rounded-xl bg-surface-2/60 p-3">
                {mode === "custom" && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-ink-2">Every</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      className="input h-8 w-16 text-center"
                      value={step}
                      onChange={(e) => setStep(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                      aria-label="Repeat interval"
                    />
                    <select className="input h-8 w-auto" value={customFreq} onChange={(e) => setCustomFreq(e.target.value as RecurrenceFreq)} aria-label="Repeat unit">
                      <option value="daily">{step === 1 ? "day" : "days"}</option>
                      <option value="weekly">{step === 1 ? "week" : "weeks"}</option>
                      <option value="monthly">{step === 1 ? "month" : "months"}</option>
                    </select>
                  </div>
                )}
                {(mode === "weekly" || (mode === "custom" && customFreq === "weekly")) && (
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleWeekday(d)}
                        aria-pressed={weekdays.includes(d)}
                        className={clsx(
                          "h-9 flex-1 rounded-lg text-xs font-semibold transition",
                          weekdays.includes(d) ? "bg-ink text-surface" : "bg-surface text-muted hover:text-ink",
                        )}
                      >
                        {WEEKDAYS[d].slice(0, 2)}
                      </button>
                    ))}
                  </div>
                )}
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Repeat className="size-3.5" />
                  {describeRecurrence(recurrence)}
                  {date && <> · starting {format(new Date(date + "T12:00:00"), "EEE d MMM")}</>}. The next one is created when this is ticked off.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Field>

      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-primary min-w-28" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label">{label}</p>
      {children}
    </div>
  );
}
