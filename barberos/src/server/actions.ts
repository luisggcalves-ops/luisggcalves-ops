import "server-only";
import { unstable_rethrow } from "next/navigation";
import { DomainError } from "@/server/errors";
import type { ActionState } from "@/lib/action-state";

export type { ActionState };

/**
 * Runs an action body and converts expected domain errors into form state.
 * Unexpected errors are logged and shown as a generic message, so internals never leak.
 */
export async function runAction(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err); // let Next.js redirects and notFound() through
    if (err instanceof DomainError) {
      return { status: "error", message: err.message, fieldErrors: err.fieldErrors };
    }
    console.error("[action] unexpected error", err);
    return { status: "error", message: "Something went wrong. Please try again." };
  }
}
