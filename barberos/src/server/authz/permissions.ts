import type { MembershipRole } from "@/server/db/schema";
import { forbidden } from "@/server/errors";

/**
 * Every permission the app checks. Server code always checks permissions,
 * and the UI uses the same map only to hide actions a role can't take.
 * New modules add their permissions here.
 */
export const PERMISSIONS = [
  "shop.view",
  "shop.update", // profile, branding, opening hours, booking policy
  "shop.delete",
  "team.view",
  "team.invite", // invite barbers (managers) or anyone (owners)
  "team.manage", // change roles, deactivate members
  "dashboard.view", // owner/manager dashboard
  "barber_app.view",
  "audit.view",
  "services.manage", // create/edit services and prices
  "staff.view", // barber profiles, hours and time off
  "staff.manage",
  "appointments.view_all", // the shared calendar
  "appointments.manage", // create/edit/cancel anyone's appointments
  "appointments.manage_own", // a barber's own appointments
  "customers.search", // find or add a customer while booking
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<MembershipRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: [
    "shop.view",
    "shop.update",
    "team.view",
    "team.invite",
    "team.manage",
    "dashboard.view",
    "barber_app.view",
    "services.manage",
    "staff.view",
    "staff.manage",
    "appointments.view_all",
    "appointments.manage",
    "appointments.manage_own",
    "customers.search",
  ],
  barber: ["shop.view", "barber_app.view", "appointments.manage_own", "customers.search"],
};

export function can(role: MembershipRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function assertCan(role: MembershipRole, permission: Permission): void {
  if (!can(role, permission)) throw forbidden();
}

/** Which roles a member with `actorRole` may grant (on invite or role change). */
export function assignableRoles(actorRole: MembershipRole): MembershipRole[] {
  switch (actorRole) {
    case "owner":
      return ["manager", "barber"];
    case "manager":
      return ["barber"];
    default:
      return [];
  }
}

/**
 * Whether `actorRole` may change or deactivate a member that has `targetRole`.
 * Nobody can modify the owner through team management (ownership transfer is a separate flow).
 * Managers can only manage barbers.
 */
export function canManageMember(actorRole: MembershipRole, targetRole: MembershipRole): boolean {
  if (targetRole === "owner") return false;
  if (actorRole === "owner") return true;
  if (actorRole === "manager") return targetRole === "barber";
  return false;
}

export const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Owner",
  manager: "Manager",
  barber: "Barber",
};

/** Where a member lands after signing in. */
export function homePathFor(role: MembershipRole): string {
  return can(role, "dashboard.view") ? "/app" : "/barber";
}
