"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ListChecks, Plus, Search } from "lucide-react";
import { useFamily } from "@/components/family-provider";
import { TaskGroups } from "@/components/task-groups";
import { Avatar, EmptyState, PageHeader, Segmented } from "@/components/ui";
import { CATEGORIES } from "@/lib/constants";
import { isOverdue } from "@/lib/stats";

type StatusFilter = "todo" | "overdue" | "done" | "all";

export default function TasksPage() {
  const { tasks, members, userId } = useFamily();
  const [status, setStatus] = useState<StatusFilter>("todo");
  const [who, setWho] = useState<string | "all" | "none">("all");
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks.filter((t) => {
      if (status === "todo" && t.status !== "pending") return false;
      if (status === "done" && t.status !== "completed") return false;
      if (status === "overdue" && !isOverdue(t)) return false;
      if (who === "none" && t.assigned_to) return false;
      if (who !== "all" && who !== "none" && t.assigned_to !== who) return false;
      if (category !== "all" && t.category !== category) return false;
      if (needle && !(t.title.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [tasks, status, who, category, q]);

  const counts = {
    todo: tasks.filter((t) => t.status === "pending").length,
    overdue: tasks.filter((t) => isOverdue(t)).length,
  };

  return (
    <div className="animate-rise">
      <PageHeader
        title="All tasks"
        subtitle="Everything on the family's plate."
        actions={
          <Link href="/tasks/new" className="btn-primary hidden sm:inline-flex">
            <Plus className="size-4" /> New task
          </Link>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Segmented
          className="overflow-x-auto"
          value={status}
          onChange={setStatus}
          options={[
            { value: "todo", label: <>To do <span className="text-muted">{counts.todo}</span></> },
            { value: "overdue", label: <>Overdue {counts.overdue > 0 && <span className="text-danger">{counts.overdue}</span>}</> },
            { value: "done", label: "Completed" },
            { value: "all", label: "All" },
          ]}
        />
        <div className="relative flex-1 lg:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" />
        </div>
        <select className="input w-auto lg:ml-auto" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <button className="chip" data-active={who === "all"} onClick={() => setWho("all")}>Everyone</button>
        {members.map((m) => (
          <button key={m.user_id} className="chip shrink-0 pl-1" data-active={who === m.user_id} onClick={() => setWho(m.user_id)}>
            <Avatar profile={m.profile} size="xs" />
            {m.user_id === userId ? "Me" : m.profile.display_name}
          </button>
        ))}
        <button className="chip shrink-0" data-active={who === "none"} onClick={() => setWho("none")}>Unassigned</button>
      </div>

      <div className="card p-2 sm:p-3">
        <TaskGroups
          tasks={filtered}
          emptyText={
            <EmptyState
              icon={ListChecks}
              title={status === "done" ? "Nothing completed yet" : "No tasks match"}
              body={tasks.length ? "Try a different filter." : "Create the first task for your family."}
              action={!tasks.length && <Link href="/tasks/new" className="btn-secondary"><Plus className="size-4" /> New task</Link>}
            />
          }
        />
      </div>
    </div>
  );
}
