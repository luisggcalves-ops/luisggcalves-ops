export type Role = "admin" | "member";
export type Priority = "low" | "medium" | "high";
export type TaskStatus = "pending" | "completed";
export type RecurrenceFreq = "daily" | "weekly" | "monthly";

export interface NotificationPrefs {
  assigned: boolean;
  due_soon: boolean;
  overdue: boolean;
  completed: boolean;
  browser: boolean;
}

export interface Profile {
  id: string;
  display_name: string;
  avatar_color: string;
  avatar_emoji: string | null;
  notification_prefs: NotificationPrefs;
  created_at: string;
}

export interface Family {
  id: string;
  name: string;
  invite_code: string;
  timezone: string;
  gamification_enabled: boolean;
  created_by: string | null;
  created_at: string;
}

export interface FamilyMemberRow {
  family_id: string;
  user_id: string;
  role: Role;
  joined_at: string;
}

export interface Member extends FamilyMemberRow {
  profile: Profile;
}

export interface Task {
  id: string;
  family_id: string;
  title: string;
  description: string;
  category: string;
  priority: Priority;
  points: number;
  assigned_to: string | null;
  created_by: string | null;
  due_at: string | null;
  recurrence_freq: RecurrenceFreq | null;
  recurrence_interval: number;
  recurrence_weekdays: number[];
  series_id: string | null;
  status: TaskStatus;
  completed_at: string | null;
  completed_by: string | null;
  next_task_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Columns a client may write (see column grants in the migration). */
export type TaskInput = Pick<
  Task,
  | "title"
  | "description"
  | "category"
  | "priority"
  | "points"
  | "assigned_to"
  | "due_at"
  | "recurrence_freq"
  | "recurrence_interval"
  | "recurrence_weekdays"
>;

export interface Completion {
  id: string;
  family_id: string;
  task_id: string | null;
  user_id: string;
  task_title: string;
  category: string;
  points: number;
  completed_at: string;
}

export type ActivityType =
  | "task_created"
  | "task_assigned"
  | "task_completed"
  | "task_reopened"
  | "task_deleted"
  | "member_joined"
  | "member_left"
  | "reward_redeemed";

export interface Activity {
  id: string;
  family_id: string;
  actor_id: string | null;
  type: ActivityType;
  task_id: string | null;
  subject_id: string | null;
  meta: { title?: string; points?: number; cost?: number; role?: Role };
  created_at: string;
}

export interface AppNotification {
  id: string;
  family_id: string;
  user_id: string;
  type: "assigned" | "due_soon" | "overdue" | "completed" | "reward";
  title: string;
  body: string;
  task_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Reward {
  id: string;
  family_id: string;
  title: string;
  description: string;
  cost: number;
  emoji: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Redemption {
  id: string;
  family_id: string;
  reward_id: string | null;
  user_id: string;
  title: string;
  cost: number;
  created_at: string;
}

export interface Challenge {
  id: string;
  family_id: string;
  title: string;
  description: string;
  metric: "tasks" | "points";
  target: number;
  starts_on: string;
  ends_on: string;
  reward_text: string;
  created_by: string | null;
  created_at: string;
}
