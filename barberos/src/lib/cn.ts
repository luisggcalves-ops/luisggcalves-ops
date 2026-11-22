import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and resolves Tailwind conflicts (the last one wins, e.g. `w-full` + `w-32` → `w-32`). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
