import { z } from "zod";
import { isDateString } from "@/lib/time";
import { parseMoneyToCents } from "@/lib/money";
import { openingHoursSchema } from "./shop";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const intFrom = (min: number, max: number, label: string) =>
  z.coerce
    .number({ error: `Enter ${label}` })
    .int(`Use whole minutes`)
    .min(min, `Minimum is ${min}`)
    .max(max, `Maximum is ${max}`);

export const dateSchema = z.string().refine(isDateString, "Choose a valid date");
export const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

/** Muted calendar tints, so the calendar stays calm and on-brand. */
export const CALENDAR_COLORS = ["graphite", "slate", "sage", "sand", "clay", "plum", "ocean", "rose"] as const;
export type CalendarColor = (typeof CALENDAR_COLORS)[number];

export const serviceSchema = z.object({
  name: z.string().trim().min(2, "Enter a service name").max(80),
  description: optionalText(500),
  durationMin: intFrom(5, 480, "a duration"),
  bufferAfterMin: intFrom(0, 120, "a buffer").default(0),
  price: z
    .string()
    .trim()
    .min(1, "Enter a price")
    .transform((v, ctx) => {
      const cents = parseMoneyToCents(v);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: "Enter a valid price, e.g. 15 or 15.50" });
        return z.NEVER;
      }
      return cents;
    }),
  isPublic: z.boolean().default(true),
  staffMemberIds: z.array(z.uuid()).max(50).default([]),
});
export type ServiceInput = z.input<typeof serviceSchema>;

export const staffProfileSchema = z.object({
  displayName: z.string().trim().min(2, "Enter a name").max(60),
  bio: optionalText(300),
  calendarColor: z.enum(CALENDAR_COLORS).default("graphite"),
  isBookable: z.boolean().default(true),
});

export const newStaffProfileSchema = staffProfileSchema.extend({
  membershipId: z.uuid().optional().nullable(),
});

export const workingHoursSchema = openingHoursSchema;

export const staffServiceAssignmentSchema = z
  .array(
    z.object({
      serviceId: z.uuid(),
      price: z
        .string()
        .trim()
        .optional()
        .transform((v, ctx) => {
          if (!v) return null;
          const cents = parseMoneyToCents(v);
          if (cents === null) {
            ctx.addIssue({ code: "custom", message: "Enter a valid price" });
            return z.NEVER;
          }
          return cents;
        }),
      durationMin: z
        .union([z.literal(""), z.coerce.number().int().min(5).max(480)])
        .optional()
        .transform((v) => (v === "" || v === undefined ? null : v)),
    }),
  )
  .max(200);

export const timeOffSchema = z
  .object({
    startsOn: dateSchema,
    endsOn: dateSchema,
    allDay: z.boolean().default(true),
    startTime: clockSchema.optional(),
    endTime: clockSchema.optional(),
    type: z.enum(["holiday", "sick", "personal", "other"]).default("holiday"),
    note: optionalText(200),
  })
  .superRefine((v, ctx) => {
    if (v.endsOn < v.startsOn) ctx.addIssue({ code: "custom", path: ["endsOn"], message: "The end date is before the start" });
    if (!v.allDay) {
      if (!v.startTime) ctx.addIssue({ code: "custom", path: ["startTime"], message: "Choose a start time" });
      if (!v.endTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "Choose an end time" });
      if (v.startsOn === v.endsOn && v.startTime && v.endTime && v.endTime <= v.startTime) {
        ctx.addIssue({ code: "custom", path: ["endTime"], message: "The end time must be after the start" });
      }
    }
  });

export const closureSchema = z
  .object({ startsOn: dateSchema, endsOn: dateSchema, reason: optionalText(120) })
  .refine((v) => v.endsOn >= v.startsOn, { path: ["endsOn"], message: "The end date is before the start" });

export const newCustomerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the customer's name").max(80),
  phone: z.string().trim().max(40).nullish().transform((v) => v ?? ""),
  // Idempotent: accepts its own output (null), so already-parsed input can be re-validated.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.union([z.literal(""), z.email("Enter a valid email")]))
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type NewCustomerInput = z.input<typeof newCustomerSchema>;

export const createAppointmentSchema = z
  .object({
    staffMemberId: z.uuid("Choose a barber"),
    serviceId: z.uuid("Choose a service"),
    customerId: z.uuid().optional().nullable(),
    newCustomer: newCustomerSchema.optional().nullable(),
    date: dateSchema,
    time: clockSchema,
    internalNote: optionalText(1000),
    allowOutsideHours: z.boolean().default(false),
    source: z.enum(["staff", "walk_in"]).default("staff"),
  })
  .refine((v) => v.customerId || v.newCustomer, { path: ["customer"], message: "Choose or add a customer" });
export type CreateAppointmentInput = z.input<typeof createAppointmentSchema>;

export const rescheduleSchema = z.object({
  appointmentId: z.uuid(),
  staffMemberId: z.uuid("Choose a barber"),
  date: dateSchema,
  time: clockSchema,
  version: z.coerce.number().int().min(1),
  allowOutsideHours: z.boolean().default(false),
});

export const statusChangeSchema = z.object({
  appointmentId: z.uuid(),
  to: z.enum(["confirmed", "completed", "cancelled", "no_show"]),
  reason: optionalText(300),
  version: z.coerce.number().int().min(1),
});

export const notesSchema = z.object({
  appointmentId: z.uuid(),
  internalNote: optionalText(1000),
});
