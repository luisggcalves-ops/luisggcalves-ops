"use client";

import Link from "next/link";
import { Flame, Star } from "lucide-react";
import type { Member } from "@/lib/types";
import { avatarColor } from "@/lib/constants";
import { computeStats, pointsEarned, streak } from "@/lib/stats";
import { weekStart } from "@/lib/dates";
import { useFamily } from "./family-provider";
import { Avatar, ProgressBar } from "./ui";

export function MemberCard({ member }: { member: Member }) {
  const { tasks, completions, family, userId } = useFamily();
  const mine = tasks.filter((t) => t.assigned_to === member.user_id);
  const s = computeStats(mine);
  const weekPts = pointsEarned(completions, member.user_id, weekStart());
  const st = streak(completions, member.user_id);
  const color = avatarColor(member.profile.avatar_color);

  return (
    <Link
      href={member.user_id === userId ? "/me" : `/members/${member.user_id}`}
      className="card group block p-4 transition hover:-translate-y-0.5 hover:shadow-pop"
      data-testid="member-card"
    >
      <div className="flex items-center gap-3">
        <Avatar profile={member.profile} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {member.profile.display_name}
            {member.user_id === userId && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}
          </p>
          <p className="text-xs text-muted capitalize">{member.role}</p>
        </div>
        <p className="text-lg font-semibold tabular-nums text-ink">{s.completion}%</p>
      </div>
      <ProgressBar value={s.completion} className="mt-4" barClass={color.bar} />
      <div className="mt-3 flex items-center gap-3 text-xs text-muted">
        <span><span className="font-medium text-ink">{s.completed}</span> done</span>
        <span><span className="font-medium text-ink">{s.pending}</span> to do</span>
        {s.overdue > 0 && <span className="font-medium text-danger">{s.overdue} overdue</span>}
        <span className="ml-auto flex items-center gap-2">
          {st > 1 && (
            <span className="inline-flex items-center gap-0.5" title={`${st}-day streak`}>
              <Flame className="size-3 text-orange-500" />
              {st}
            </span>
          )}
          {family.gamification_enabled && (
            <span className="inline-flex items-center gap-0.5" title="Points this week">
              <Star className="size-3 text-amber-500" />
              {weekPts}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}
