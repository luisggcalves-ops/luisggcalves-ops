import { describe, expect, it } from "vitest";
import { openingHoursSchema, shopProfileSchema, slugify, slugSchema } from "@/lib/validation/shop";
import { inviteSchema } from "@/lib/validation/team";
import { safeNext } from "@/lib/auth/client";

describe("slugs", () => {
  it("slugifies names, including accents", () => {
    expect(slugify("Barbearia São João")).toBe("barbearia-sao-joao");
    expect(slugify("  The Cut & Co.  ")).toBe("the-cut-co");
  });
  it("validates and reserves app paths", () => {
    expect(slugSchema.safeParse("corte-fino").success).toBe(true);
    expect(slugSchema.safeParse("-bad").success).toBe(false);
    expect(slugSchema.safeParse("ab").success).toBe(false);
    expect(slugSchema.safeParse("api").success).toBe(false);
  });
});

describe("opening hours", () => {
  it("accepts split shifts on the same day", () => {
    const r = openingHoursSchema.safeParse([
      { weekday: 1, opensAt: "09:00", closesAt: "13:00" },
      { weekday: 1, opensAt: "13:00", closesAt: "19:00" },
    ]);
    expect(r.success).toBe(true);
  });
  it("rejects overlaps, inverted times and bad formats", () => {
    expect(
      openingHoursSchema.safeParse([
        { weekday: 1, opensAt: "09:00", closesAt: "13:00" },
        { weekday: 1, opensAt: "12:59", closesAt: "19:00" },
      ]).success,
    ).toBe(false);
    expect(openingHoursSchema.safeParse([{ weekday: 1, opensAt: "10:00", closesAt: "10:00" }]).success).toBe(false);
    expect(openingHoursSchema.safeParse([{ weekday: 7, opensAt: "10:00", closesAt: "11:00" }]).success).toBe(false);
    expect(openingHoursSchema.safeParse([{ weekday: 1, opensAt: "9am", closesAt: "11:00" }]).success).toBe(false);
  });
});

describe("profile", () => {
  it("normalizes optional fields", () => {
    const r = shopProfileSchema.parse({
      name: " Shop ",
      slug: "Shop-One",
      timezone: "Europe/Lisbon",
      currency: "EUR",
      phone: "",
      email: " Hi@Shop.PT ",
    });
    expect(r).toMatchObject({ name: "Shop", slug: "shop-one", phone: null, email: "hi@shop.pt" });
  });
});

describe("invites", () => {
  it("normalizes the email and never allows owner", () => {
    expect(inviteSchema.parse({ email: " A@B.com ", role: "barber" }).email).toBe("a@b.com");
    expect(inviteSchema.safeParse({ email: "a@b.com", role: "owner" }).success).toBe(false);
  });
});

describe("safeNext", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
    expect(safeNext("//evil.com")).toBe("/start");
    expect(safeNext("https://evil.com")).toBe("/start");
    expect(safeNext("/\\evil.com")).toBe("/start");
    expect(safeNext(null)).toBe("/start");
  });
});

import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";

describe("money", () => {
  it("parses common price formats into cents", () => {
    expect(parseMoneyToCents("25")).toBe(2500);
    expect(parseMoneyToCents("25.5")).toBe(2550);
    expect(parseMoneyToCents("25,50")).toBe(2550);
    expect(parseMoneyToCents("€ 1.234,50")).toBe(123450);
    expect(parseMoneyToCents("1,234.50")).toBe(123450);
    expect(parseMoneyToCents("-5")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
  });
  it("formats with the shop currency", () => {
    expect(formatMoney(2500, "EUR")).toBe("€25");
    expect(formatMoney(2550, "EUR")).toBe("€25.50");
  });
});

describe("phone", () => {
  it("normalizes to E.164 using the shop's country", () => {
    expect(normalizePhone("912 345 678", "PT")).toBe("+351912345678");
    expect(normalizePhone("+44 7911 123456", "PT")).toBe("+447911123456");
    expect(normalizePhone("123", "PT")).toBeNull();
  });
});

import { toCsv } from "@/lib/csv";
describe("csv", () => {
  it("escapes quotes, commas and formula injection", () => {
    expect(toCsv([["a,b", 'say "hi"', "=HYPERLINK(1)", 12.5, null]])).toBe('"a,b","say ""hi""",\'=HYPERLINK(1),12.5,');
  });
});

import { cn } from "@/lib/cn";
describe("cn", () => {
  it("lets later Tailwind classes override earlier ones", () => {
    expect(cn("w-full h-10 px-3", "w-32 h-8")).toBe("px-3 w-32 h-8");
    expect(cn("bg-surface", "bg-primary text-primary-fg")).toBe("bg-primary text-primary-fg");
  });
});
