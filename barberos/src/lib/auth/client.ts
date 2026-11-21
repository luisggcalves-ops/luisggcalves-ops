import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

/** Only allow same-site relative redirects, so `?next=` can't send users to another site. */
export function safeNext(next: string | null | undefined, fallback = "/start"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
