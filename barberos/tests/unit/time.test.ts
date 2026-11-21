import { describe, expect, it } from "vitest";
import { openStatus, zonedNow } from "@/lib/time";
import { uuidv7, hashToken, randomToken } from "@/lib/ids";

const hours = [
  { weekday: 2, opensAt: "09:00", closesAt: "13:00" },
  { weekday: 2, opensAt: "14:00", closesAt: "19:00" },
  { weekday: 6, opensAt: "08:00", closesAt: "14:00" },
];

describe("zonedNow", () => {
  it("uses the shop's time zone, including DST", () => {
    // 2026-07-14 is a Tuesday. Lisbon is UTC+1 in summer.
    expect(zonedNow("Europe/Lisbon", new Date("2026-07-14T08:30:00Z"))).toEqual({ weekday: 2, minutes: 9 * 60 + 30 });
    // In winter Lisbon is UTC+0.
    expect(zonedNow("Europe/Lisbon", new Date("2026-01-13T08:30:00Z"))).toEqual({ weekday: 2, minutes: 8 * 60 + 30 });
    // The same instant is already Wednesday in Tokyo.
    expect(zonedNow("Asia/Tokyo", new Date("2026-07-14T20:00:00Z")).weekday).toBe(3);
  });
});

describe("openStatus", () => {
  const at = (iso: string) => openStatus(hours, "Europe/Lisbon", new Date(iso));
  it("reports open with closing time", () => {
    expect(at("2026-07-14T10:00:00Z")).toEqual({ open: true, label: "Open until 13:00" });
  });
  it("handles the lunch break", () => {
    expect(at("2026-07-14T12:30:00Z")).toEqual({ open: false, label: "Closed · opens 14:00" });
  });
  it("finds the next opening day", () => {
    expect(at("2026-07-14T19:00:00Z")).toEqual({ open: false, label: "Closed · opens Sat 08:00" });
    expect(at("2026-07-17T19:00:00Z")).toEqual({ open: false, label: "Closed · opens tomorrow 08:00" });
  });
  it("handles shops with no hours", () => {
    expect(openStatus([], "Europe/Lisbon")).toEqual({ open: false, label: "No opening hours set" });
  });
});

describe("ids", () => {
  it("generates time-ordered v7 UUIDs", () => {
    const a = uuidv7();
    const b = uuidv7();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a.slice(0, 13) <= b.slice(0, 13)).toBe(true);
  });
  it("hashes tokens deterministically", () => {
    const t = randomToken();
    expect(t.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(hashToken(randomToken()));
  });
});
