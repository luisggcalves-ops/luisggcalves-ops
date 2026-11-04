import { describe, expect, it } from "vitest";
import { alignToWeekdays, describeRecurrence } from "@/lib/recurrence";

const r = (freq: "daily" | "weekly" | "monthly" | null, interval = 1, weekdays: number[] = []) => ({
  recurrence_freq: freq,
  recurrence_interval: interval,
  recurrence_weekdays: weekdays,
});

describe("describeRecurrence", () => {
  it("handles one-off tasks", () => expect(describeRecurrence(r(null))).toBeNull());
  it("daily", () => {
    expect(describeRecurrence(r("daily"))).toBe("Every day");
    expect(describeRecurrence(r("daily", 3))).toBe("Every 3 days");
  });
  it("weekly", () => {
    expect(describeRecurrence(r("weekly", 1, [2]))).toBe("Every Tuesday");
    expect(describeRecurrence(r("weekly"))).toBe("Every week");
    expect(describeRecurrence(r("weekly", 2, [4, 1]))).toBe("Every 2 weeks on Mon, Thu");
    expect(describeRecurrence(r("weekly", 1, [1, 2, 3, 4, 5]))).toBe("Every weekday");
    expect(describeRecurrence(r("weekly", 1, [0, 6]))).toBe("Every weekend");
    expect(describeRecurrence(r("weekly", 1, [0, 1, 2, 3, 4, 5, 6]))).toBe("Every day");
    // Sunday sorts last (weeks start Monday)
    expect(describeRecurrence(r("weekly", 1, [0, 3]))).toBe("Every Wed, Sun");
  });
  it("monthly", () => {
    expect(describeRecurrence(r("monthly"))).toBe("Every month");
    expect(describeRecurrence(r("monthly", 6))).toBe("Every 6 months");
  });
});

describe("alignToWeekdays", () => {
  it("moves forward to the next allowed weekday", () => {
    const wed = new Date(2026, 10, 4, 18, 0); // Wed 4 Nov 2026
    const d = alignToWeekdays(wed, [2]); // Tuesday
    expect(d.getDay()).toBe(2);
    expect(d.getDate()).toBe(10);
    expect(d.getHours()).toBe(18);
  });
  it("keeps the date when it already matches", () => {
    const tue = new Date(2026, 10, 3, 9, 0);
    expect(alignToWeekdays(tue, [2, 4]).getDate()).toBe(3);
  });
  it("no weekdays = unchanged", () => {
    const d = new Date(2026, 10, 4);
    expect(alignToWeekdays(d, [])).toBe(d);
  });
});
