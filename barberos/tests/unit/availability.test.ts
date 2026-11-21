import { describe, expect, it } from "vitest";
import { availableSlots, checkSlot, intersect, subtract, type DayAvailabilityInput } from "@/server/domain/scheduling/availability";
import { addDays, addMonths, formatClock, isDateString, startOfWeek, weekdayOf, zonedTimeToUtc } from "@/lib/time";

const TZ = "Europe/Lisbon";
// 2026-07-14 is a Tuesday (weekday 2). Lisbon is UTC+1 in summer.
const DATE = "2026-07-14";

function base(overrides: Partial<DayAvailabilityInput> = {}): DayAvailabilityInput {
  return {
    date: DATE,
    timeZone: TZ,
    shopHours: [{ weekday: 2, opensAt: "09:00", closesAt: "19:00" }],
    staffHours: [{ weekday: 2, startsAt: "09:00", endsAt: "19:00" }],
    closures: [],
    timeOff: [],
    busy: [],
    ...overrides,
  };
}
const q = { durationMin: 30, bufferMin: 0, slotIntervalMin: 30 };
const clocks = (slots: Date[]) => slots.map((s) => formatClock(s, TZ));
const at = (hhmm: string, date = DATE) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedTimeToUtc(date, h * 60 + m, TZ)!;
};

describe("interval maths", () => {
  it("intersects and subtracts", () => {
    expect(intersect([{ start: 0, end: 10 }], [{ start: 5, end: 15 }])).toEqual([{ start: 5, end: 10 }]);
    expect(subtract([{ start: 0, end: 10 }], [{ start: 3, end: 5 }])).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 10 },
    ]);
    expect(subtract([{ start: 0, end: 10 }], [{ start: -5, end: 20 }])).toEqual([]);
  });
});

describe("availableSlots", () => {
  it("offers slots inside opening and working hours, where the service fits before closing", () => {
    const slots = clocks(availableSlots(base(), q));
    expect(slots[0]).toBe("09:00");
    expect(slots.at(-1)).toBe("18:30");
    expect(slots).toHaveLength(20);
  });

  it("intersects shop hours with the barber's hours, including split shifts", () => {
    const slots = clocks(
      availableSlots(
        base({
          staffHours: [
            { weekday: 2, startsAt: "08:00", endsAt: "12:00" },
            { weekday: 2, startsAt: "14:00", endsAt: "20:00" },
          ],
        }),
        q,
      ),
    );
    expect(slots[0]).toBe("09:00"); // the shop opens at 9
    expect(slots).not.toContain("12:00");
    expect(slots).not.toContain("13:30");
    expect(slots).toContain("14:00");
    expect(slots.at(-1)).toBe("18:30"); // the shop closes at 19
  });

  it("returns nothing on closures, days off and non-working days", () => {
    expect(availableSlots(base({ closures: [{ startsOn: "2026-07-13", endsOn: "2026-07-15" }] }), q)).toEqual([]);
    expect(availableSlots(base({ staffHours: [] }), q)).toEqual([]);
    expect(availableSlots(base({ date: "2026-07-15" }), q)).toEqual([]); // Wednesday: no hours defined
  });

  it("removes time off", () => {
    const slots = clocks(availableSlots(base({ timeOff: [{ startsAt: at("12:00"), endsAt: at("14:00") }] }), q));
    expect(slots).toContain("11:30");
    expect(slots).not.toContain("12:00");
    expect(slots).not.toContain("13:30");
    expect(slots).toContain("14:00");
  });

  it("avoids existing bookings and respects buffers on both sides", () => {
    const busy = [{ startsAt: at("10:00"), blockedUntil: at("10:40") }]; // 30 min + 10 min buffer
    const slots = clocks(availableSlots(base({ busy }), { durationMin: 30, bufferMin: 10, slotIntervalMin: 15 }));
    expect(slots).toContain("09:15"); // 09:15–09:45, buffer until 09:55
    expect(slots).not.toContain("09:30"); // its buffer would run into 10:00
    expect(slots).not.toContain("10:30"); // still blocked until 10:40
    expect(slots).toContain("10:45");
  });

  it("lets the buffer run past closing, but not the service", () => {
    const slots = clocks(availableSlots(base(), { durationMin: 30, bufferMin: 15, slotIntervalMin: 30 }));
    expect(slots.at(-1)).toBe("18:30");
  });

  it("applies lead time and horizon", () => {
    const slots = clocks(availableSlots(base(), { ...q, notBefore: at("15:10"), notAfter: at("17:00") }));
    expect(slots).toEqual(["15:30", "16:00", "16:30", "17:00"]);
  });

  it("handles the spring-forward DST gap", () => {
    // 2026-03-29 (Sunday): Lisbon jumps from 01:00 to 02:00.
    const night: DayAvailabilityInput = {
      ...base({ date: "2026-03-29" }),
      shopHours: [{ weekday: 0, opensAt: "00:00", closesAt: "04:00" }],
      staffHours: [{ weekday: 0, startsAt: "00:00", endsAt: "04:00" }],
    };
    const slots = availableSlots(night, { durationMin: 60, bufferMin: 0, slotIntervalMin: 60 });
    expect(clocks(slots)).toEqual(["00:00", "02:00", "03:00"]); // 01:00 doesn't exist that night
    // 00:00 → 02:00 wall time is only 1 real hour apart.
    expect(slots[1].getTime() - slots[0].getTime()).toBe(60 * 60_000);
  });
});

describe("checkSlot", () => {
  it("explains why a time can't be booked", () => {
    const input = base({ busy: [{ startsAt: at("10:00"), blockedUntil: at("10:30") }] });
    expect(checkSlot(input, q, at("09:00"))).toEqual({ ok: true });
    expect(checkSlot(input, q, at("10:15"))).toEqual({ ok: false, reason: "TAKEN" });
    expect(checkSlot(input, q, at("18:45"))).toEqual({ ok: false, reason: "OUTSIDE_HOURS" });
    expect(checkSlot(input, { ...q, notBefore: at("12:00") }, at("11:00"))).toEqual({ ok: false, reason: "TOO_SOON" });
    // Off-grid times are fine for staff bookings.
    expect(checkSlot(input, q, at("11:07"))).toEqual({ ok: true });
  });
});

describe("calendar date helpers", () => {
  it("does date arithmetic without time zones", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekdayOf("2026-07-14")).toBe(2);
    expect(startOfWeek("2026-07-19")).toBe("2026-07-13"); // Sunday → previous Monday
    expect(startOfWeek("2026-07-13")).toBe("2026-07-13");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(isDateString("2026-02-30")).toBe(false);
    expect(isDateString("2026-02-28")).toBe(true);
  });
  it("converts wall time to instants across DST", () => {
    expect(zonedTimeToUtc("2026-07-14", 9 * 60, TZ)!.toISOString()).toBe("2026-07-14T08:00:00.000Z");
    expect(zonedTimeToUtc("2026-01-14", 9 * 60, TZ)!.toISOString()).toBe("2026-01-14T09:00:00.000Z");
    expect(zonedTimeToUtc("2026-03-29", 60 + 30, TZ)).toBeNull();
    expect(zonedTimeToUtc("2026-07-14", 9 * 60, "America/New_York")!.toISOString()).toBe("2026-07-14T13:00:00.000Z");
  });
});

import { layoutLanes } from "@/components/calendar/layout";

describe("calendar lanes", () => {
  it("places overlapping events side by side and separate clusters full width", () => {
    const out = layoutLanes([
      { id: "a", start: 600, end: 630 },
      { id: "b", start: 610, end: 640 },
      { id: "c", start: 635, end: 660 },
      { id: "d", start: 700, end: 730 },
    ]);
    const byId = Object.fromEntries(out.map((e) => [e.id, e]));
    expect(byId.a).toMatchObject({ lane: 0, lanes: 2 });
    expect(byId.b).toMatchObject({ lane: 1, lanes: 2 });
    expect(byId.c).toMatchObject({ lane: 0, lanes: 2 }); // reuses lane 0 after a ends
    expect(byId.d).toMatchObject({ lane: 0, lanes: 1 });
  });
});
