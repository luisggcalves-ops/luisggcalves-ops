/** Errors that domain services throw on purpose. Their messages are safe to show to users. */
export class DomainError extends Error {
  constructor(
    public readonly code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION" | "INVALID_STATE",
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const forbidden = (message = "You don't have permission to do that.") =>
  new DomainError("FORBIDDEN", message);
export const notFound = (message = "Not found.") => new DomainError("NOT_FOUND", message);
export const conflict = (message: string, fieldErrors?: Record<string, string>) =>
  new DomainError("CONFLICT", message, fieldErrors);
export const invalidState = (message: string) => new DomainError("INVALID_STATE", message);

/** Postgres unique violation on a specific constraint. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = findPgError(err);
  return !!e && e.code === "23505" && (!constraint || e.constraint === constraint);
}

function findPgError(err: unknown): { code?: string; constraint?: string } | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    const c = cur as { code?: unknown; constraint?: string; cause?: unknown };
    if (typeof c.code === "string" && /^[0-9A-Z]{5}$/.test(c.code)) return c as { code: string; constraint?: string };
    cur = c.cause;
  }
  return undefined;
}
