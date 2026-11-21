/** Money is always integer minor units (cents). These helpers convert at the edges only. */

/** Parses "25", "25.5", "25,50" or "€ 1.234,50" into cents. Returns null if invalid. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned || cleaned.includes("-")) return null;
  // The last separator followed by 1–2 digits is the decimal separator. Others are thousands separators.
  const m = cleaned.match(/^(.*?)(?:[.,](\d{1,2}))?$/);
  if (!m) return null;
  const whole = (m[1] ?? "").replace(/[.,]/g, "");
  if (!/^\d+$/.test(whole || "0")) return null;
  const frac = (m[2] ?? "").padEnd(2, "0");
  const cents = Number(whole || "0") * 100 + Number(frac || "0");
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatMoney(cents: number, currency: string, locale = "en-GB"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(
    cents / 100,
  );
}

/** Plain "25.50" for form inputs. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
