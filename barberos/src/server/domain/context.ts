import type { MembershipRole } from "@/server/db/schema";

/** Who is acting, and in which shop. Built only after membership has been verified. */
export type ActorContext = {
  userId: string;
  shopId: string;
  membershipId: string;
  role: MembershipRole;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};
