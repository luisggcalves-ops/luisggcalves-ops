import { getManagedBooking } from "@/server/domain/public-booking/service";

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function esc(s: string) {
  return s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
}

/** Calendar file so customers can add the booking to Apple, Google or Outlook calendars. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const data = await getManagedBooking(token);
  if (!data || data.shop.slug !== slug || !data.policy.active) return new Response("Not found", { status: 404 });
  const { shop, appointment: a } = data;
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BarberOS//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${token.slice(0, 16)}@barberos`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(a.startsAt)}`,
    `DTEND:${icsDate(a.endsAt)}`,
    `SUMMARY:${esc(`${a.serviceName} at ${shop.name}`)}`,
    `DESCRIPTION:${esc(`With ${a.staffName}.`)}`,
    shop.address ? `LOCATION:${esc(shop.address)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
