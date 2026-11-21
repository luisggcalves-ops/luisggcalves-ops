/** Plain-text email templates. Payloads are snapshots, so emails stay correct even if data changes later. */
export type BookingPayload = {
  shopName: string;
  shopPhone: string | null;
  shopAddress: string | null;
  customerName: string;
  serviceName: string;
  staffName: string;
  whenLabel: string;
  priceLabel: string;
  manageUrl: string;
  status?: "confirmed" | "pending";
  previousWhenLabel?: string;
};

export type Rendered = { subject: string; text: string };

function footer(p: BookingPayload) {
  return [p.shopName, p.shopAddress, p.shopPhone].filter(Boolean).join(" · ");
}

export const TEMPLATES: Record<string, (p: BookingPayload) => Rendered> = {
  booking_created: (p) => ({
    subject: p.status === "pending" ? `Booking request received: ${p.shopName}` : `You're booked: ${p.serviceName} at ${p.shopName}`,
    text: [
      `Hi ${p.customerName},`,
      "",
      p.status === "pending"
        ? `We've received your booking request. ${p.shopName} will confirm it shortly.`
        : `Your appointment is confirmed.`,
      "",
      `${p.serviceName} with ${p.staffName}`,
      p.whenLabel,
      p.priceLabel,
      "",
      `Need to cancel or change it? ${p.manageUrl}`,
      "",
      footer(p),
    ].join("\n"),
  }),
  booking_rescheduled: (p) => ({
    subject: `Your booking at ${p.shopName} has moved`,
    text: [
      `Hi ${p.customerName},`,
      "",
      `Your ${p.serviceName} with ${p.staffName} is now on:`,
      p.whenLabel,
      p.previousWhenLabel ? `(was ${p.previousWhenLabel})` : "",
      "",
      `Manage your booking: ${p.manageUrl}`,
      "",
      footer(p),
    ].join("\n"),
  }),
  booking_cancelled: (p) => ({
    subject: `Booking cancelled: ${p.shopName}`,
    text: [
      `Hi ${p.customerName},`,
      "",
      `Your ${p.serviceName} on ${p.whenLabel} has been cancelled.`,
      "",
      "We hope to see you another time.",
      "",
      footer(p),
    ].join("\n"),
  }),
};

export function renderTemplate(template: string, payload: unknown): Rendered {
  const fn = TEMPLATES[template];
  if (!fn) throw new Error(`Unknown email template: ${template}`);
  return fn(payload as BookingPayload);
}
