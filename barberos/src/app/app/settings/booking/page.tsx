import type { Metadata } from "next";
import { requirePageContext } from "@/server/tenancy";
import { getBookingSettings } from "@/server/domain/shops/service";
import { listServices } from "@/server/domain/services/service";
import { env } from "@/server/env";
import { BookingSettingsForm } from "./form";

export const metadata: Metadata = { title: "Online booking" };

export default async function BookingSettingsPage() {
  const ctx = await requirePageContext("shop.update");
  const [s, services] = await Promise.all([getBookingSettings(ctx), listServices(ctx)]);
  return (
    <BookingSettingsForm
      bookingUrl={`${env().BETTER_AUTH_URL}/book/${s.slug}`}
      hasServices={services.some((x) => x.isPublic)}
      defaults={{
        onlineBookingEnabled: s.onlineBookingEnabled,
        autoConfirmOnline: s.autoConfirmOnline,
        requireCustomerEmail: s.requireCustomerEmail,
        slotIntervalMin: s.slotIntervalMin,
        bookingLeadTimeMin: s.bookingLeadTimeMin,
        bookingHorizonDays: s.bookingHorizonDays,
        cancellationWindowHours: s.cancellationWindowHours,
        brandColor: s.brandColor,
      }}
    />
  );
}
