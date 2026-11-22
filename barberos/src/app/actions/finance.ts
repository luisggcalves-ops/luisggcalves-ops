"use server";

import { revalidatePath } from "next/cache";
import { requireActionContext } from "@/server/tenancy";
import { runAction, type ActionState } from "@/server/actions";
import {
  createExpense,
  deactivateCommissionRule,
  recordPayment,
  setCommissionRule,
  voidExpense,
  voidPayment,
} from "@/server/domain/finance/service";
import { createProduct, recordStockMovement, setProductActive, updateProduct } from "@/server/domain/finance/inventory";
import { readJson, readString } from "@/server/form";

function revalidateMoney() {
  revalidatePath("/app", "layout");
  revalidatePath("/barber", "layout");
}

export async function recordPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("payments.record");
    const { duplicate } = await recordPayment(ctx, {
      appointmentId: readString(formData, "appointmentId") || null,
      customerId: readString(formData, "customerId") || null,
      method: readString(formData, "method"),
      tip: readString(formData, "tip"),
      tipStaffMemberId: readString(formData, "tipStaffMemberId") || null,
      items: readJson(formData, "items"),
      note: readString(formData, "note"),
      idempotencyKey: readString(formData, "idempotencyKey"),
    });
    revalidateMoney();
    return { status: "success", message: duplicate ? "Payment was already recorded." : "Payment recorded." };
  });
}

export async function voidPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("payments.void");
    await voidPayment(ctx, { paymentId: readString(formData, "paymentId"), reason: readString(formData, "reason") });
    revalidateMoney();
    return { status: "success", message: "Payment voided. Commission and stock were reversed." };
  });
}

export async function setCommissionRuleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("commissions.manage");
    await setCommissionRule(ctx, {
      appliesTo: readString(formData, "appliesTo") || "services",
      staffMemberId: readString(formData, "staffMemberId") || null,
      serviceId: readString(formData, "serviceId") || null,
      type: readString(formData, "type"),
      percent: readString(formData, "percent") || null,
      amount: readString(formData, "amount"),
    });
    revalidateMoney();
    return { status: "success", message: "Commission rule saved. It applies to new payments." };
  });
}

export async function deactivateRuleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("commissions.manage");
    await deactivateCommissionRule(ctx, readString(formData, "ruleId"));
    revalidateMoney();
    return { status: "success" };
  });
}

export async function createExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("expenses.manage");
    await createExpense(ctx, {
      category: readString(formData, "category"),
      amount: readString(formData, "amount"),
      incurredOn: readString(formData, "incurredOn"),
      vendor: readString(formData, "vendor"),
      description: readString(formData, "description"),
    });
    revalidateMoney();
    return { status: "success", message: "Expense added." };
  });
}

export async function voidExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("expenses.manage");
    await voidExpense(ctx, { expenseId: readString(formData, "expenseId"), reason: readString(formData, "reason") || "Removed" });
    revalidateMoney();
    return { status: "success" };
  });
}

function readProduct(formData: FormData) {
  return {
    name: readString(formData, "name"),
    sku: readString(formData, "sku"),
    category: readString(formData, "category"),
    kind: readString(formData, "kind") || "retail",
    cost: readString(formData, "cost"),
    price: readString(formData, "price"),
    lowStockThreshold: readString(formData, "lowStockThreshold") || "0",
  };
}

export async function createProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("inventory.manage");
    const stock = Math.max(0, Math.min(10000, Number(readString(formData, "initialStock") || 0) || 0));
    await createProduct(ctx, readProduct(formData), stock);
    revalidateMoney();
    return { status: "success", message: "Product added." };
  });
}

export async function updateProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("inventory.manage");
    await updateProduct(ctx, readString(formData, "productId"), readProduct(formData));
    revalidateMoney();
    return { status: "success", message: "Product saved." };
  });
}

export async function setProductActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("inventory.manage");
    await setProductActive(ctx, readString(formData, "productId"), readString(formData, "active") === "true");
    revalidateMoney();
    return { status: "success" };
  });
}

export async function stockMovementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await requireActionContext("inventory.manage");
    await recordStockMovement(ctx, {
      productId: readString(formData, "productId"),
      type: readString(formData, "type"),
      quantity: readString(formData, "quantity"),
      unitCost: readString(formData, "unitCost"),
      note: readString(formData, "note"),
    });
    revalidateMoney();
    return { status: "success", message: "Stock updated." };
  });
}
