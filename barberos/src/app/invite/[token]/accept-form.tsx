"use client";

import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { useFormAction } from "@/components/ui/use-form-action";
import { acceptInviteAction } from "./actions";

export function AcceptInviteForm({ token, shopName }: { token: string; shopName: string }) {
  const { state, onSubmit, pending } = useFormAction(acceptInviteAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <SubmitButton size="lg" pending={pending} pendingLabel="Joining…">
        Join {shopName}
      </SubmitButton>
    </form>
  );
}
