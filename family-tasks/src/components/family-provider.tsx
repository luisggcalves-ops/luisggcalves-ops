"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import type {
  Activity,
  AppNotification,
  Challenge,
  Completion,
  Family,
  FamilyMemberRow,
  Member,
  Profile,
  Redemption,
  Reward,
  Role,
  Task,
  TaskInput,
} from "@/lib/types";
import { useToast } from "./toast";

type WithId = { id: string };

interface FamilyState {
  family: Family;
  members: Member[];
  tasks: Task[];
  completions: Completion[];
  activity: Activity[];
  notifications: AppNotification[];
  rewards: Reward[];
  redemptions: Redemption[];
  challenges: Challenge[];
}

export interface FamilyContextValue extends FamilyState {
  userId: string;
  me: Member;
  isAdmin: boolean;
  live: boolean;
  memberById: (id: string | null | undefined) => Member | undefined;
  refresh: () => Promise<void>;
  // tasks
  createTask: (input: TaskInput) => Promise<Task>;
  updateTask: (id: string, patch: Partial<TaskInput>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleTask: (task: Task) => Promise<void>;
  // notifications
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  clearNotifications: () => Promise<void>;
  // profile + family
  updateProfile: (patch: Partial<Pick<Profile, "display_name" | "avatar_color" | "avatar_emoji" | "notification_prefs">>) => Promise<void>;
  updateFamily: (patch: Partial<Pick<Family, "name" | "timezone" | "gamification_enabled">>) => Promise<void>;
  regenerateInvite: () => Promise<void>;
  setRole: (userId: string, role: Role) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  // gamification
  saveReward: (r: Partial<Reward> & Pick<Reward, "title" | "cost">) => Promise<void>;
  deleteReward: (id: string) => Promise<void>;
  redeemReward: (id: string) => Promise<void>;
  saveChallenge: (c: Omit<Challenge, "id" | "family_id" | "created_by" | "created_at"> & { id?: string }) => Promise<void>;
  deleteChallenge: (id: string) => Promise<void>;
}

const FamilyContext = createContext<FamilyContextValue | null>(null);

export function useFamily() {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error("useFamily must be used inside <FamilyProvider>");
  return ctx;
}

// ---- small immutable list helpers -----------------------------------------
function upsert<T extends WithId>(list: T[], row: T, prepend = false): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  if (i === -1) return prepend ? [row, ...list] : [...list, row];
  const next = list.slice();
  next[i] = row;
  return next;
}
const without = <T extends WithId>(list: T[], id: string) => list.filter((x) => x.id !== id);

function applyChange<T extends WithId>(list: T[], p: RealtimePostgresChangesPayload<T>, prepend = false): T[] {
  if (p.eventType === "DELETE") {
    const id = (p.old as Partial<T>).id;
    return id ? without(list, id) : list;
  }
  return upsert(list, p.new as T, prepend);
}

function errMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: string }).message);
  return "Something went wrong";
}

// ---------------------------------------------------------------------------

export function FamilyProvider({
  userId,
  familyId,
  children,
}: {
  userId: string;
  familyId: string;
  children: ReactNode;
}) {
  const supabase = getSupabase();
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<FamilyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const prefsRef = useRef<Profile["notification_prefs"] | null>(null);
  const subscribedOnce = useRef(false);
  const stateRef = useRef<FamilyState | null>(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const patch = useCallback((fn: (s: FamilyState) => Partial<FamilyState>) => {
    setState((s) => (s ? { ...s, ...fn(s) } : s));
  }, []);

  // ---- loading -------------------------------------------------------------
  const loadMembers = useCallback(async (): Promise<Member[]> => {
    const { data, error } = await supabase
      .from("family_members")
      .select("family_id, user_id, role, joined_at, profile:profiles(*)")
      .eq("family_id", familyId)
      .order("joined_at");
    if (error) throw error;
    return (data ?? []) as unknown as Member[];
  }, [supabase, familyId]);

  const load = useCallback(async () => {
    try {
      const since = new Date(Date.now() - 90 * 86400000).toISOString();
      const [family, members, pending, done, completions, activity, notifications, rewards, redemptions, challenges] =
        await Promise.all([
          supabase.from("families").select("*").eq("id", familyId).single(),
          loadMembers(),
          supabase.from("tasks").select("*").eq("family_id", familyId).eq("status", "pending"),
          supabase
            .from("tasks")
            .select("*")
            .eq("family_id", familyId)
            .eq("status", "completed")
            .gte("completed_at", since)
            .order("completed_at", { ascending: false })
            .limit(1000),
          supabase
            .from("task_completions")
            .select("*")
            .eq("family_id", familyId)
            .order("completed_at", { ascending: false })
            .limit(5000),
          supabase
            .from("activity")
            .select("*")
            .eq("family_id", familyId)
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("notifications")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase.from("rewards").select("*").eq("family_id", familyId).order("cost"),
          supabase.from("reward_redemptions").select("*").eq("family_id", familyId).order("created_at", { ascending: false }),
          supabase.from("challenges").select("*").eq("family_id", familyId).order("ends_on", { ascending: false }),
        ]);
      const firstErr = [family, pending, done, completions, activity, notifications, rewards, redemptions, challenges].find(
        (r) => r.error,
      )?.error;
      if (firstErr) throw firstErr;
      if (!members.some((m) => m.user_id === userId)) {
        // removed from the family while away
        router.replace("/onboarding");
        return;
      }
      setState({
        family: family.data as Family,
        members,
        tasks: [...(pending.data as Task[]), ...(done.data as Task[])],
        completions: completions.data as Completion[],
        activity: activity.data as Activity[],
        notifications: notifications.data as AppNotification[],
        rewards: rewards.data as Reward[],
        redemptions: redemptions.data as Redemption[],
        challenges: challenges.data as Challenge[],
      });
      setError(null);
    } catch (e) {
      setError(errMessage(e));
    }
  }, [supabase, familyId, userId, loadMembers, router]);

  useEffect(() => {
    // initial fetch; state is set asynchronously once the queries resolve
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // keep a ref of my prefs for the realtime handler
  useEffect(() => {
    prefsRef.current = state?.members.find((m) => m.user_id === userId)?.profile.notification_prefs ?? null;
  }, [state?.members, userId]);

  // ---- deadline reminders: ask the server to generate any that are due -----
  useEffect(() => {
    const run = () => supabase.rpc("check_my_deadlines").then(() => undefined);
    run();
    const t = setInterval(run, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [supabase]);

  // ---- realtime --------------------------------------------------------------
  useEffect(() => {
    const f = `family_id=eq.${familyId}`;
    const refetchMembers = async () => {
      try {
        const members = await loadMembers();
        if (!members.some((m) => m.user_id === userId)) {
          router.replace("/onboarding");
          return;
        }
        patch(() => ({ members }));
      } catch {
        /* ignore transient errors; next event or refresh will fix */
      }
    };

    let catchUp: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`family:${familyId}`)
      .on<Task>("postgres_changes", { event: "INSERT", schema: "public", table: "tasks", filter: f }, (p) =>
        patch((s) => ({ tasks: applyChange(s.tasks, p) })),
      )
      .on<Task>("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks", filter: f }, (p) =>
        patch((s) => ({ tasks: applyChange(s.tasks, p) })),
      )
      // DELETE events can't be filtered server-side; only ids arrive.
      .on<Task>("postgres_changes", { event: "DELETE", schema: "public", table: "tasks" }, (p) =>
        patch((s) => ({ tasks: applyChange(s.tasks, p) })),
      )
      .on<Completion>("postgres_changes", { event: "INSERT", schema: "public", table: "task_completions", filter: f }, (p) =>
        patch((s) => ({ completions: applyChange(s.completions, p, true) })),
      )
      .on<Completion>("postgres_changes", { event: "DELETE", schema: "public", table: "task_completions" }, (p) =>
        patch((s) => ({ completions: applyChange(s.completions, p) })),
      )
      .on<Activity>("postgres_changes", { event: "INSERT", schema: "public", table: "activity", filter: f }, (p) =>
        patch((s) => ({ activity: applyChange(s.activity, p, true) })),
      )
      .on<AppNotification>(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (p) => {
          patch((s) => ({ notifications: applyChange(s.notifications, p, true) }));
          if (p.eventType === "INSERT") {
            const n = p.new as AppNotification;
            toast.show({ title: n.title, body: n.body, tone: n.type === "overdue" ? "warning" : "info" });
            if (
              prefsRef.current?.browser &&
              typeof Notification !== "undefined" &&
              Notification.permission === "granted" &&
              document.visibilityState === "hidden"
            ) {
              new Notification(n.title, { body: n.body, tag: n.id });
            }
          }
        },
      )
      .on<AppNotification>("postgres_changes", { event: "DELETE", schema: "public", table: "notifications" }, (p) =>
        patch((s) => ({ notifications: applyChange(s.notifications, p) })),
      )
      .on<FamilyMemberRow>("postgres_changes", { event: "*", schema: "public", table: "family_members", filter: f }, refetchMembers)
      .on<FamilyMemberRow>("postgres_changes", { event: "DELETE", schema: "public", table: "family_members" }, refetchMembers)
      .on<Profile>("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (p) =>
        patch((s) => ({
          members: s.members.map((m) => (m.user_id === p.new.id ? { ...m, profile: p.new as Profile } : m)),
        })),
      )
      .on<Family>("postgres_changes", { event: "UPDATE", schema: "public", table: "families", filter: `id=eq.${familyId}` }, (p) =>
        patch(() => ({ family: p.new as Family })),
      )
      .on<Reward>("postgres_changes", { event: "*", schema: "public", table: "rewards", filter: f }, (p) =>
        patch((s) => ({ rewards: applyChange(s.rewards, p).sort((a, b) => a.cost - b.cost) })),
      )
      .on<Reward>("postgres_changes", { event: "DELETE", schema: "public", table: "rewards" }, (p) =>
        patch((s) => ({ rewards: applyChange(s.rewards, p) })),
      )
      .on<Redemption>("postgres_changes", { event: "INSERT", schema: "public", table: "reward_redemptions", filter: f }, (p) =>
        patch((s) => ({ redemptions: applyChange(s.redemptions, p, true) })),
      )
      .on<Challenge>("postgres_changes", { event: "*", schema: "public", table: "challenges", filter: f }, (p) =>
        patch((s) => ({ challenges: applyChange(s.challenges, p, true) })),
      )
      .on<Challenge>("postgres_changes", { event: "DELETE", schema: "public", table: "challenges" }, (p) =>
        patch((s) => ({ challenges: applyChange(s.challenges, p) })),
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
        // after a reconnect, re-sync anything we may have missed
        // (the first time, catch anything that changed between the initial
        // fetch and the listener being registered server-side)
        if (status === "SUBSCRIBED") {
          if (subscribedOnce.current) load();
          else catchUp = setTimeout(load, 2000);
          subscribedOnce.current = true;
        }
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(catchUp);
      subscribedOnce.current = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, familyId, userId, patch, load, loadMembers, router, toast]);

  // ---- actions ---------------------------------------------------------------
  const fail = useCallback(
    (e: unknown): never => {
      const msg = errMessage(e);
      toast.show({ title: "Couldn't save", body: msg, tone: "error" });
      throw e instanceof Error ? e : new Error(msg);
    },
    [toast],
  );

  const createTask = useCallback(
    async (input: TaskInput) => {
      const { data, error } = await supabase
        .from("tasks")
        .insert({ ...input, family_id: familyId, created_by: userId })
        .select()
        .single();
      if (error) fail(error);
      patch((s) => ({ tasks: upsert(s.tasks, data as Task) }));
      return data as Task;
    },
    [supabase, familyId, userId, patch, fail],
  );

  const updateTask = useCallback(
    async (id: string, changes: Partial<TaskInput>) => {
      const { data, error } = await supabase.from("tasks").update(changes).eq("id", id).select().single();
      if (error) fail(error);
      patch((s) => ({ tasks: upsert(s.tasks, data as Task) }));
    },
    [supabase, patch, fail],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const { error, count } = await supabase.from("tasks").delete({ count: "exact" }).eq("id", id);
      if (error) fail(error);
      if (count === 0) fail(new Error("You don't have permission to delete this task"));
      patch((s) => ({ tasks: without(s.tasks, id) }));
    },
    [supabase, patch, fail],
  );

  const toggleTask = useCallback(
    async (given: Task) => {
      // always act on the freshest copy (e.g. "Undo" from a toast after realtime updates)
      const task = stateRef.current?.tasks.find((t) => t.id === given.id) ?? given;
      const completing = task.status === "pending";
      // optimistic: flip immediately, reconcile with the server's answer
      patch((s) => ({
        tasks: upsert(s.tasks, {
          ...task,
          status: completing ? "completed" : "pending",
          completed_at: completing ? new Date().toISOString() : null,
          completed_by: completing ? (task.assigned_to ?? userId) : null,
        }),
      }));
      const { data, error } = await supabase.rpc(completing ? "complete_task" : "uncomplete_task", { task: task.id });
      if (error) {
        patch((s) => ({ tasks: upsert(s.tasks, task) }));
        fail(error);
      }
      const updated = data as Task;
      patch((s) => {
        let tasks = upsert(s.tasks, updated);
        // undo removed the spawned next occurrence
        if (!completing && task.next_task_id) tasks = without(tasks, task.next_task_id);
        let completions = s.completions;
        if (!completing) completions = completions.filter((c) => c.task_id !== task.id);
        return { tasks, completions };
      });
      // pull rows the RPC created without waiting on realtime
      if (completing) {
        const [next, comp] = await Promise.all([
          updated.next_task_id
            ? supabase.from("tasks").select("*").eq("id", updated.next_task_id).maybeSingle()
            : Promise.resolve({ data: null }),
          supabase.from("task_completions").select("*").eq("task_id", task.id).maybeSingle(),
        ]);
        patch((s) => ({
          tasks: next.data ? upsert(s.tasks, next.data as Task) : s.tasks,
          completions: comp.data ? upsert(s.completions, comp.data as Completion, true) : s.completions,
        }));
      }
    },
    [supabase, userId, patch, fail],
  );

  const markRead = useCallback(
    async (id: string) => {
      const read_at = new Date().toISOString();
      patch((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read_at } : n)) }));
      await supabase.from("notifications").update({ read_at }).eq("id", id);
    },
    [supabase, patch],
  );

  const markAllRead = useCallback(async () => {
    const read_at = new Date().toISOString();
    patch((s) => ({ notifications: s.notifications.map((n) => (n.read_at ? n : { ...n, read_at })) }));
    await supabase.from("notifications").update({ read_at }).eq("user_id", userId).is("read_at", null);
  }, [supabase, userId, patch]);

  const clearNotifications = useCallback(async () => {
    patch(() => ({ notifications: [] }));
    await supabase.from("notifications").delete().eq("user_id", userId);
  }, [supabase, userId, patch]);

  const updateProfile = useCallback<FamilyContextValue["updateProfile"]>(
    async (changes) => {
      const { data, error } = await supabase.from("profiles").update(changes).eq("id", userId).select().single();
      if (error) fail(error);
      patch((s) => ({
        members: s.members.map((m) => (m.user_id === userId ? { ...m, profile: data as Profile } : m)),
      }));
    },
    [supabase, userId, patch, fail],
  );

  const updateFamily = useCallback<FamilyContextValue["updateFamily"]>(
    async (changes) => {
      const { data, error } = await supabase.from("families").update(changes).eq("id", familyId).select().single();
      if (error) fail(error);
      patch(() => ({ family: data as Family }));
    },
    [supabase, familyId, patch, fail],
  );

  const regenerateInvite = useCallback(async () => {
    const { data, error } = await supabase.rpc("regenerate_invite_code", { fid: familyId });
    if (error) fail(error);
    patch((s) => ({ family: { ...s.family, invite_code: data as string } }));
  }, [supabase, familyId, patch, fail]);

  const setRole = useCallback(
    async (member: string, role: Role) => {
      const { error } = await supabase.rpc("set_member_role", { fid: familyId, member, new_role: role });
      if (error) fail(error);
      patch((s) => ({ members: s.members.map((m) => (m.user_id === member ? { ...m, role } : m)) }));
    },
    [supabase, familyId, patch, fail],
  );

  const removeMember = useCallback(
    async (member: string) => {
      const { error } = await supabase.rpc("remove_member", { fid: familyId, member });
      if (error) fail(error);
      if (member === userId) {
        router.replace("/onboarding");
        router.refresh();
        return;
      }
      patch((s) => ({ members: s.members.filter((m) => m.user_id !== member) }));
    },
    [supabase, familyId, userId, patch, fail, router],
  );

  const saveReward = useCallback<FamilyContextValue["saveReward"]>(
    async (r) => {
      const row = { title: r.title, cost: r.cost, description: r.description ?? "", emoji: r.emoji ?? "🎁", active: r.active ?? true };
      const q = r.id
        ? supabase.from("rewards").update(row).eq("id", r.id)
        : supabase.from("rewards").insert({ ...row, family_id: familyId, created_by: userId });
      const { data, error } = await q.select().single();
      if (error) fail(error);
      patch((s) => ({ rewards: upsert(s.rewards, data as Reward).sort((a, b) => a.cost - b.cost) }));
    },
    [supabase, familyId, userId, patch, fail],
  );

  const deleteReward = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("rewards").delete().eq("id", id);
      if (error) fail(error);
      patch((s) => ({ rewards: without(s.rewards, id) }));
    },
    [supabase, patch, fail],
  );

  const redeemReward = useCallback(
    async (id: string) => {
      const { data, error } = await supabase.rpc("redeem_reward", { reward: id });
      if (error) fail(error);
      patch((s) => ({ redemptions: upsert(s.redemptions, data as Redemption, true) }));
    },
    [supabase, patch, fail],
  );

  const saveChallenge = useCallback<FamilyContextValue["saveChallenge"]>(
    async ({ id, ...c }) => {
      const q = id
        ? supabase.from("challenges").update(c).eq("id", id)
        : supabase.from("challenges").insert({ ...c, family_id: familyId, created_by: userId });
      const { data, error } = await q.select().single();
      if (error) fail(error);
      patch((s) => ({ challenges: upsert(s.challenges, data as Challenge, true) }));
    },
    [supabase, familyId, userId, patch, fail],
  );

  const deleteChallenge = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("challenges").delete().eq("id", id);
      if (error) fail(error);
      patch((s) => ({ challenges: without(s.challenges, id) }));
    },
    [supabase, patch, fail],
  );

  const value = useMemo<FamilyContextValue | null>(() => {
    if (!state) return null;
    const me = state.members.find((m) => m.user_id === userId);
    if (!me) return null;
    const byId = new Map(state.members.map((m) => [m.user_id, m]));
    return {
      ...state,
      userId,
      me,
      isAdmin: me.role === "admin",
      live,
      memberById: (id) => (id ? byId.get(id) : undefined),
      refresh: load,
      createTask,
      updateTask,
      deleteTask,
      toggleTask,
      markRead,
      markAllRead,
      clearNotifications,
      updateProfile,
      updateFamily,
      regenerateInvite,
      setRole,
      removeMember,
      saveReward,
      deleteReward,
      redeemReward,
      saveChallenge,
      deleteChallenge,
    };
  }, [
    state, userId, live, load, createTask, updateTask, deleteTask, toggleTask, markRead, markAllRead,
    clearNotifications, updateProfile, updateFamily, regenerateInvite, setRole, removeMember, saveReward,
    deleteReward, redeemReward, saveChallenge, deleteChallenge,
  ]);

  if (error && !state) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-sm font-medium text-ink">We couldn&apos;t load your family workspace.</p>
          <p className="mt-1 text-sm text-muted">{error}</p>
          <button onClick={load} className="btn-primary mt-4">
            Try again
          </button>
        </div>
      </div>
    );
  }
  // stateRef is only read inside async action callbacks, never during render
  // eslint-disable-next-line react-hooks/refs
  if (!value) return <LoadingScreen />;
  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}

export function LoadingScreen() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-9 animate-spin rounded-full border-2 border-line border-t-accent" />
        <p className="text-sm text-muted">Loading your family…</p>
      </div>
    </div>
  );
}
