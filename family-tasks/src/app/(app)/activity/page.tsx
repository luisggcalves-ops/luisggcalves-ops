"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { History } from "lucide-react";
import { useFamily } from "@/components/family-provider";
import { ActivityFeed } from "@/components/activity-feed";
import { Avatar, EmptyState, PageHeader, Segmented } from "@/components/ui";
import { dayHeading } from "@/lib/dates";

type Kind = "all" | "completed" | "tasks" | "family";

export default function ActivityPage() {
  const { activity, members, userId } = useFamily();
  const [kind, setKind] = useState<Kind>("all");
  const [who, setWho] = useState<string>("all");

  const groups = useMemo(() => {
    const list = activity.filter((a) => {
      if (who !== "all" && a.actor_id !== who && a.subject_id !== who) return false;
      if (kind === "completed") return a.type === "task_completed";
      if (kind === "tasks") return a.type.startsWith("task_");
      if (kind === "family") return !a.type.startsWith("task_");
      return true;
    });
    const map = new Map<string, typeof list>();
    for (const a of list) {
      const k = format(new Date(a.created_at), "yyyy-MM-dd");
      map.set(k, [...(map.get(k) ?? []), a]);
    }
    return Array.from(map.entries());
  }, [activity, kind, who]);

  return (
    <div className="mx-auto max-w-3xl animate-rise">
      <PageHeader title="Activity" subtitle="A live history of everything happening in the family." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "All" },
            { value: "completed", label: "Completed" },
            { value: "tasks", label: "Tasks" },
            { value: "family", label: "Family" },
          ]}
        />
        <select className="input w-auto sm:ml-auto" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by member">
          <option value="all">Everyone</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.user_id === userId ? "Me" : m.profile.display_name}</option>
          ))}
        </select>
      </div>
      {groups.length === 0 ? (
        <div className="card"><EmptyState icon={History} title="No activity yet" body="Task updates and family changes will appear here in real time." /></div>
      ) : (
        <div className="space-y-4">
          {groups.map(([day, items]) => (
            <section key={day} className="card px-4 py-2 sm:px-5">
              <h2 className="section-title flex items-center justify-between pt-3 pb-1">
                {dayHeading(day + "T12:00:00")}
                <span className="flex -space-x-1.5">
                  {Array.from(new Set(items.map((i) => i.actor_id))).slice(0, 4).map((id) => {
                    const m = members.find((x) => x.user_id === id);
                    return m ? <Avatar key={id} profile={m.profile} size="xs" className="ring-2 ring-surface" /> : null;
                  })}
                </span>
              </h2>
              <ActivityFeed items={items} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
