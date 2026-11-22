import { resolveShopContext } from "@/server/tenancy";
import { canViewFinance, listCommissions, listPayments } from "@/server/domain/finance/service";
import { listAppointments } from "@/server/domain/appointments/service";
import { resolvePeriod } from "@/lib/period";
import { addDays, formatClock, zonedDate, zonedTimeToUtc } from "@/lib/time";
import { toCsv } from "@/lib/csv";

const euros = (c: number) => (c / 100).toFixed(2);

/** CSV downloads for the accountant: payments, commissions and appointments for a period. */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const ctx = await resolveShopContext();
  if (!ctx || !(await canViewFinance(ctx))) return new Response("Forbidden", { status: 403 });
  const { kind } = await params;
  const url = new URL(req.url);
  const tz = ctx.shop.timezone;
  const period = resolvePeriod(Object.fromEntries(url.searchParams), zonedDate(new Date(), tz));
  const dt = (d: Date) => `${zonedDate(d, tz)} ${formatClock(d, tz)}`;
  let rows: (string | number | null)[][];

  if (kind === "payments") {
    const data = await listPayments(ctx, period);
    rows = [["Recorded at", "Customer", "Items", "Method", "Subtotal", "Tip", "Total", "Status", "Void reason"]];
    for (const r of data) {
      rows.push([
        dt(r.payment.recordedAt),
        r.customerName ?? "Walk-in",
        r.items.map((i) => `${i.description}${i.quantity > 1 ? ` x${i.quantity}` : ""}${i.staffName ? ` (${i.staffName})` : ""}`).join("; "),
        r.payment.method,
        euros(r.payment.subtotalCents),
        euros(r.payment.tipCents),
        euros(r.payment.totalCents),
        r.payment.status,
        r.payment.voidReason,
      ]);
    }
  } else if (kind === "commissions") {
    const data = await listCommissions(ctx, period);
    rows = [["Date", "Barber", "Item", "Base", "Commission"]];
    for (const c of data) rows.push([dt(c.recordedAt), c.staffName, c.description, euros(c.baseCents), euros(c.amountCents)]);
  } else if (kind === "appointments") {
    const data = await listAppointments(ctx, {
      from: zonedTimeToUtc(period.fromDate, 0, tz)!,
      to: zonedTimeToUtc(addDays(period.toDate, 1), 0, tz)!,
      includeCancelled: true,
    });
    rows = [["Start", "Barber", "Customer", "Service", "Price", "Status", "Source"]];
    for (const a of data) rows.push([dt(a.startsAt), a.staffName, a.customerName, a.serviceName, euros(a.priceCents), a.status, a.source]);
  } else {
    return new Response("Not found", { status: 404 });
  }

  return new Response("﻿" + toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${period.fromDate}-to-${period.toDate}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
