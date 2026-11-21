/**
 * Seed a demo family into the LOCAL Supabase stack.
 *   node scripts/seed-demo.mjs
 * Accounts (password "hearth-demo"): ana@example.com (admin), sam@example.com
 * (admin), mia@example.com, leo@example.com.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const PASSWORD = "hearth-demo";

async function account(name, color, emoji) {
  const c = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `${name.toLowerCase()}@example.com`;
  let { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) ({ data, error } = await c.auth.signUp({ email, password: PASSWORD, options: { data: { display_name: name } } }));
  if (error) throw error;
  const id = data.user.id;
  await c.from("profiles").update({ display_name: name, avatar_color: color, avatar_emoji: emoji }).eq("id", id);
  return { c, id, name };
}
const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const ana = await account("Ana", "emerald", null);
const sam = await account("Sam", "sky", null);
const mia = await account("Mia", "violet", "🦊");
const leo = await account("Leo", "amber", "🐸");

const existing = must(await ana.c.from("family_members").select("family_id").eq("user_id", ana.id).maybeSingle());
if (existing) {
  console.log("Demo family already exists — nothing to do.");
  process.exit(0);
}

const fam = must(await ana.c.rpc("create_family", { family_name: "The Silvas", tz: Intl.DateTimeFormat().resolvedOptions().timeZone }));
for (const u of [sam, mia, leo]) must(await u.c.rpc("join_family", { code: fam.invite_code }));
must(await ana.c.rpc("set_member_role", { fid: fam.id, member: sam.id, new_role: "admin" }));

const at = (days, h, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const weekday = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).getDay();

const T = (who, title, extra = {}) => ({
  family_id: fam.id,
  created_by: ana.id,
  title,
  assigned_to: who?.id ?? null,
  ...extra,
});

const tasks = [
  // recurring routines
  T(mia, "Feed the dog", { category: "pets", priority: "high", points: 10, due_at: at(-1, 8), recurrence_freq: "daily", description: "One scoop in the morning, fresh water too." }),
  T(leo, "Take out the rubbish", { category: "errands", points: 15, due_at: at(0, 19), recurrence_freq: "weekly", recurrence_weekdays: [weekday(0)] }),
  T(sam, "Clean the kitchen", { category: "cleaning", points: 20, due_at: at(-1, 21), recurrence_freq: "daily" }),
  T(mia, "Practice piano", { category: "school", points: 10, due_at: at(1, 17), recurrence_freq: "weekly", recurrence_interval: 1, recurrence_weekdays: [1, 3, 5] }),
  T(ana, "Pay the bills", { category: "errands", priority: "high", points: 0, due_at: at(5, 12), recurrence_freq: "monthly" }),
  // one-offs
  T(leo, "Tidy your bedroom", { category: "cleaning", points: 20, due_at: at(-2, 18), description: "Toys in the box, clothes in the basket." }),
  T(mia, "Science project poster", { category: "school", priority: "high", points: 30, due_at: at(3, 9) }),
  T(ana, "Weekly food shop", { category: "shopping", points: 10, due_at: at(1, 11), description: "Milk, eggs, bread, fruit, dog food." }),
  T(sam, "Fix the leaking tap", { category: "repairs", priority: "medium", points: 10, due_at: at(4, 10) }),
  T(null, "Water the plants", { category: "garden", priority: "low", points: 5 }),
  T(leo, "Fold the laundry", { category: "laundry", points: 10, due_at: at(0, 18) }),
  T(sam, "Book dentist appointments", { category: "errands", priority: "low", points: 5, due_at: at(9, 12) }),
  // to be completed below
  T(mia, "Empty the dishwasher", { category: "cleaning", points: 10, due_at: at(0, 8) }),
  T(leo, "Set the table", { category: "cooking", points: 5, due_at: at(-1, 18) }),
  T(sam, "Make dinner", { category: "cooking", points: 20, due_at: at(-1, 19) }),
  T(mia, "Read for 20 minutes", { category: "school", points: 10, due_at: at(-1, 20) }),
  T(leo, "Brush the dog", { category: "pets", points: 10, due_at: at(0, 9) }),
];
const created = must(await ana.c.from("tasks").insert(tasks, { defaultToNull: false }).select());
const byTitle = Object.fromEntries(created.map((t) => [t.title, t]));
const who = { [mia.id]: mia, [leo.id]: leo, [sam.id]: sam, [ana.id]: ana };

for (const title of ["Empty the dishwasher", "Set the table", "Make dinner", "Read for 20 minutes", "Brush the dog", "Clean the kitchen"]) {
  const t = byTitle[title];
  must(await who[t.assigned_to].c.rpc("complete_task", { task: t.id }));
}

must(await ana.c.from("rewards").insert([
  { family_id: fam.id, created_by: ana.id, title: "Pick the Friday movie", cost: 50, emoji: "🎬" },
  { family_id: fam.id, created_by: ana.id, title: "Ice cream trip", cost: 80, emoji: "🍦" },
  { family_id: fam.id, created_by: ana.id, title: "30 min extra screen time", cost: 40, emoji: "🎮" },
  { family_id: fam.id, created_by: ana.id, title: "Stay up late on Saturday", cost: 120, emoji: "🌙" },
]));
const monday = new Date();
monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
const sunday = new Date(monday);
sunday.setDate(monday.getDate() + 6);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
must(await ana.c.from("challenges").insert({
  family_id: fam.id, created_by: ana.id, title: "25 tasks together", metric: "tasks", target: 25,
  starts_on: ymd(monday), ends_on: ymd(sunday), reward_text: "Pizza night on Friday",
}));
await mia.c.rpc("check_my_deadlines");
await ana.c.rpc("check_my_deadlines");

console.log(`Seeded "${fam.name}" (invite code ${fam.invite_code}). Sign in as ana@example.com / ${PASSWORD}`);
