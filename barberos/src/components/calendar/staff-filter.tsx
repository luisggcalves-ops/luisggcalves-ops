"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/field";

export function StaffFilter({
  value,
  staff,
  hrefTemplate,
}: {
  value: string;
  staff: { id: string; displayName: string }[];
  /** URL with `{staff}` to replace. */
  hrefTemplate: string;
}) {
  const router = useRouter();
  return (
    <div className="w-44">
      <Select
      aria-label="Barber"
      value={value}
      onChange={(e) => router.push(hrefTemplate.replace("{staff}", e.target.value), { scroll: false })}
      className="h-8 text-[13px]"
    >
      <option value="all">All barbers</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.displayName}
        </option>
      ))}
      </Select>
    </div>
  );
}
