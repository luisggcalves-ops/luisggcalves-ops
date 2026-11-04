/**
 * Integration tests against a running local Supabase stack (`npx supabase start`).
 * They exercise the real auth, PostgREST, RLS policies, RPC functions and
 * Realtime — the same path the app uses.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const run = Date.now().toString(36);

async function signUp(name: string) {
  const client = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signUp({
    email: `${name}-${run}@example.com`,
    password: "password123",
    options: { data: { display_name: name } },
  });
  if (error) throw error;
  return { client, id: data.user!.id };
}

type U = { client: SupabaseClient; id: string };
let parent: U, child: U, outsider: U;
let familyId: string, inviteCode: string, otherFamilyId: string;

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();
const DAY = 86400000;

beforeAll(async () => {
  [parent, child, outsider] = await Promise.all([signUp("Parent"), signUp("Child"), signUp("Outsider")]);
});

afterAll(async () => {
  await Promise.all([parent, child, outsider].map((u) => u?.client.removeAllChannels()));
});

describe("families & membership", () => {
  it("creates a profile for each new user from sign-up metadata", async () => {
    const { data } = await parent.client.from("profiles").select("*").eq("id", parent.id).single();
    expect(data.display_name).toBe("Parent");
  });

  it("create_family makes the creator an admin", async () => {
    const { data, error } = await parent.client.rpc("create_family", { family_name: "The Testers", tz: "Europe/London" });
    expect(error).toBeNull();
    familyId = data.id;
    inviteCode = data.invite_code;
    expect(inviteCode).toMatch(/^[A-Z2-9]{8}$/);
    const { data: m } = await parent.client.from("family_members").select("role").eq("user_id", parent.id).single();
    expect(m!.role).toBe("admin");
  });

  it("rejects an invalid invite code", async () => {
    const { error } = await child.client.rpc("join_family", { code: "NOPE2345" });
    expect(error?.message).toMatch(/not found/i);
  });

  it("join_family adds the user as a regular member", async () => {
    const { error } = await child.client.rpc("join_family", { code: inviteCode.toLowerCase() });
    expect(error).toBeNull();
    const { data } = await child.client.from("family_members").select("user_id, role").eq("family_id", familyId);
    expect(data).toHaveLength(2);
    expect(data!.find((m) => m.user_id === child.id)!.role).toBe("member");
  });

  it("a user can't join a second family", async () => {
    const { data } = await outsider.client.rpc("create_family", { family_name: "Other family" });
    otherFamilyId = data.id;
    const { error } = await outsider.client.rpc("join_family", { code: inviteCode });
    expect(error?.message).toMatch(/already belong/i);
  });

  it("members can't be created by direct insert", async () => {
    const { error } = await outsider.client.from("family_members").insert({ family_id: familyId, user_id: outsider.id });
    expect(error).not.toBeNull();
  });
});

describe("data isolation between families (RLS)", () => {
  let taskId: string;
  beforeAll(async () => {
    const { data, error } = await parent.client
      .from("tasks")
      .insert({ family_id: familyId, title: "Secret family task", assigned_to: child.id, created_by: parent.id })
      .select()
      .single();
    expect(error).toBeNull();
    taskId = data.id;
  });

  it("outsiders see none of another family's rows", async () => {
    for (const table of ["tasks", "family_members", "activity", "task_completions", "rewards", "challenges"]) {
      const { data } = await outsider.client.from(table).select("*").eq("family_id", familyId);
      expect(data, table).toEqual([]);
    }
    const { data: fam } = await outsider.client.from("families").select("*").eq("id", familyId);
    expect(fam).toEqual([]);
    const { data: prof } = await outsider.client.from("profiles").select("*").in("id", [parent.id, child.id]);
    expect(prof).toEqual([]);
  });

  it("outsiders can't write into another family", async () => {
    const ins = await outsider.client.from("tasks").insert({ family_id: familyId, title: "intrusion", created_by: outsider.id });
    expect(ins.error).not.toBeNull();
    const upd = await outsider.client.from("tasks").update({ title: "hacked" }).eq("id", taskId).select();
    expect(upd.data ?? []).toEqual([]);
    const del = await outsider.client.from("tasks").delete({ count: "exact" }).eq("id", taskId);
    expect(del.count ?? 0).toBe(0);
    const done = await outsider.client.rpc("complete_task", { task: taskId });
    expect(done.error?.message).toMatch(/not found/i);
    const fam = await outsider.client.from("families").update({ name: "pwned" }).eq("id", familyId).select();
    expect(fam.data ?? []).toEqual([]);
  });

  it("outsiders can't assign their tasks to someone in another family", async () => {
    const { error } = await outsider.client
      .from("tasks")
      .insert({ family_id: otherFamilyId, title: "x", assigned_to: child.id, created_by: outsider.id });
    expect(error?.message).toMatch(/not a member/i);
  });

  it("family members see each other's profiles", async () => {
    const { data } = await child.client.from("profiles").select("id").in("id", [parent.id, child.id, outsider.id]);
    expect(data!.map((p) => p.id).sort()).toEqual([parent.id, child.id].sort());
  });
});

describe("roles & permissions", () => {
  it("members can't assign tasks to other people", async () => {
    const { error } = await child.client
      .from("tasks")
      .insert({ family_id: familyId, title: "Parent do this", assigned_to: parent.id, created_by: child.id });
    expect(error?.message).toMatch(/only family admins/i);
  });

  it("members can create tasks for themselves, with points capped", async () => {
    const { data, error } = await child.client
      .from("tasks")
      .insert({ family_id: familyId, title: "My homework", assigned_to: child.id, created_by: child.id, points: 999 })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data.points).toBe(5);
  });

  it("completion state can't be written directly", async () => {
    const { data: t } = await child.client.from("tasks").select("id").eq("assigned_to", child.id).limit(1).single();
    const { error } = await child.client.from("tasks").update({ status: "completed" }).eq("id", t!.id);
    expect(error).not.toBeNull();
  });

  it("members can't edit or delete tasks they didn't create", async () => {
    const { data: t } = await child.client.from("tasks").select("id").eq("title", "Secret family task").single();
    const upd = await child.client.from("tasks").update({ points: 500 }).eq("id", t!.id).select();
    expect(upd.data ?? []).toEqual([]);
    const del = await child.client.from("tasks").delete({ count: "exact" }).eq("id", t!.id);
    expect(del.count ?? 0).toBe(0);
  });

  it("members can't manage family settings, invites, roles or rewards", async () => {
    const fam = await child.client.from("families").update({ name: "Kid rules" }).eq("id", familyId).select();
    expect(fam.data ?? []).toEqual([]);
    expect((await child.client.rpc("regenerate_invite_code", { fid: familyId })).error).not.toBeNull();
    expect((await child.client.rpc("set_member_role", { fid: familyId, member: child.id, new_role: "admin" })).error).not.toBeNull();
    const rw = await child.client.from("rewards").insert({ family_id: familyId, title: "Free candy", cost: 1 });
    expect(rw.error).not.toBeNull();
  });

  it("members can't complete a task assigned to someone else", async () => {
    const { data: t } = await parent.client
      .from("tasks")
      .insert({ family_id: familyId, title: "Parent's task", assigned_to: parent.id, created_by: parent.id })
      .select()
      .single();
    const { error } = await child.client.rpc("complete_task", { task: t.id });
    expect(error?.message).toMatch(/assignee or an admin/i);
  });

  it("the last admin can't demote themselves", async () => {
    const { error } = await parent.client.rpc("set_member_role", { fid: familyId, member: parent.id, new_role: "member" });
    expect(error?.message).toMatch(/at least one admin/i);
  });
});

describe("completion, points & notifications", () => {
  let taskId: string;

  it("assigning a task notifies the assignee", async () => {
    const { data } = await parent.client
      .from("tasks")
      .insert({ family_id: familyId, title: "Feed the dog", assigned_to: child.id, created_by: parent.id, points: 15, category: "pets" })
      .select()
      .single();
    taskId = data.id;
    const { data: notes } = await child.client.from("notifications").select("*").eq("task_id", taskId);
    expect(notes).toHaveLength(1);
    expect(notes![0]).toMatchObject({ type: "assigned", body: "Feed the dog", title: "Parent assigned you a task" });
  });

  it("notifications are private", async () => {
    const { data } = await parent.client.from("notifications").select("*").eq("user_id", child.id);
    expect(data).toEqual([]);
  });

  it("completing records history, awards points and notifies the admin", async () => {
    const { data, error } = await child.client.rpc("complete_task", { task: taskId });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "completed", completed_by: child.id });

    const { data: comp } = await parent.client.from("task_completions").select("*").eq("task_id", taskId).single();
    expect(comp).toMatchObject({ user_id: child.id, points: 15, task_title: "Feed the dog", category: "pets" });

    const { data: notes } = await parent.client.from("notifications").select("*").eq("task_id", taskId);
    expect(notes!.map((n) => n.type)).toContain("completed");

    const { data: act } = await parent.client.from("activity").select("type").eq("task_id", taskId);
    expect(act!.map((a) => a.type)).toEqual(expect.arrayContaining(["task_created", "task_completed"]));

    const { data: bal } = await child.client.rpc("points_balance", { fid: familyId, member: child.id });
    expect(bal).toBe(15);
  });

  it("completing twice is idempotent", async () => {
    await child.client.rpc("complete_task", { task: taskId });
    const { count } = await child.client.from("task_completions").select("*", { count: "exact", head: true }).eq("task_id", taskId);
    expect(count).toBe(1);
  });

  it("undo removes the completion and its points", async () => {
    const { data, error } = await child.client.rpc("uncomplete_task", { task: taskId });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "pending", completed_at: null, completed_by: null });
    const { data: bal } = await child.client.rpc("points_balance", { fid: familyId, member: child.id });
    expect(bal).toBe(0);
  });

  it("an admin can tick off a child's task, crediting the child", async () => {
    await parent.client.rpc("complete_task", { task: taskId });
    const { data: comp } = await parent.client.from("task_completions").select("user_id").eq("task_id", taskId).single();
    expect(comp!.user_id).toBe(child.id);
  });

  it("deadline reminders: due-soon and overdue, generated once", async () => {
    const { data: soon } = await parent.client
      .from("tasks")
      .insert({ family_id: familyId, title: "Due soon", assigned_to: child.id, created_by: parent.id, due_at: iso(3600_000) })
      .select()
      .single();
    const { data: late } = await parent.client
      .from("tasks")
      .insert({ family_id: familyId, title: "Late", assigned_to: child.id, created_by: parent.id, due_at: iso(-3600_000) })
      .select()
      .single();
    const first = await child.client.rpc("check_my_deadlines");
    expect(first.data).toBeGreaterThanOrEqual(3); // soon→child, late→child + admin
    const again = await child.client.rpc("check_my_deadlines");
    expect(again.data).toBe(0);

    const { data: childNotes } = await child.client.from("notifications").select("type, task_id").in("task_id", [soon.id, late.id]);
    expect(childNotes).toEqual(
      expect.arrayContaining([
        { type: "due_soon", task_id: soon.id },
        { type: "overdue", task_id: late.id },
      ]),
    );
    const { data: adminNotes } = await parent.client.from("notifications").select("type, title").eq("task_id", late.id).eq("type", "overdue");
    expect(adminNotes![0].title).toBe("Overdue: Child");

    // completing clears unread deadline reminders
    await child.client.rpc("complete_task", { task: late.id });
    const { data: cleared } = await child.client.from("notifications").select("*").eq("task_id", late.id).eq("type", "overdue");
    expect(cleared).toEqual([]);
  });
});

describe("recurring tasks", () => {
  it("completing spawns the next occurrence; undo removes it", async () => {
    // Every Tuesday 19:00 London, first one last Tuesday (in the past)
    const lastTuesday = new Date();
    lastTuesday.setUTCDate(lastTuesday.getUTCDate() - ((lastTuesday.getUTCDay() + 5) % 7) - 7);
    lastTuesday.setUTCHours(19, 0, 0, 0); // GMT in November
    const { data: t, error } = await parent.client
      .from("tasks")
      .insert({
        family_id: familyId,
        title: "Take out the rubbish",
        assigned_to: child.id,
        created_by: parent.id,
        due_at: lastTuesday.toISOString(),
        recurrence_freq: "weekly",
        recurrence_weekdays: [2],
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(t.series_id).toBe(t.id);

    const notesBefore = (await child.client.from("notifications").select("id")).data!.length;
    const { data: done } = await child.client.rpc("complete_task", { task: t.id });
    expect(done.next_task_id).toBeTruthy();

    const { data: next } = await child.client.from("tasks").select("*").eq("id", done.next_task_id).single();
    expect(next).toMatchObject({ status: "pending", series_id: t.id, assigned_to: child.id, title: "Take out the rubbish" });
    const due = new Date(next.due_at);
    expect(due.getTime()).toBeGreaterThan(Date.now()); // missed weeks are skipped
    expect(due.getUTCDay()).toBe(2);
    expect(due.getUTCHours()).toBe(19);

    // spawning is silent: no "assigned you" spam
    const notesAfter = (await child.client.from("notifications").select("id")).data!.length;
    expect(notesAfter).toBe(notesBefore);

    await child.client.rpc("uncomplete_task", { task: t.id });
    const { data: gone } = await child.client.from("tasks").select("id").eq("id", done.next_task_id);
    expect(gone).toEqual([]);
  });

  it("recurring tasks require a due date", async () => {
    const { error } = await parent.client
      .from("tasks")
      .insert({ family_id: familyId, title: "x", created_by: parent.id, recurrence_freq: "daily" });
    expect(error).not.toBeNull();
  });
});

describe("rewards", () => {
  it("redeeming needs enough points and notifies admins", async () => {
    const { data: rw } = await parent.client
      .from("rewards")
      .insert({ family_id: familyId, title: "Movie night", cost: 10, created_by: parent.id })
      .select()
      .single();
    const { data: bal } = await child.client.rpc("points_balance", { fid: familyId, member: child.id });
    expect(bal).toBeGreaterThanOrEqual(10);
    const ok = await child.client.rpc("redeem_reward", { reward: rw.id });
    expect(ok.error).toBeNull();
    const { data: after } = await child.client.rpc("points_balance", { fid: familyId, member: child.id });
    expect(after).toBe(bal - 10);

    const { data: pricey } = await parent.client
      .from("rewards")
      .insert({ family_id: familyId, title: "New bike", cost: 99999, created_by: parent.id })
      .select()
      .single();
    const no = await child.client.rpc("redeem_reward", { reward: pricey.id });
    expect(no.error?.message).toMatch(/not enough points/i);

    const { data: notes } = await parent.client.from("notifications").select("title").eq("type", "reward");
    expect(notes!.some((n) => n.title === "Child redeemed a reward")).toBe(true);
  });
});

describe("realtime sync", () => {
  it("a completion by one member reaches another member's subscription, but not outsiders", async () => {
    const { data: t } = await parent.client
      .from("tasks")
      .insert({ family_id: familyId, title: "Realtime check", assigned_to: child.id, created_by: parent.id })
      .select()
      .single();

    const received: Record<string, unknown>[] = [];
    const leaked: unknown[] = [];
    const subscribe = (c: SupabaseClient, name: string, sink: unknown[]) =>
      new Promise<void>((resolve, reject) => {
        c.channel(name)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks", filter: `family_id=eq.${familyId}` }, (p) =>
            sink.push(p.new),
          )
          .subscribe((s) => (s === "SUBSCRIBED" ? resolve() : s === "CHANNEL_ERROR" ? reject(new Error(s)) : undefined));
      });
    await parent.client.realtime.setAuth((await parent.client.auth.getSession()).data.session!.access_token);
    await outsider.client.realtime.setAuth((await outsider.client.auth.getSession()).data.session!.access_token);
    await Promise.all([subscribe(parent.client, "rt-parent", received), subscribe(outsider.client, "rt-outsider", leaked)]);
    // the postgres_changes listener is registered shortly after SUBSCRIBED
    await new Promise((r) => setTimeout(r, 2000));

    await child.client.rpc("complete_task", { task: t.id });

    const deadline = Date.now() + 8000;
    while (!received.some((r) => r.id === t.id && r.status === "completed") && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(received.some((r) => r.id === t.id && r.status === "completed")).toBe(true);
    await new Promise((r) => setTimeout(r, 500));
    expect(leaked).toEqual([]);
  });
});

describe("leaving a family", () => {
  it("removes access and unassigns open tasks", async () => {
    const { data: open } = await parent.client
      .from("tasks")
      .insert({ family_id: familyId, title: "Left behind", assigned_to: child.id, created_by: parent.id })
      .select()
      .single();
    const { error } = await child.client.rpc("remove_member", { fid: familyId, member: child.id });
    expect(error).toBeNull();
    const { data: visible } = await child.client.from("tasks").select("id").eq("family_id", familyId);
    expect(visible).toEqual([]);
    const { data: t } = await parent.client.from("tasks").select("assigned_to").eq("id", open.id).single();
    expect(t!.assigned_to).toBeNull();
    // history survives
    const { count } = await parent.client.from("task_completions").select("*", { count: "exact", head: true }).eq("user_id", child.id);
    expect(count).toBeGreaterThan(0);
  });

  it("the last member leaving deletes the family", async () => {
    const { error } = await outsider.client.rpc("remove_member", { fid: otherFamilyId, member: outsider.id });
    expect(error).toBeNull();
    const { data } = await outsider.client.rpc("create_family", { family_name: "Fresh start" });
    expect(data.name).toBe("Fresh start");
  });
});
