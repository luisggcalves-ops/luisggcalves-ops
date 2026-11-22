/**
 * Structured, one-line JSON logs. Hosting platforms (Vercel, Render, …) index them,
 * and an error tracker can be attached later without touching call sites.
 * Never pass personal data or secrets here: ids and codes only.
 */
type Level = "info" | "warn" | "error";

/** Paths can carry one-time tokens (invites, manage-booking links). Strip them before logging. */
export function redactPath(path: string): string {
  return path
    .replace(/(\/(?:invite|manage)\/)[^/?#]+/g, "$1[redacted]")
    .replace(/([?&](?:token|code|key)=)[^&#]+/gi, "$1[redacted]");
}

export function logEvent(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function errorFields(err: unknown) {
  if (err instanceof Error) {
    const digest = (err as { digest?: unknown }).digest;
    return { error: err.name, message: err.message.slice(0, 500), digest: typeof digest === "string" ? digest : undefined, stack: err.stack?.split("\n").slice(0, 6).join(" | ") };
  }
  return { error: "NonError", message: String(err).slice(0, 500) };
}
