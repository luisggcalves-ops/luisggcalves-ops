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
