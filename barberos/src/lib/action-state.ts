/** The result every form action returns. Shared by server actions and client forms. */
export type ActionState =
  | { status: "idle" }
  | { status: "success"; message?: string; data?: Record<string, unknown> }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

export const IDLE: ActionState = { status: "idle" };
