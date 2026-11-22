import { describe, expect, it } from "vitest";
import { computeCommission, resolveRule, type CommissionRule } from "@/server/domain/finance/commission";

const rule = (p: Partial<CommissionRule>): CommissionRule => ({
  id: Math.random().toString(36),
  staffMemberId: null,
  serviceId: null,
  appliesTo: "services",
  type: "percent",
  percentBps: 4000,
  amountCents: null,
  ...p,
});

describe("commission rules", () => {
  const shopDefault = rule({ id: "default", percentBps: 4000 });
  const ruiAll = rule({ id: "rui", staffMemberId: "rui", percentBps: 5000 });
  const fadeAll = rule({ id: "fade", serviceId: "fade", percentBps: 4500 });
  const ruiFade = rule({ id: "rui-fade", staffMemberId: "rui", serviceId: "fade", type: "fixed", percentBps: null, amountCents: 900 });
  const productsDefault = rule({ id: "prod", appliesTo: "products", percentBps: 1000 });
  const rules = [shopDefault, ruiAll, fadeAll, ruiFade, productsDefault];

  it("picks the most specific rule", () => {
    expect(resolveRule(rules, { kind: "service", staffMemberId: "rui", serviceId: "fade" })?.id).toBe("rui-fade");
    expect(resolveRule(rules, { kind: "service", staffMemberId: "ana", serviceId: "fade" })?.id).toBe("fade");
    expect(resolveRule(rules, { kind: "service", staffMemberId: "rui", serviceId: "cut" })?.id).toBe("rui");
    expect(resolveRule(rules, { kind: "service", staffMemberId: "ana", serviceId: "cut" })?.id).toBe("default");
    expect(resolveRule(rules, { kind: "product", staffMemberId: "rui", serviceId: null })?.id).toBe("prod");
    expect(resolveRule([shopDefault], { kind: "product", staffMemberId: "rui", serviceId: null })).toBeNull();
    expect(resolveRule([], { kind: "service", staffMemberId: "rui", serviceId: "cut" })).toBeNull();
  });

  it("computes percent (rounded to the cent) and fixed-per-unit amounts", () => {
    expect(computeCommission(shopDefault, 1500, 1)).toBe(600);
    expect(computeCommission(rule({ percentBps: 3333 }), 1000, 1)).toBe(333);
    expect(computeCommission(rule({ percentBps: 1250 }), 1004, 1)).toBe(126); // 125.5 rounds up
    expect(computeCommission(ruiFade, 2000, 2)).toBe(1800);
  });
});
