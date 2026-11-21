import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenantTx } from "@/server/db/tenant";
import type { Tx } from "@/server/db/client";
import { services, staffMembers, staffServices } from "@/server/db/schema";
import { assertCan } from "@/server/authz/permissions";
import { notFound, DomainError } from "@/server/errors";
import { serviceSchema } from "@/lib/validation/scheduling";
import type { ActorContext } from "../context";
import { audit } from "../audit";
import { parseInput } from "../validate";

export async function listServices(ctx: ActorContext, opts: { includeInactive?: boolean } = {}) {
  return withTenantTx(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: services.id,
        name: services.name,
        description: services.description,
        durationMin: services.durationMin,
        bufferAfterMin: services.bufferAfterMin,
        priceCents: services.priceCents,
        active: services.active,
        isPublic: services.isPublic,
        sortOrder: services.sortOrder,
        staffCount: sql<number>`(select count(*)::int from staff_services ss
          join staff_members sm on sm.id = ss.staff_member_id
          where ss.service_id = "services"."id" and sm.active)`,
      })
      .from(services)
      .where(and(eq(services.shopId, ctx.shopId), opts.includeInactive ? undefined : eq(services.active, true)))
      .orderBy(asc(services.sortOrder), asc(services.name));
    return rows;
  });
}

export type ServiceRow = Awaited<ReturnType<typeof listServices>>[number];

export async function getService(ctx: ActorContext, serviceId: unknown) {
  assertCan(ctx.role, "services.manage");
  const id = parseInput(z.uuid(), serviceId);
  return withTenantTx(ctx, async (tx) => {
    const [service] = await tx.select().from(services).where(eq(services.id, id));
    if (!service) throw notFound("Service not found.");
    const assigned = await tx
      .select({ staffMemberId: staffServices.staffMemberId })
      .from(staffServices)
      .where(eq(staffServices.serviceId, id));
    return { ...service, staffMemberIds: assigned.map((a) => a.staffMemberId) };
  });
}

/** Makes the service's barber list exactly `staffMemberIds`, keeping existing per-barber overrides. */
async function syncServiceStaff(tx: Tx, shopId: string, serviceId: string, staffMemberIds: string[]) {
  if (staffMemberIds.length) {
    const valid = await tx
      .select({ id: staffMembers.id })
      .from(staffMembers)
      .where(and(eq(staffMembers.shopId, shopId), inArray(staffMembers.id, staffMemberIds)));
    if (valid.length !== new Set(staffMemberIds).size) {
      throw new DomainError("VALIDATION", "One of the selected barbers wasn't found.");
    }
  }
  const current = await tx
    .select({ staffMemberId: staffServices.staffMemberId })
    .from(staffServices)
    .where(eq(staffServices.serviceId, serviceId));
  const currentIds = new Set(current.map((c) => c.staffMemberId));
  const wanted = new Set(staffMemberIds);
  const toRemove = [...currentIds].filter((id) => !wanted.has(id));
  const toAdd = [...wanted].filter((id) => !currentIds.has(id));
  if (toRemove.length) {
    await tx
      .delete(staffServices)
      .where(and(eq(staffServices.serviceId, serviceId), inArray(staffServices.staffMemberId, toRemove)));
  }
  if (toAdd.length) {
    await tx.insert(staffServices).values(toAdd.map((staffMemberId) => ({ shopId, staffMemberId, serviceId })));
  }
}

export async function createService(ctx: ActorContext, input: unknown): Promise<{ serviceId: string }> {
  assertCan(ctx.role, "services.manage");
  const data = parseInput(serviceSchema, input);
  return withTenantTx(ctx, async (tx) => {
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${services.sortOrder}), 0) + 1` })
      .from(services)
      .where(eq(services.shopId, ctx.shopId));
    const [service] = await tx
      .insert(services)
      .values({
        shopId: ctx.shopId,
        name: data.name,
        description: data.description,
        durationMin: data.durationMin,
        bufferAfterMin: data.bufferAfterMin,
        priceCents: data.price,
        isPublic: data.isPublic,
        sortOrder: next,
      })
      .returning({ id: services.id });
    await syncServiceStaff(tx, ctx.shopId, service.id, data.staffMemberIds);
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: "service.created",
      entityType: "service",
      entityId: service.id,
      changes: { name: data.name, priceCents: data.price, durationMin: data.durationMin },
    });
    return { serviceId: service.id };
  });
}

/** Price and duration changes apply to new bookings only. Existing appointments keep their snapshot. */
export async function updateService(ctx: ActorContext, serviceId: unknown, input: unknown) {
  assertCan(ctx.role, "services.manage");
  const id = parseInput(z.uuid(), serviceId);
  const data = parseInput(serviceSchema, input);
  await withTenantTx(ctx, async (tx) => {
    const [before] = await tx.select().from(services).where(eq(services.id, id));
    if (!before) throw notFound("Service not found.");
    await tx
      .update(services)
      .set({
        name: data.name,
        description: data.description,
        durationMin: data.durationMin,
        bufferAfterMin: data.bufferAfterMin,
        priceCents: data.price,
        isPublic: data.isPublic,
      })
      .where(eq(services.id, id));
    await syncServiceStaff(tx, ctx.shopId, id, data.staffMemberIds);
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: "service.updated",
      entityType: "service",
      entityId: id,
      changes: {
        name: { from: before.name, to: data.name },
        priceCents: { from: before.priceCents, to: data.price },
        durationMin: { from: before.durationMin, to: data.durationMin },
      },
    });
  });
}

export async function setServiceActive(ctx: ActorContext, serviceId: unknown, active: boolean) {
  assertCan(ctx.role, "services.manage");
  const id = parseInput(z.uuid(), serviceId);
  await withTenantTx(ctx, async (tx) => {
    const [row] = await tx.update(services).set({ active }).where(eq(services.id, id)).returning({ id: services.id });
    if (!row) throw notFound("Service not found.");
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: active ? "service.reactivated" : "service.deactivated",
      entityType: "service",
      entityId: id,
    });
  });
}
