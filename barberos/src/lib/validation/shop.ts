import { z } from "zod";
import { isValidTimeZone, timeToMinutes } from "@/lib/time";

export const CURRENCIES = [
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British pound (£)" },
  { code: "USD", label: "US dollar ($)" },
  { code: "CHF", label: "Swiss franc (CHF)" },
  { code: "BRL", label: "Brazilian real (R$)" },
  { code: "CAD", label: "Canadian dollar (CA$)" },
  { code: "AUD", label: "Australian dollar (A$)" },
] as const;

export const DEFAULT_TIMEZONE = "Europe/Lisbon";
export const DEFAULT_CURRENCY = "EUR";

/** Reserved so shop booking links never collide with app routes. */
const RESERVED_SLUGS = new Set(["app", "api", "admin", "barber", "book", "invite", "onboarding", "settings", "sign-in", "sign-up", "www"]);

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Use at least 3 characters")
  .max(48, "Use at most 48 characters")
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/, "Use lowercase letters, numbers and dashes only")
  .refine((s) => !RESERVED_SLUGS.has(s), "This link is reserved, please choose another");

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const openingIntervalSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  opensAt: timeString,
  closesAt: timeString,
});

export const openingHoursSchema = z
  .array(openingIntervalSchema)
  .max(7 * 4, "Too many intervals")
  .superRefine((intervals, ctx) => {
    intervals.forEach((iv, i) => {
      if (timeToMinutes(iv.closesAt) <= timeToMinutes(iv.opensAt)) {
        ctx.addIssue({ code: "custom", path: [i, "closesAt"], message: "Closing time must be after opening time" });
      }
    });
    for (let day = 0; day < 7; day++) {
      const sorted = intervals
        .map((iv, i) => ({ ...iv, i }))
        .filter((iv) => iv.weekday === day)
        .sort((a, b) => timeToMinutes(a.opensAt) - timeToMinutes(b.opensAt));
      for (let k = 1; k < sorted.length; k++) {
        if (timeToMinutes(sorted[k].opensAt) < timeToMinutes(sorted[k - 1].closesAt)) {
          ctx.addIssue({ code: "custom", path: [sorted[k].i, "opensAt"], message: "Intervals on the same day overlap" });
        }
      }
    }
  });

export type OpeningInterval = z.infer<typeof openingIntervalSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const shopProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter your shop's name").max(80),
  slug: slugSchema,
  timezone: z.string().refine(isValidTimeZone, "Choose a valid time zone"),
  currency: z.enum(CURRENCIES.map((c) => c.code) as [string, ...string[]]),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.union([z.literal(""), z.email("Enter a valid email")]))
    .optional()
    .transform((v) => (v ? v : null)),
  addressLine: optionalText(160),
  city: optionalText(80),
  postalCode: optionalText(20),
});

export type ShopProfileInput = z.input<typeof shopProfileSchema>;

export const createShopSchema = shopProfileSchema.extend({
  openingHours: openingHoursSchema,
  ownerIsBarber: z.boolean(),
});

export type CreateShopInput = z.input<typeof createShopSchema>;

/** Sensible starting hours that the owner edits during onboarding: Tue–Sat 09:00–19:00. */
export const DEFAULT_OPENING_HOURS: OpeningInterval[] = [2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  opensAt: "09:00",
  closesAt: "19:00",
}));
