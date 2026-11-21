import type { Metadata } from "next";
import { requirePageContext } from "@/server/tenancy";
import { getOpeningHours, getShop, listClosures } from "@/server/domain/shops/service";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionButton } from "@/components/ui/action-button";
import { formatDateLabel, zonedDate } from "@/lib/time";
import { OpeningHoursForm } from "./form";
import { ClosureForm } from "./closure-form";
import { deleteClosureAction } from "../actions";

export const metadata: Metadata = { title: "Opening hours" };

const fmt = (d: string) => formatDateLabel(d, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export default async function OpeningHoursPage() {
  const ctx = await requirePageContext("shop.update");
  const [shop, hours] = await Promise.all([getShop(ctx), getOpeningHours(ctx)]);
  const today = zonedDate(new Date(), shop.timezone);
  const closures = await listClosures(ctx, { fromDate: today });
  return (
    <div className="flex flex-col gap-6">
      <OpeningHoursForm hours={hours} timezone={shop.timezone} />
      <Card>
        <CardHeader title="Closures" description="Holidays and days off for the whole shop. Nobody can be booked on these days." />
        {closures.length ? (
          <ul className="divide-y divide-border border-b border-border">
            {closures.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium tabular">
                    {c.startsOn === c.endsOn ? fmt(c.startsOn) : `${fmt(c.startsOn)} – ${fmt(c.endsOn)}`}
                  </span>
                  {c.reason ? <span className="block text-[12px] text-fg-muted">{c.reason}</span> : null}
                </span>
                <ActionButton action={deleteClosureAction} fields={{ closureId: c.id }} confirm="Remove this closure?">
                  Remove
                </ActionButton>
              </li>
            ))}
          </ul>
        ) : null}
        <CardBody>
          <ClosureForm today={today} />
        </CardBody>
      </Card>
    </div>
  );
}
