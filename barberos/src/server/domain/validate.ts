import type { z } from "zod";
import { DomainError } from "@/server/errors";

/** Parses untrusted input. On failure it throws a VALIDATION error with per-field messages. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  throw new DomainError("VALIDATION", "Please check the highlighted fields.", fieldErrors);
}
