"use client";

import { Select } from "@/components/ui/field";
import { useFormAction } from "@/components/ui/use-form-action";
import { changeRoleAction } from "./actions";

/** Changing the select saves immediately. Errors show inline. */
export function RoleForm({
  membershipId,
  role,
  options,
  name,
}: {
  membershipId: string;
  role: string;
  options: { value: string; label: string }[];
  name: string;
}) {
  const { state, onSubmit, pending } = useFormAction(changeRoleAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col items-start gap-1">
      <input type="hidden" name="membershipId" value={membershipId} />
      <Select
        name="role"
        defaultValue={role}
        disabled={pending}
        aria-label={`Role for ${name}`}
        className="h-8 w-32 text-[13px]"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {state.status === "error" ? (
        <span role="alert" className="text-[12px] text-danger">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
