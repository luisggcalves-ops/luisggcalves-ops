/**
 * Commission engine: pure functions, no database access.
 *
 * Resolution (most specific wins):
 *   services: barber + service → service → barber → shop default
 *   products: barber → shop default
 * Percent rules use the line total (after any price change) as the base.
 * Fixed rules pay a fixed amount per unit. Tips are never commissionable.
 */
export type CommissionRule = {
  id: string;
  staffMemberId: string | null;
  serviceId: string | null;
  appliesTo: "services" | "products";
  type: "percent" | "fixed";
  percentBps: number | null;
  amountCents: number | null;
};

export function resolveRule(
  rules: CommissionRule[],
  line: { kind: "service" | "product"; staffMemberId: string; serviceId: string | null },
): CommissionRule | null {
  const appliesTo = line.kind === "service" ? "services" : "products";
  const candidates = rules.filter((r) => r.appliesTo === appliesTo);
  const pick = (staff: boolean, service: boolean) =>
    candidates.find(
      (r) =>
        (staff ? r.staffMemberId === line.staffMemberId : r.staffMemberId === null) &&
        (service ? r.serviceId !== null && r.serviceId === line.serviceId : r.serviceId === null),
    );
  if (line.kind === "service" && line.serviceId) {
    return pick(true, true) ?? pick(false, true) ?? pick(true, false) ?? pick(false, false) ?? null;
  }
  return pick(true, false) ?? pick(false, false) ?? null;
}

/** Commission in cents. Percent amounts round half up, to the cent. */
export function computeCommission(rule: CommissionRule, baseCents: number, quantity: number): number {
  if (rule.type === "percent") return Math.round((baseCents * (rule.percentBps ?? 0)) / 10_000);
  return (rule.amountCents ?? 0) * quantity;
}

export function describeRule(rule: Pick<CommissionRule, "type" | "percentBps" | "amountCents">, formatCents: (c: number) => string) {
  return rule.type === "percent" ? `${(rule.percentBps ?? 0) / 100}%` : `${formatCents(rule.amountCents ?? 0)} each`;
}
