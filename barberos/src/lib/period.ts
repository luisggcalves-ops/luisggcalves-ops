import { addDays, addMonths, isDateString, startOfMonth, startOfWeek } from "@/lib/time";

export const PERIODS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
] as const;

export type Period = { key: string; fromDate: string; toDate: string; label: string };

/** Resolves ?p=… (or ?from=&to=) into an inclusive shop-local date range. */
export function resolvePeriod(sp: { p?: string; from?: string; to?: string }, today: string): Period {
  if (sp.p === "custom" && isDateString(sp.from) && isDateString(sp.to) && sp.from <= sp.to) {
    return { key: "custom", fromDate: sp.from, toDate: sp.to, label: `${sp.from} → ${sp.to}` };
  }
  switch (sp.p) {
    case "today":
      return { key: "today", fromDate: today, toDate: today, label: "Today" };
    case "week": {
      const from = startOfWeek(today);
      return { key: "week", fromDate: from, toDate: addDays(from, 6), label: "This week" };
    }
    case "last_month": {
      const from = addMonths(startOfMonth(today), -1);
      return { key: "last_month", fromDate: from, toDate: addDays(startOfMonth(today), -1), label: "Last month" };
    }
    default: {
      const from = startOfMonth(today);
      return { key: "month", fromDate: from, toDate: addDays(addMonths(from, 1), -1), label: "This month" };
    }
  }
}
