import { zonedDate } from "@/lib/time";
import { resolvePeriod } from "@/lib/period";

export type FinanceSearch = { p?: string; from?: string; to?: string };

export function periodFor(sp: FinanceSearch, timeZone: string) {
  return resolvePeriod(sp, zonedDate(new Date(), timeZone));
}
