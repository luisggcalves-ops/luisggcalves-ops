import { CalendarClock } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { getOpeningHours, getOwnStaffProfile } from "@/server/domain/shops/service";
import { Card, CardBody } from "@/components/ui/card";
import { openStatus, shortTime, zonedNow } from "@/lib/time";
import { cn } from "@/lib/cn";

export default async function BarberTodayPage() {
  const ctx = await requirePageContext("barber_app.view");
  const [hours, profile] = await Promise.all([getOpeningHours(ctx), getOwnStaffProfile(ctx)]);
  const now = new Date();
  const tz = ctx.shop.timezone;
  const { weekday } = zonedNow(tz, now);
  const status = openStatus(hours, tz, now);
  const today = hours.filter((h) => h.weekday === weekday);
  const dateLabel = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(now);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[13px] text-fg-muted">{dateLabel}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">Hi, {ctx.user.name.split(" ")[0]}</h1>
      </div>

      <Card>
        <CardBody className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-fg-muted">Shop</p>
            <p className="mt-0.5 flex items-center gap-2 font-semibold">
              <span className={cn("size-2 rounded-full", status.open ? "bg-success" : "bg-fg-subtle")} aria-hidden />
              {status.open ? "Open" : "Closed"}
            </p>
            <p className="text-[13px] text-fg-muted">{status.label}</p>
          </div>
          <div className="text-right">
            <p className="text-[13px] text-fg-muted">Today</p>
            <p className="mt-0.5 font-semibold tabular">
              {today.length ? today.map((h) => `${shortTime(h.opensAt)}–${shortTime(h.closesAt)}`).join(", ") : "Closed"}
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col items-center py-10 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-surface-muted">
            <CalendarClock className="size-6 text-fg-muted" strokeWidth={1.5} />
          </span>
          <p className="mt-4 font-medium">Your appointments will appear here</p>
          <p className="mt-1 max-w-xs text-[13px] text-fg-muted">
            {profile
              ? "Once your shop starts taking bookings, you'll see each customer, their haircut notes and quick actions here."
              : "You don't have a barber profile in this shop yet. Ask the owner if you should take bookings."}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
