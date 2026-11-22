import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";
import { dateSchema } from "./scheduling";

const money = (label: string, opts: { allowEmpty?: boolean } = {}) =>
  z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (!v) {
        if (opts.allowEmpty) return 0;
        ctx.addIssue({ code: "custom", message: `Enter ${label}` });
        return z.NEVER;
      }
      const cents = parseMoneyToCents(v);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: `Enter a valid amount, e.g. 15 or 15.50` });
        return z.NEVER;
      }
      return cents;
    });

export const paymentItemSchema = z
  .object({
    kind: z.enum(["service", "product"]),
    serviceId: z.uuid().nullish(),
    productId: z.uuid().nullish(),
    staffMemberId: z.uuid().nullish(),
    description: z.string().trim().max(120).nullish(),
    quantity: z.coerce.number().int().min(1).max(99).default(1),
    unitPrice: money("a price"),
  })
  .refine((i) => i.kind !== "product" || !!i.productId, { path: ["productId"], message: "Choose a product" });

export const recordPaymentSchema = z.object({
  appointmentId: z.uuid().nullish(),
  customerId: z.uuid().nullish(),
  method: z.enum(["cash", "card", "transfer", "other"], { error: "Choose how they paid" }),
  tip: money("a tip", { allowEmpty: true }),
  tipStaffMemberId: z.uuid().nullish(),
  items: z.array(paymentItemSchema).min(1, "Add at least one item").max(30),
  note: z.string().trim().max(300).nullish(),
  idempotencyKey: z.string().min(8).max(100),
});
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;

export const voidPaymentSchema = z.object({
  paymentId: z.uuid(),
  reason: z.string().trim().min(3, "Say why it's being voided").max(300),
});

export const commissionRuleSchema = z
  .object({
    appliesTo: z.enum(["services", "products"]).default("services"),
    staffMemberId: z.uuid().nullish(),
    serviceId: z.uuid().nullish(),
    type: z.enum(["percent", "fixed"]),
    percent: z.coerce.number().min(0).max(100).nullish(),
    amount: money("an amount", { allowEmpty: true }),
  })
  .superRefine((v, ctx) => {
    if (v.type === "percent" && (v.percent === null || v.percent === undefined || Number.isNaN(v.percent))) {
      ctx.addIssue({ code: "custom", path: ["percent"], message: "Enter a percentage" });
    }
    if (v.appliesTo === "products" && v.serviceId) {
      ctx.addIssue({ code: "custom", path: ["serviceId"], message: "Product commissions can't be per service" });
    }
  });

export const EXPENSE_CATEGORIES = [
  { value: "rent", label: "Rent" },
  { value: "utilities", label: "Utilities" },
  { value: "supplies", label: "Supplies" },
  { value: "products", label: "Stock purchases" },
  { value: "equipment", label: "Equipment" },
  { value: "marketing", label: "Marketing" },
  { value: "salaries", label: "Salaries" },
  { value: "taxes", label: "Taxes & fees" },
  { value: "other", label: "Other" },
] as const;

export const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES.map((c) => c.value) as [string, ...string[]]),
  amount: money("an amount"),
  incurredOn: dateSchema,
  vendor: z.string().trim().max(80).nullish().transform((v) => v || null),
  description: z.string().trim().max(200).nullish().transform((v) => v || null),
}).refine((v) => v.amount > 0, { path: ["amount"], message: "Enter an amount above zero" });

export const productSchema = z.object({
  name: z.string().trim().min(2, "Enter a product name").max(80),
  sku: z.string().trim().max(40).nullish().transform((v) => v || null),
  category: z.string().trim().max(40).nullish().transform((v) => v || null),
  kind: z.enum(["retail", "consumable", "both"]).default("retail"),
  cost: money("a cost", { allowEmpty: true }),
  price: money("a price", { allowEmpty: true }),
  lowStockThreshold: z.coerce.number().int().min(0).max(10000).default(0),
});

export const stockMovementSchema = z.object({
  productId: z.uuid(),
  type: z.enum(["purchase", "usage", "adjustment"]),
  quantity: z.coerce.number().int().min(-10000).max(10000).refine((v) => v !== 0, "Enter a quantity"),
  unitCost: money("a cost", { allowEmpty: true }),
  note: z.string().trim().max(200).nullish().transform((v) => v || null),
});
