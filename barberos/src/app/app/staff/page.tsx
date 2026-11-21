import type { Metadata } from "next";
import { requirePageContext } from "@/server/tenancy";
import { listTeam } from "@/server/domain/team/service";
import { assignableRoles, can, canManageMember, ROLE_LABELS } from "@/server/authz/permissions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ActionButton } from "@/components/ui/action-button";
import { InviteForm } from "./invite-form";
import { RoleForm } from "./role-form";
import { revokeInviteAction, setMemberActiveAction } from "./actions";

export const metadata: Metadata = { title: "Staff" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function StaffPage() {
  const ctx = await requirePageContext("team.view");
  const team = await listTeam(ctx);
  const roleOptions = assignableRoles(ctx.role).map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  const canInvite = can(ctx.role, "team.invite");
  const canManage = can(ctx.role, "team.manage");

  return (
    <>
      <PageHeader title="Staff" description="Everyone who can sign in to your shop, and what they can access." />

      <div className="flex flex-col gap-6">
        {canInvite ? (
          <Card>
            <CardHeader
              title="Invite someone"
              description="They'll get an email with a link to join. The link works once and expires in 7 days."
            />
            <CardBody>
              <InviteForm roles={roleOptions} />
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Team" description={`${team.members.length} ${team.members.length === 1 ? "person" : "people"}`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[12px] uppercase tracking-wider text-fg-subtle">
                  <th className="px-5 py-2.5 font-medium">Name</th>
                  <th className="px-5 py-2.5 font-medium">Role</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Joined</th>
                  <th className="px-5 py-2.5" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {team.members.map((m) => {
                  const manageable = canManage && m.membershipId !== ctx.membershipId && canManageMember(ctx.role, m.role);
                  return (
                    <tr key={m.membershipId} className={m.status === "deactivated" ? "text-fg-subtle" : undefined}>
                      <td className="px-5 py-3">
                        <div className="font-medium">
                          {m.name}
                          {m.membershipId === ctx.membershipId ? <span className="ml-1.5 text-[12px] font-normal text-fg-subtle">(you)</span> : null}
                        </div>
                        <div className="text-[12px] text-fg-muted">{m.email}</div>
                      </td>
                      <td className="px-5 py-3">
                        {manageable && m.status === "active" && roleOptions.length > 1 ? (
                          <RoleForm membershipId={m.membershipId} role={m.role} options={roleOptions} name={m.name} />
                        ) : (
                          <Badge tone={m.role === "owner" ? "inverse" : "neutral"}>{ROLE_LABELS[m.role]}</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {m.status === "active" ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>}
                      </td>
                      <td className="px-5 py-3 text-fg-muted tabular">{dateFmt.format(m.joinedAt)}</td>
                      <td className="px-5 py-3 text-right">
                        {manageable ? (
                          m.status === "active" ? (
                            <ActionButton
                              action={setMemberActiveAction}
                              fields={{ membershipId: m.membershipId, active: "false" }}
                              variant="danger"
                              confirm={`Deactivate ${m.name}? They will lose access to this shop immediately. Their history is kept.`}
                            >
                              Deactivate
                            </ActionButton>
                          ) : (
                            <ActionButton action={setMemberActiveAction} fields={{ membershipId: m.membershipId, active: "true" }} variant="secondary">
                              Reactivate
                            </ActionButton>
                          )
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {team.pending.length ? (
          <Card>
            <CardHeader title="Pending invitations" description="Invites that haven't been accepted yet." />
            <ul className="divide-y divide-border">
              {team.pending.map((p) => {
                const { expired } = p;
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.email}</span>
                      <span className="block text-[12px] text-fg-muted">
                        {ROLE_LABELS[p.role]} · {expired ? "Expired" : `Expires ${dateFmt.format(p.expiresAt)}`}
                      </span>
                    </span>
                    {expired ? <Badge tone="danger">Expired</Badge> : <Badge tone="warning">Pending</Badge>}
                    {canInvite && roleOptions.some((r) => r.value === p.role) ? (
                      <ActionButton action={revokeInviteAction} fields={{ invitationId: p.id }} confirm={`Cancel the invitation to ${p.email}?`}>
                        Cancel invite
                      </ActionButton>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <CardBody className="border-t border-border text-[13px] text-fg-muted">
              To resend an invitation, invite the same email again. The old link stops working.
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="What each role can do" />
          <CardBody className="grid gap-4 text-[13px] sm:grid-cols-3">
            <div>
              <p className="font-medium">Owner</p>
              <p className="mt-1 text-fg-muted">Full access, including finances, commission rules and shop deletion.</p>
            </div>
            <div>
              <p className="font-medium">Manager</p>
              <p className="mt-1 text-fg-muted">Runs the day-to-day: calendar, customers, settings and barbers.</p>
            </div>
            <div>
              <p className="font-medium">Barber</p>
              <p className="mt-1 text-fg-muted">Uses the mobile app: own schedule, customers, notes and earnings.</p>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
