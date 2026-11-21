import { describe, expect, it } from "vitest";
import {
  acceptInvitation,
  changeMemberRole,
  getInvitationPreview,
  inviteMember,
  listTeam,
  revokeInvitation,
  setMemberActive,
} from "@/server/domain/team/service";
import { getOwnStaffProfile, listUserMemberships } from "@/server/domain/shops/service";
import { DomainError } from "@/server/errors";
import { actorFor, addMember, adminPool, createUser, shopWithOwner } from "./helpers";

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "OK";
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
}

describe("invitations", () => {
  it("invites a barber who accepts and gets a membership and a barber profile", async () => {
    const { ctx, shopId } = await shopWithOwner();
    const barber = await createUser("Rui Costa", "rui@example.test");
    const invite = await inviteMember(ctx, { email: " RUI@example.test ", role: "barber" });
    expect(invite.email).toBe("rui@example.test");

    expect(await getInvitationPreview(invite.token)).toMatchObject({ state: "valid", role: "barber", shopId });
    const result = await acceptInvitation(barber, invite.token);
    expect(result).toEqual({ shopId, role: "barber" });

    const barberCtx = await actorFor(barber, shopId);
    expect((await getOwnStaffProfile(barberCtx))?.displayName).toBe("Rui Costa");
    expect((await getInvitationPreview(invite.token))?.state).toBe("accepted");
    expect((await listUserMemberships(barber.id)).map((m) => m.shopId)).toEqual([shopId]);

    // Accepting twice is harmless.
    expect(await acceptInvitation(barber, invite.token)).toEqual({ shopId, role: "barber" });
  });

  it("only stores a hash of the token", async () => {
    const { ctx } = await shopWithOwner();
    const invite = await inviteMember(ctx, { email: "x@example.test", role: "barber" });
    const { rows } = await adminPool.query("select token_hash from invitations");
    expect(rows[0].token_hash).not.toContain(invite.token);
    expect(rows[0].token_hash).toHaveLength(64);
  });

  it("requires the signed-in email to match the invitation", async () => {
    const { ctx } = await shopWithOwner();
    const other = await createUser("Other", "other@example.test");
    const invite = await inviteMember(ctx, { email: "intended@example.test", role: "barber" });
    expect(await code(acceptInvitation(other, invite.token))).toBe("FORBIDDEN");
  });

  it("rejects revoked, expired, replaced and unknown invitations", async () => {
    const { ctx } = await shopWithOwner();
    const user = await createUser("Joe", "joe@example.test");

    const revoked = await inviteMember(ctx, { email: "joe@example.test", role: "barber" });
    await revokeInvitation(ctx, revoked.invitationId);
    expect(await code(acceptInvitation(user, revoked.token))).toBe("INVALID_STATE");

    const replaced = await inviteMember(ctx, { email: "joe@example.test", role: "barber" });
    const current = await inviteMember(ctx, { email: "joe@example.test", role: "barber" });
    expect((await getInvitationPreview(replaced.token))?.state).toBe("revoked");

    await adminPool.query("update invitations set expires_at = now() - interval '1 minute' where id = $1", [current.invitationId]);
    expect(await code(acceptInvitation(user, current.token))).toBe("INVALID_STATE");

    expect(await code(acceptInvitation(user, "not-a-real-token"))).toBe("NOT_FOUND");
  });

  it("refuses to invite someone who is already a member", async () => {
    const { ctx, shopId } = await shopWithOwner();
    const { user } = await addMember(shopId, "barber");
    expect(await code(inviteMember(ctx, { email: user.email, role: "barber" }))).toBe("CONFLICT");
  });

  it("limits who can invite whom", async () => {
    const { shopId } = await shopWithOwner();
    const { ctx: manager } = await addMember(shopId, "manager");
    const { ctx: barber } = await addMember(shopId, "barber");
    expect(await code(inviteMember(manager, { email: "b@example.test", role: "barber" }))).toBe("OK");
    expect(await code(inviteMember(manager, { email: "m@example.test", role: "manager" }))).toBe("FORBIDDEN");
    expect(await code(inviteMember(barber, { email: "c@example.test", role: "barber" }))).toBe("FORBIDDEN");
    expect(await code(inviteMember(manager, { email: "o@example.test", role: "owner" }))).toBe("VALIDATION");
  });
});

describe("member management", () => {
  it("lets the owner change roles but not their own", async () => {
    const { ctx, shopId } = await shopWithOwner();
    const { ctx: barber } = await addMember(shopId, "barber");
    await changeMemberRole(ctx, { membershipId: barber.membershipId, role: "manager" });
    expect((await actorFor({ id: barber.userId, name: "", email: "" }, shopId)).role).toBe("manager");
    expect(await code(changeMemberRole(ctx, { membershipId: ctx.membershipId, role: "barber" }))).toBe("FORBIDDEN");
  });

  it("stops managers from managing other managers or the owner", async () => {
    const { ctx: owner, shopId } = await shopWithOwner();
    const { ctx: m1 } = await addMember(shopId, "manager");
    const { ctx: m2 } = await addMember(shopId, "manager");
    const { ctx: barber } = await addMember(shopId, "barber");
    expect(await code(setMemberActive(m1, m2.membershipId, false))).toBe("FORBIDDEN");
    expect(await code(setMemberActive(m1, owner.membershipId, false))).toBe("FORBIDDEN");
    expect(await code(changeMemberRole(m1, { membershipId: barber.membershipId, role: "manager" }))).toBe("FORBIDDEN");
    expect(await code(setMemberActive(barber, m1.membershipId, false))).toBe("FORBIDDEN");
    expect(await code(setMemberActive(m1, barber.membershipId, false))).toBe("OK");
  });

  it("deactivation removes access but keeps history, and can be undone", async () => {
    const { ctx, shopId } = await shopWithOwner();
    const { user, ctx: barber } = await addMember(shopId, "barber");
    await setMemberActive(ctx, barber.membershipId, false);
    expect(await listUserMemberships(user.id)).toEqual([]);
    const team = await listTeam(ctx);
    expect(team.members.find((m) => m.membershipId === barber.membershipId)?.status).toBe("deactivated");

    await setMemberActive(ctx, barber.membershipId, true);
    expect((await listUserMemberships(user.id)).map((m) => m.shopId)).toEqual([shopId]);

    const { rows } = await adminPool.query("select action from audit_log where shop_id = $1 order by created_at", [shopId]);
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(["team.member_deactivated", "team.member_reactivated"]),
    );
  });

  it("does not let a deactivated member rejoin through an old invitation", async () => {
    const { ctx, shopId } = await shopWithOwner();
    const user = await createUser("Leo", "leo@example.test");
    const first = await inviteMember(ctx, { email: user.email, role: "barber" });
    await acceptInvitation(user, first.token);
    const leo = await actorFor(user, shopId);
    await setMemberActive(ctx, leo.membershipId, false);
    // A new invite isn't possible (still a member), and the old token was used.
    expect(await code(inviteMember(ctx, { email: user.email, role: "barber" }))).toBe("CONFLICT");
    expect(await code(acceptInvitation(user, first.token))).toBe("FORBIDDEN");
  });
});
