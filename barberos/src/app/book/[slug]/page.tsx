import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock, MapPin, Phone } from "lucide-react";
import { getPublicAvailability, getPublicShop } from "@/server/domain/public-booking/service";
import { formatMoney } from "@/lib/money";
import { addDays, formatDateLabel, isDateString, shortTime, WEEKDAYS, zonedDate } from "@/lib/time";
import { formatPhone } from "@/lib/phone";
import { ChoiceLink, StepHeader } from "./steps";
import { DateTimes } from "./date-times";
import { DetailsForm } from "./details-form";

type Search = { service?: string; staff?: string; date?: string; time?: string; from?: string };
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Search> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicShop(slug);
  return { title: data ? `Book at ${data.shop.name}` : "Book" };
}

const WINDOW_DAYS = 14;

function priceLabel(min: number, max: number, currency: string) {
  return min === max ? formatMoney(min, currency) : `from ${formatMoney(min, currency)}`;
}
function durationLabel(min: number, max: number) {
  return min === max ? `${min} min` : `${min}–${max} min`;
}

export default async function BookPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const data = await getPublicShop(slug);
  if (!data) notFound();
  const { shop, settings } = data;
  const base = `/book/${shop.slug}`;
  const q = (p: Search) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `${base}?${s}` : base;
  };

  const ready = settings.enabled && data.services.length > 0 && data.staff.length > 0;
  if (!ready) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Online booking isn&apos;t open yet</h1>
        <p className="text-sm text-fg-muted">Please contact {shop.name} to book.</p>
        <ShopInfo data={data} />
      </div>
    );
  }

  const service = data.services.find((s) => s.id === sp.service);
  // Step 1: choose a service
  if (!service) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Book an appointment</h1>
          <p className="mt-1 text-sm text-fg-muted">Choose a service to see free times.</p>
        </div>
        <ul className="flex flex-col gap-2">
          {data.services.map((s) => (
            <li key={s.id}>
              <ChoiceLink
                href={q({ service: s.id })}
                title={s.name}
                meta={[durationLabel(s.minDuration, s.maxDuration), s.description].filter(Boolean).join(" · ")}
                aside={priceLabel(s.minPrice, s.maxPrice, shop.currency)}
              />
            </li>
          ))}
        </ul>
        <ShopInfo data={data} />
      </div>
    );
  }

  const staffForService = data.staff.filter((s) => s.serviceIds.includes(service.id));
  const staffId = sp.staff === "any" || staffForService.some((s) => s.id === sp.staff) ? sp.staff! : null;
  // Step 2: choose a barber
  if (!staffId) {
    return (
      <div className="flex flex-col gap-4">
        <StepHeader step={2} title="Who would you like?" backHref={base} />
        <p className="-mt-3 text-sm text-fg-muted">
          {service.name} · {durationLabel(service.minDuration, service.maxDuration)} · {priceLabel(service.minPrice, service.maxPrice, shop.currency)}
        </p>
        <ul className="flex flex-col gap-2">
          {staffForService.length > 1 ? (
            <li>
              <ChoiceLink href={q({ service: service.id, staff: "any" })} title="Any barber" meta="Shows the most free times" />
            </li>
          ) : null}
          {staffForService.map((s) => (
            <li key={s.id}>
              <ChoiceLink href={q({ service: service.id, staff: s.id })} title={s.name} meta={s.bio ?? undefined} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const today = zonedDate(new Date(), shop.timezone);
  const from = isDateString(sp.from) && sp.from >= today ? sp.from : today;
  const days = await getPublicAvailability(shop.slug, { serviceId: service.id, staffMemberId: staffId, fromDate: from, days: WINDOW_DAYS });
  const firstFree = days.find((d) => d.times.length)?.date ?? from;
  const date = isDateString(sp.date) && days.some((d) => d.date === sp.date) ? sp.date : firstFree;
  const staffName = staffId === "any" ? "Any barber" : staffForService.find((s) => s.id === staffId)?.name;
  const time = sp.time && days.find((d) => d.date === date)?.times.includes(sp.time) ? sp.time : null;
  const horizonEnd = addDays(today, settings.horizonDays);

  // Step 3: date and time
  if (!time) {
    return (
      <div className="flex flex-col gap-4">
        <StepHeader step={3} title="Pick a time" backHref={q({ service: service.id })} />
        <p className="-mt-3 text-sm text-fg-muted">
          {service.name} · {staffName}
        </p>
        <DateTimes
          days={days}
          selected={date}
          dateHref={(d) => q({ service: service.id, staff: staffId, from, date: d })}
          timeHref={(t) => q({ service: service.id, staff: staffId, from, date, time: t })}
        />
        <div className="flex justify-between text-[13px]">
          {from > today ? (
            <a href={q({ service: service.id, staff: staffId, from: addDays(from, -WINDOW_DAYS) > today ? addDays(from, -WINDOW_DAYS) : today })} className="text-fg-muted hover:text-fg">
              ← Earlier dates
            </a>
          ) : (
            <span />
          )}
          {addDays(from, WINDOW_DAYS) <= horizonEnd ? (
            <a href={q({ service: service.id, staff: staffId, from: addDays(from, WINDOW_DAYS) })} className="text-fg-muted hover:text-fg">
              Later dates →
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  // Step 4: details
  const exact = staffId !== "any" ? data.staff.find((s) => s.id === staffId) : null;
  return (
    <div className="flex flex-col gap-5">
      <StepHeader step={4} title="Your details" backHref={q({ service: service.id, staff: staffId, from, date })} />
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <p className="font-medium">{service.name}</p>
        <p className="mt-0.5 text-sm text-fg-muted">
          {formatDateLabel(date)} at <span className="tabular">{time}</span> · {exact ? exact.name : "Any barber"}
        </p>
        <p className="mt-0.5 text-sm text-fg-muted">
          {durationLabel(service.minDuration, service.maxDuration)} · {priceLabel(service.minPrice, service.maxPrice, shop.currency)} · pay at the shop
        </p>
      </div>
      <DetailsForm
        hidden={{ slug: shop.slug, serviceId: service.id, staffMemberId: staffId, date, time }}
        requireEmail={settings.requireEmail}
        shopName={shop.name}
        privacyHref={`${base}/privacy`}
      />
    </div>
  );
}

function ShopInfo({ data }: { data: NonNullable<Awaited<ReturnType<typeof getPublicShop>>> }) {
  const { shop, hours } = data;
  return (
    <section className="rounded-xl border border-border bg-surface p-4 text-sm shadow-card">
      <div className="flex flex-col gap-2">
        {shop.address ? (
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-fg-subtle" /> {shop.address}
          </p>
        ) : null}
        {shop.phone ? (
          <p className="flex items-center gap-2">
            <Phone className="size-4 shrink-0 text-fg-subtle" />
            <a href={`tel:${shop.phone}`} className="hover:underline">
              {formatPhone(shop.phone) || shop.phone}
            </a>
          </p>
        ) : null}
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
          <dl className="grid flex-1 grid-cols-[90px_1fr] gap-y-0.5 text-[13px]">
            {WEEKDAYS.map((d) => {
              const h = hours.filter((x) => x.weekday === d.value);
              return (
                <div key={d.value} className="contents">
                  <dt className="text-fg-muted">{d.long}</dt>
                  <dd className="tabular">{h.length ? h.map((x) => `${shortTime(x.opensAt)}–${shortTime(x.closesAt)}`).join(", ") : "Closed"}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
    </section>
  );
}
