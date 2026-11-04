"use client";

import { useState } from "react";
import { Bell, Home, LogOut, Moon, Palette, Sun, Monitor, UserRound, Loader2 } from "lucide-react";
import clsx from "clsx";
import { useFamily } from "@/components/family-provider";
import { Avatar, Modal, PageHeader, Segmented, Toggle } from "@/components/ui";
import { useToast } from "@/components/toast";
import { AVATAR_COLORS, avatarColor } from "@/lib/constants";
import type { NotificationPrefs } from "@/lib/types";

const EMOJIS = ["", "🦊", "🐼", "🐯", "🦁", "🐸", "🐙", "🦄", "🐶", "🐱", "🌻", "⚽️", "🎸", "🚀", "🌈", "🍕"];
type Theme = "system" | "light" | "dark";

export default function SettingsPage() {
  const { me, family, isAdmin, updateProfile, updateFamily, removeMember, members, userId } = useFamily();
  const toast = useToast();
  const [name, setName] = useState(me.profile.display_name);
  const [familyName, setFamilyName] = useState(family.name);
  const [savingName, setSavingName] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const t = localStorage.getItem("hearth-theme");
      if (t === "light" || t === "dark") return t;
    } catch {}
    return "system";
  });
  const [confirmLeave, setConfirmLeave] = useState(false);
  // this page only renders client-side (inside the loaded FamilyProvider)
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const prefs = me.profile.notification_prefs;

  const applyTheme = (t: Theme) => {
    setTheme(t);
    try {
      if (t === "system") localStorage.removeItem("hearth-theme");
      else localStorage.setItem("hearth-theme", t);
    } catch {}
    const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  };

  const setPref = async (key: keyof NotificationPrefs, value: boolean) => {
    if (key === "browser" && value && permission !== "granted") {
      if (permission === "unsupported") return;
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p !== "granted") {
        toast.show({ tone: "warning", title: "Browser notifications are blocked", body: "Allow them in your browser's site settings." });
        return;
      }
    }
    await updateProfile({ notification_prefs: { ...prefs, [key]: value } });
  };

  const soleAdmin = isAdmin && members.filter((m) => m.role === "admin").length === 1 && members.length > 1;

  return (
    <div className="mx-auto max-w-3xl animate-rise">
      <PageHeader title="Settings" />

      <div className="space-y-4">
        <Section icon={UserRound} title="Profile">
          <div className="flex items-center gap-4">
            <Avatar profile={{ ...me.profile, display_name: name || me.profile.display_name }} size="lg" />
            <form
              className="flex flex-1 gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!name.trim()) return;
                setSavingName(true);
                try {
                  await updateProfile({ display_name: name.trim() });
                  toast.show({ tone: "success", title: "Profile updated" });
                } finally {
                  setSavingName(false);
                }
              }}
            >
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Display name" />
              <button className="btn-secondary" disabled={savingName || name.trim() === me.profile.display_name}>
                {savingName ? <Loader2 className="size-4 animate-spin" /> : "Save"}
              </button>
            </form>
          </div>
          <p className="label mt-5">Colour</p>
          <div className="flex flex-wrap gap-2">
            {Object.keys(AVATAR_COLORS).map((c) => (
              <button
                key={c}
                onClick={() => updateProfile({ avatar_color: c })}
                aria-label={c}
                className={clsx(
                  "size-8 rounded-full transition",
                  avatarColor(c).bar,
                  me.profile.avatar_color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : "opacity-70 hover:opacity-100",
                )}
              />
            ))}
          </div>
          <p className="label mt-5">Avatar</p>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button
                key={e || "initials"}
                onClick={() => updateProfile({ avatar_emoji: e || null })}
                className={clsx(
                  "grid size-9 place-items-center rounded-xl text-lg transition",
                  (me.profile.avatar_emoji ?? "") === e ? "bg-ink text-surface" : "bg-surface-2 hover:bg-line",
                )}
                aria-label={e ? `Use ${e}` : "Use initials"}
              >
                {e || <span className="text-xs font-semibold">Aa</span>}
              </button>
            ))}
          </div>
        </Section>

        <Section icon={Palette} title="Appearance">
          <Segmented
            value={theme}
            onChange={applyTheme}
            options={[
              { value: "system", label: <><Monitor className="size-3.5" /> System</> },
              { value: "light", label: <><Sun className="size-3.5" /> Light</> },
              { value: "dark", label: <><Moon className="size-3.5" /> Dark</> },
            ]}
          />
        </Section>

        <Section icon={Bell} title="Notifications" id="notifications">
          <div className="divide-y divide-line">
            <PrefRow label="New tasks assigned to me" checked={prefs.assigned} onChange={(v) => setPref("assigned", v)} />
            <PrefRow label="Upcoming deadlines" hint="24 hours before a task is due" checked={prefs.due_soon} onChange={(v) => setPref("due_soon", v)} />
            <PrefRow label="Overdue tasks" hint={isAdmin ? "Yours, plus anyone's in the family" : undefined} checked={prefs.overdue} onChange={(v) => setPref("overdue", v)} />
            <PrefRow label="Completed tasks" hint="When someone finishes a task you created or manage" checked={prefs.completed} onChange={(v) => setPref("completed", v)} />
            <PrefRow
              label="Browser notifications"
              hint={
                permission === "unsupported"
                  ? "Not supported in this browser"
                  : permission === "denied"
                    ? "Blocked in your browser settings"
                    : "Show a system notification when Hearth is in the background"
              }
              checked={prefs.browser && permission === "granted"}
              onChange={(v) => setPref("browser", v)}
            />
          </div>
        </Section>

        {isAdmin && (
          <Section icon={Home} title="Family">
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!familyName.trim()) return;
                await updateFamily({ name: familyName.trim() });
                toast.show({ tone: "success", title: "Family renamed" });
              }}
            >
              <input className="input" value={familyName} onChange={(e) => setFamilyName(e.target.value)} maxLength={80} aria-label="Family name" />
              <button className="btn-secondary" disabled={familyName.trim() === family.name}>Save</button>
            </form>
            <div className="mt-4 divide-y divide-line">
              <PrefRow
                label="Points & rewards"
                hint="Award points for tasks, run weekly challenges, and let kids redeem rewards"
                checked={family.gamification_enabled}
                onChange={(v) => updateFamily({ gamification_enabled: v })}
              />
              <div className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium">Time zone</p>
                  <p className="text-xs text-muted">Used for recurring schedules</p>
                </div>
                <select
                  className="input w-auto max-w-[12rem]"
                  value={family.timezone}
                  onChange={(e) => updateFamily({ timezone: e.target.value })}
                  aria-label="Time zone"
                >
                  {timezones(family.timezone).map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
            </div>
          </Section>
        )}

        <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <form action="/auth/signout" method="post">
            <button className="btn-secondary"><LogOut className="size-4" /> Sign out</button>
          </form>
          <button className="btn-ghost text-danger hover:text-danger" onClick={() => setConfirmLeave(true)}>
            Leave family
          </button>
        </div>
      </div>

      <Modal open={confirmLeave} onClose={() => setConfirmLeave(false)} title={`Leave ${family.name}?`}>
        {soleAdmin ? (
          <p className="text-sm text-muted">You&apos;re the only admin. Make someone else an admin from the Family page before leaving.</p>
        ) : (
          <p className="text-sm text-muted">
            You&apos;ll lose access to this family&apos;s tasks. {members.length === 1 ? "As the last member, the family and all its data will be deleted." : "You can rejoin later with an invite code."}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setConfirmLeave(false)}>Cancel</button>
          {!soleAdmin && (
            <button className="btn-danger" onClick={() => removeMember(userId)}>Leave family</button>
          )}
        </div>
      </Modal>
    </div>
  );
}

function timezones(current: string) {
  let list: string[] = [];
  try {
    list = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {}
  if (!list.includes(current)) list = [current, ...list];
  if (!list.includes("UTC")) list = ["UTC", ...list];
  return list;
}

function Section({ icon: Icon, title, children, id }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="card scroll-mt-20 p-5 sm:p-6" id={id}>
      <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold">
        <Icon className="size-4 text-muted" /> {title}
      </h2>
      {children}
    </section>
  );
}

function PrefRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
