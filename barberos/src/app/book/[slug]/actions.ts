"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/server/actions";
import { cancelManagedBooking, createPublicBooking, rescheduleManagedBooking } from "@/server/domain/public-booking/service";
import { deliverDueForShop } from "@/server/notifications/outbox";
import { withinRateLimit } from "@/server/rate-limit";
import { readString } from "@/server/form";
import { env } from "@/server/env";
import { DomainError } from "@/server/errors";

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

async function guard(scope: string, max: number) {
  if (process.env.DISABLE_RATE_LIMIT === "1") return;
  if (!(await withinRateLimit(`${scope}:${await clientIp()}`, max, 600))) {
    throw new DomainError("CONFLICT", "Too many attempts. Please wait a few minutes and try again.");
  }
}

/** Sends the confirmation email right after the response, without making the customer wait. */
function deliverSoon(shopId: string) {
  after(async () => {
    try {
      await deliverDueForShop(shopId);
    } catch (err) {
      console.error("[outbox] delivery failed; it will be retried", err);
    }
  });
}

export async function createBookingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const slug = readString(formData, "slug");
  let token: string | null = null;
  const result = await runAction(async () => {
    // Bots fill the hidden "website" field. Real customers never see it.
    if (readString(formData, "website")) throw new DomainError("VALIDATION", "Something went wrong. Please try again.");
    await guard("book", 10);
    const booked = await createPublicBooking(
      slug,
      {
        serviceId: readString(formData, "serviceId"),
        staffMemberId: readString(formData, "staffMemberId"),
        date: readString(formData, "date"),
        time: readString(formData, "time"),
        fullName: readString(formData, "fullName"),
        phone: readString(formData, "phone"),
        email: readString(formData, "email"),
        note: readString(formData, "note"),
        marketingOptIn: formData.get("marketingOptIn") === "on",
      },
      { baseUrl: env().BETTER_AUTH_URL },
    );
    token = booked.token;
    deliverSoon(booked.shopId);
    revalidatePath("/app", "layout");
    revalidatePath("/barber", "layout");
    return { status: "success" };
  });
  if (token) redirect(`/book/${slug}/manage/${token}?booked=1`);
  return result;
}

export async function cancelBookingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await guard("manage", 20);
    const { shopId } = await cancelManagedBooking(readString(formData, "token"), { baseUrl: env().BETTER_AUTH_URL });
    deliverSoon(shopId);
    revalidatePath("/book", "layout");
    revalidatePath("/app", "layout");
    return { status: "success", message: "Your booking has been cancelled." };
  });
}

export async function rescheduleBookingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const slug = readString(formData, "slug");
  const token = readString(formData, "token");
  const result = await runAction(async () => {
    await guard("manage", 20);
    const { shopId } = await rescheduleManagedBooking(
      token,
      { date: readString(formData, "date"), time: readString(formData, "time") },
      { baseUrl: env().BETTER_AUTH_URL },
    );
    deliverSoon(shopId);
    revalidatePath("/app", "layout");
    return { status: "success" };
  });
  if (result.status === "success") redirect(`/book/${slug}/manage/${token}?moved=1`);
  return result;
}
