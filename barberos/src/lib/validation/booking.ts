import { z } from "zod";
import { clockSchema, dateSchema } from "./scheduling";

export const publicBookingSchema = z.object({
  serviceId: z.uuid("Choose a service"),
  staffMemberId: z.union([z.literal("any"), z.uuid()]),
  date: dateSchema,
  time: clockSchema,
  fullName: z.string().trim().min(2, "Enter your name").max(80),
  phone: z.string().trim().min(6, "Enter your phone number").max(40),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.union([z.literal(""), z.email("Enter a valid email")]))
    .nullish()
    .transform((v) => (v ? v : null)),
  note: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((v) => (v ? v : null)),
  marketingOptIn: z.boolean().default(false),
});
export type PublicBookingInput = z.input<typeof publicBookingSchema>;

export const customerRescheduleSchema = z.object({ date: dateSchema, time: clockSchema });

export const bookingSettingsSchema = z.object({
  onlineBookingEnabled: z.boolean(),
  autoConfirmOnline: z.boolean(),
  requireCustomerEmail: z.boolean(),
  slotIntervalMin: z.coerce.number().int().refine((v) => [5, 10, 15, 20, 30, 60].includes(v), "Choose an interval"),
  bookingLeadTimeMin: z.coerce.number().int().min(0).max(7 * 24 * 60),
  bookingHorizonDays: z.coerce.number().int().min(1).max(365),
  cancellationWindowHours: z.coerce.number().int().min(0).max(14 * 24),
  brandColor: z.string().regex(/^#[0-9a-f]{6}$/i).nullish(),
});
