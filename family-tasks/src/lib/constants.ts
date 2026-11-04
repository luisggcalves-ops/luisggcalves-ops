import {
  BookOpen,
  Car,
  ChefHat,
  Leaf,
  PawPrint,
  Shirt,
  ShoppingCart,
  Sparkles,
  Wrench,
  CircleDot,
  type LucideIcon,
} from "lucide-react";
import type { Priority } from "./types";

export interface CategoryDef {
  id: string;
  label: string;
  icon: LucideIcon;
  /** tailwind classes for a soft tinted badge */
  tint: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: "cleaning", label: "Cleaning", icon: Sparkles, tint: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  { id: "cooking", label: "Cooking", icon: ChefHat, tint: "bg-orange-500/10 text-orange-700 dark:text-orange-300" },
  { id: "shopping", label: "Shopping", icon: ShoppingCart, tint: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  { id: "school", label: "School", icon: BookOpen, tint: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  { id: "pets", label: "Pets", icon: PawPrint, tint: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  { id: "laundry", label: "Laundry", icon: Shirt, tint: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
  { id: "garden", label: "Garden", icon: Leaf, tint: "bg-lime-500/10 text-lime-700 dark:text-lime-300" },
  { id: "errands", label: "Errands", icon: Car, tint: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  { id: "repairs", label: "Repairs", icon: Wrench, tint: "bg-stone-500/10 text-stone-700 dark:text-stone-300" },
  { id: "other", label: "Other", icon: CircleDot, tint: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300" },
];

export function getCategory(id: string): CategoryDef {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

export const PRIORITIES: { id: Priority; label: string; dot: string }[] = [
  { id: "low", label: "Low", dot: "bg-zinc-400" },
  { id: "medium", label: "Medium", dot: "bg-amber-400" },
  { id: "high", label: "High", dot: "bg-rose-500" },
];

export const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** Avatar palette: soft background + readable foreground. */
export const AVATAR_COLORS: Record<string, { bg: string; fg: string; ring: string; bar: string }> = {
  indigo: { bg: "bg-indigo-100 dark:bg-indigo-500/20", fg: "text-indigo-700 dark:text-indigo-200", ring: "ring-indigo-300", bar: "bg-indigo-500" },
  violet: { bg: "bg-violet-100 dark:bg-violet-500/20", fg: "text-violet-700 dark:text-violet-200", ring: "ring-violet-300", bar: "bg-violet-500" },
  rose: { bg: "bg-rose-100 dark:bg-rose-500/20", fg: "text-rose-700 dark:text-rose-200", ring: "ring-rose-300", bar: "bg-rose-500" },
  amber: { bg: "bg-amber-100 dark:bg-amber-500/20", fg: "text-amber-800 dark:text-amber-200", ring: "ring-amber-300", bar: "bg-amber-500" },
  emerald: { bg: "bg-emerald-100 dark:bg-emerald-500/20", fg: "text-emerald-700 dark:text-emerald-200", ring: "ring-emerald-300", bar: "bg-emerald-500" },
  sky: { bg: "bg-sky-100 dark:bg-sky-500/20", fg: "text-sky-700 dark:text-sky-200", ring: "ring-sky-300", bar: "bg-sky-500" },
  teal: { bg: "bg-teal-100 dark:bg-teal-500/20", fg: "text-teal-700 dark:text-teal-200", ring: "ring-teal-300", bar: "bg-teal-500" },
  orange: { bg: "bg-orange-100 dark:bg-orange-500/20", fg: "text-orange-700 dark:text-orange-200", ring: "ring-orange-300", bar: "bg-orange-500" },
};

export function avatarColor(c: string | undefined) {
  return AVATAR_COLORS[c ?? ""] ?? AVATAR_COLORS.indigo;
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
