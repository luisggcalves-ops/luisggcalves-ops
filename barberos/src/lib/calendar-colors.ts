import type { CalendarColor } from "@/lib/validation/scheduling";

/** Muted accent per barber. Blocks use a soft tint of it, so the calendar stays calm. */
export const CALENDAR_COLOR_HEX: Record<CalendarColor, string> = {
  graphite: "#3f3f46",
  slate: "#475d78",
  sage: "#4f7a5f",
  sand: "#9a7b4f",
  clay: "#a35a44",
  plum: "#7a4f78",
  ocean: "#2f6f86",
  rose: "#a34d66",
};

export function colorHex(color: string | null | undefined): string {
  return CALENDAR_COLOR_HEX[(color ?? "graphite") as CalendarColor] ?? CALENDAR_COLOR_HEX.graphite;
}
