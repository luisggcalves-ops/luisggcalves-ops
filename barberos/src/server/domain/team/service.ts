import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenantTx } from "@/server/db/tenant";
import { invitations, shopMemberships, shops, staffMembers, users } from "@/server/db/schema";
import type { MembershipRole } from "@/server/db/schema";
import { assertCan, assignableRoles, canManageMember } from "@/server/authz/permissions";
import { conflict, forbidden, invalidState, notFound } from "@/server/errors";
import type { Tx } from "@/server/db/client";
import { hashToken, randomToken } from "@/lib/ids";
import { changeRoleSchema, inviteSchema } from "@/lib/validation/team";
import type { ActorContext, SessionUser } from "../context";
import { audit } from "../audit";
import { initStaffProfile } from "../staff/init";
import { parseInput } from "../validate";

export const INVITE_TTL_DAYS = 7;

export async function listTeam(ctx: ActorContext) {
  assertCan(ctx.role, "team.view");
  return withTenantTx(ctx, async (tx) => {
    const members = await tx
      .select({
        membershipId: shopMemberships.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        role: shopMemberships.role,
        status: shopMemberships.status,
        joinedAt: shopMemberships.createdAt,
        staffMemberId: staffMembers.id,
      })
      .from(shopMemberships)
      .innerJoin(users, eq(users.id, shopMemberships.userId))
      .leftJoin(staffMembers, eq(staffMembers.membershipId, shopMemberships.id))
      .where(eq(shopMemberships.shopId, ctx.shopId))
      .orderBy(
        sql`case ${shopMemberships.role} when 'owner' then 0 when 'manager' then 1 else 2 end`,
        asc(users.name),
      );

    const pending = await tx
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.shopId, ctx.shopId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .orderBy(asc(invitations.createdAt));

    const now = Date.now();
    return { members, pending: pending.map((p) => ({ ...p, expired: p.expiresAt.getTime() < now })) };
  });
}

/**
 * Creates an invitation and returns the one-time link.
 * A new invite to the same email replaces the previous pending one.
 */
export async function inviteMember(
  ctx: ActorContext,
  input: unknown,
): Promise<{ invitationId: string; token: string; email: string; role: MembershipRole; shopName: string }> {
  assertCan(ctx.role, "team.invite");
  const data = parseInput(inviteSchema, input);
  if (!assignableRoles(ctx.role).includes(data.role)) {
    throw forbidden(`You can't invite someone as ${data.role}.`);
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  return withTenantTx(ctx, async (tx) => {
    const [existingMember] = await tx
      .select({ id: shopMemberships.id })
      .from(shopMemberships)
      .innerJoin(users, eq(users.id, shopMemberships.userId))
      .where(and(eq(shopMemberships.shopId, ctx.shopId), eq(users.email, data.email)));
    if (existingMember) {
      throw conflict("This person is already on your team.", { email: "Already a team member" });
    }

    await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.shopId, ctx.shopId),
          eq(invitations.email, data.email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      );

    const [invitation] = await tx
      .insert(invitations)
      .values({
        shopId: ctx.shopId,
        email: data.email,
        role: data.role,
        tokenHash: hashToken(token),
        expiresAt,
        invitedByMembershipId: ctx.membershipId,
      })
      .returning({ id: invitations.id });

    const [shop] = await tx.select({ name: shops.name }).from(shops).where(eq(shops.id, ctx.shopId));

    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: "team.invited",
      entityType: "invitation",
      entityId: invitation.id,
      changes: { email: data.email, role: data.role },
    });

    return { invitationId: invitation.id, token, email: data.email, role: data.role, shopName: shop.name };
  });
}

export async function revokeInvitation(ctx: ActorContext, invitationId: unknown) {
  assertCan(ctx.role, "team.invite");
  const id = parseInput(z.uuid(), invitationId);
  await withTenantTx(ctx, async (tx) => {
    const [inv] = await tx.select().from(invitations).where(eq(invitations.id, id));
    if (!inv) throw notFound("Invitation not found.");
    if (!assignableRoles(ctx.role).includes(inv.role)) throw forbidden();
    if (inv.acceptedAt) throw invalidState("This invitation was already accepted.");
    if (inv.revokedAt) return;
    await tx.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, id));
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: "team.invitation_revoked",
      entityType: "invitation",
      entityId: id,
      changes: { email: inv.email },
    });
  });
}

async function loadManageableMember(ctx: ActorContext, tx: Tx, membershipId: string) {
  const [target] = await tx.select().from(shopMemberships).where(eq(shopMemberships.id, membershipId));
  if (!target) throw notFound("Team member not found.");
  if (target.id === ctx.membershipId) throw forbidden("You can't change your own access.");
  if (!canManageMember(ctx.role, target.role)) throw forbidden();
  return target;
}

export async function changeMemberRole(ctx: ActorContext, input: unknown) {
  assertCan(ctx.role, "team.manage");
  const data = parseInput(changeRoleSchema, input);
  if (!assignableRoles(ctx.role).includes(data.role)) throw forbidden();
  await withTenantTx(ctx, async (tx) => {
    const target = await loadManageableMember(ctx, tx, data.membershipId);
    if (target.role === data.role) return;
    await tx.update(shopMemberships).set({ role: data.role }).where(eq(shopMemberships.id, target.id));
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: "team.role_changed",
      entityType: "membership",
      entityId: target.id,
      changes: { role: { from: target.role, to: data.role } },
    });
  });
}

/** Deactivated members can no longer sign in to this shop. Their history is kept. */
export async function setMemberActive(ctx: ActorContext, membershipId: unknown, active: boolean) {
  assertCan(ctx.role, "team.manage");
  const id = parseInput(z.uuid(), membershipId);
  await withTenantTx(ctx, async (tx) => {
    const target = await loadManageableMember(ctx, tx, id);
    const status = active ? "active" : "deactivated";
    if (target.status === status) return;
    await tx.update(shopMemberships).set({ status }).where(eq(shopMemberships.id, target.id));
    await tx.update(staffMembers).set({ active }).where(eq(staffMembers.membershipId, target.id));
    await audit(tx, {
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      action: active ? "team.member_reactivated" : "team.member_deactivated",
      entityType: "membership",
      entityId: target.id,
    });
  });
}

export type InvitationPreview = {
  shopId: string;
  shopName: string;
  email: string;
  role: MembershipRole;
  state: "valid" | "expired" | "accepted" | "revoked";
};

/** Reads an invitation by its raw token. This is the only cross-shop lookup, done through a narrow SQL function. */
export async function getInvitationPreview(token: string): Promise<InvitationPreview | null> {
  if (!token || token.length > 200) return null;
  return withTenantTx({}, async (tx) => {
    const result = await tx.execute<{
      invitation_id: string;
      shop_id: string;
      shop_name: string;
      email: string;
      role: MembershipRole;
      expires_at: Date | string;
      accepted_at: Date | string | null;
      revoked_at: Date | string | null;
    }>(sql`select * from app_invitation_by_token_hash(${hashToken(token)})`);
    const row = result.rows[0];
    if (!row) return null;
    const state = row.accepted_at
      ? "accepted"
      : row.revoked_at
        ? "revoked"
        : new Date(row.expires_at).getTime() < Date.now()
          ? "expired"
          : "valid";
    return { shopId: row.shop_id, shopName: row.shop_name, email: row.email, role: row.role, state };
  });
}

/**
 * Accepts an invitation for the signed-in user. The token proves the user may
 * join this shop, and the invitation email must match the account email.
 */
export async function acceptInvitation(user: SessionUser, token: string): Promise<{ shopId: string; role: MembershipRole }> {
  const preview = await getInvitationPreview(token);
  if (!preview) throw notFound("This invitation link is not valid.");
  if (preview.state === "expired") throw invalidState("This invitation has expired. Ask for a new one.");
  if (preview.state === "revoked") throw invalidState("This invitation was cancelled.");
  if (preview.email.toLowerCase() !== user.email.toLowerCase()) {
    throw forbidden(`This invitation was sent to ${preview.email}. Sign in with that email to accept it.`);
  }

  const shopId = preview.shopId;
  return withTenantTx({ shopId, userId: user.id }, async (tx) => {
    const [existing] = await tx
      .select()
      .from(shopMemberships)
      .where(and(eq(shopMemberships.shopId, shopId), eq(shopMemberships.userId, user.id)));
    if (existing?.status === "deactivated") {
      throw forbidden("Your access to this shop was deactivated. Contact the shop owner.");
    }

    const now = new Date();
    const claimed = await tx
      .update(invitations)
      .set({ acceptedAt: now, acceptedByUserId: user.id })
      .where(
        and(
          eq(invitations.tokenHash, hashToken(token)),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .returning({ id: invitations.id, role: invitations.role });

    if (existing) {
      // Already a member (for example, a double click). Nothing more to do.
      return { shopId, role: existing.role };
    }
    if (!claimed.length) throw invalidState("This invitation was already used.");

    const role = claimed[0].role;
    const [{ id: membershipId }] = await tx
      .insert(shopMemberships)
      .values({ shopId, userId: user.id, role })
      .returning({ id: shopMemberships.id });

    if (role === "barber") {
      const [staff] = await tx
        .insert(staffMembers)
        .values({ shopId, membershipId, displayName: user.name })
        .returning({ id: staffMembers.id });
      await initStaffProfile(tx, shopId, staff.id);
    }

    await audit(tx, {
      shopId,
      actorUserId: user.id,
      action: "team.invitation_accepted",
      entityType: "membership",
      entityId: membershipId,
      changes: { role },
    });
    return { shopId, role };
  });
}
