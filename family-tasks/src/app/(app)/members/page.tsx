"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, Crown, Link2, MoreHorizontal, RefreshCw, Shield, UserMinus } from "lucide-react";
import { useFamily } from "@/components/family-provider";
import { MemberCard } from "@/components/member-card";
import { Avatar, Modal, PageHeader } from "@/components/ui";
import { useToast } from "@/components/toast";
import type { Member } from "@/lib/types";

export default function MembersPage() {
  const { members, family, isAdmin, regenerateInvite, setRole, removeMember, userId } = useFamily();
  const toast = useToast();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [managing, setManaging] = useState<Member | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null);

  const link = typeof window !== "undefined" ? `${window.location.origin}/join/${family.invite_code}` : "";
  const copy = async (what: "code" | "link") => {
    await navigator.clipboard.writeText(what === "code" ? family.invite_code : link);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  const admins = members.filter((m) => m.role === "admin");
  const others = members.filter((m) => m.role !== "admin");

  return (
    <div className="animate-rise">
      <PageHeader title="Family" subtitle={`${members.length} ${members.length === 1 ? "member" : "members"} in ${family.name}`} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {[
            { title: "Admins", list: admins, icon: Crown },
            { title: "Members", list: others, icon: Shield },
          ].map(
            (g) =>
              g.list.length > 0 && (
                <section key={g.title}>
                  <h2 className="section-title mb-3 flex items-center gap-1.5">
                    <g.icon className="size-3.5" /> {g.title}
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {g.list.map((m) => (
                      <div key={m.user_id} className="relative">
                        <MemberCard member={m} />
                        {isAdmin && m.user_id !== userId && (
                          <button
                            onClick={() => setManaging(m)}
                            className="btn-ghost absolute top-3 right-14 size-8 px-0"
                            aria-label={`Manage ${m.profile.display_name}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ),
          )}
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <h2 className="text-[15px] font-semibold">Invite your family</h2>
            <p className="mt-1 text-sm text-muted">Each person signs up with their own account, then enters this code — or just opens the link.</p>
            <button
              onClick={() => copy("code")}
              className="mt-4 flex w-full items-center justify-between rounded-xl border border-dashed border-line-strong bg-surface-2/60 px-4 py-3 transition hover:bg-surface-2"
              aria-label="Copy invite code"
            >
              <span className="font-mono text-xl font-semibold tracking-[0.3em]" data-testid="invite-code">{family.invite_code}</span>
              {copied === "code" ? <Check className="size-4 text-success" /> : <Copy className="size-4 text-muted" />}
            </button>
            <button onClick={() => copy("link")} className="btn-secondary mt-2 w-full">
              {copied === "link" ? <Check className="size-4 text-success" /> : <Link2 className="size-4" />} Copy invite link
            </button>
            {isAdmin && (
              <button
                onClick={async () => {
                  await regenerateInvite();
                  toast.show({ title: "New invite code created", body: "The old code no longer works." });
                }}
                className="btn-ghost mt-1 w-full text-muted"
              >
                <RefreshCw className="size-4" /> Reset code
              </button>
            )}
          </div>
          <div className="card p-5 text-sm text-muted">
            <p className="font-medium text-ink">Roles</p>
            <p className="mt-2"><span className="font-medium text-ink-2">Admins</span> can assign tasks to anyone, set points, manage rewards, and manage members.</p>
            <p className="mt-2"><span className="font-medium text-ink-2">Members</span> see the whole family&apos;s board, tick off their own tasks, and add tasks for themselves.</p>
            <Link href="/activity" className="mt-3 inline-block font-medium text-accent hover:underline">View activity history →</Link>
          </div>
        </aside>
      </div>

      <Modal open={!!managing} onClose={() => setManaging(null)} title="Manage member">
        {managing && (
          <div>
            <div className="flex items-center gap-3">
              <Avatar profile={managing.profile} />
              <div>
                <p className="font-medium">{managing.profile.display_name}</p>
                <p className="text-sm text-muted capitalize">{managing.role}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-2">
              <button
                className="btn-secondary justify-start"
                onClick={async () => {
                  await setRole(managing.user_id, managing.role === "admin" ? "member" : "admin");
                  setManaging(null);
                }}
              >
                {managing.role === "admin" ? <Shield className="size-4" /> : <Crown className="size-4" />}
                {managing.role === "admin" ? "Make regular member" : "Make admin"}
              </button>
              <button
                className="btn-danger justify-start"
                onClick={() => {
                  setConfirmRemove(managing);
                  setManaging(null);
                }}
              >
                <UserMinus className="size-4" /> Remove from family
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!confirmRemove} onClose={() => setConfirmRemove(null)} title="Remove member?">
        <p className="text-sm text-muted">
          {confirmRemove?.profile.display_name} will lose access to {family.name}. Their open tasks become unassigned; their history is kept.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setConfirmRemove(null)}>Cancel</button>
          <button
            className="btn-danger"
            onClick={async () => {
              if (!confirmRemove) return;
              await removeMember(confirmRemove.user_id);
              setConfirmRemove(null);
            }}
          >
            Remove
          </button>
        </div>
      </Modal>
    </div>
  );
}
