import { Badge } from "@/components/ui/badge";
import type { AppointmentStatus } from "@/server/db/schema";

const MAP: Record<AppointmentStatus, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "inverse" }> = {
  pending: { label: "Pending", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "neutral" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
  no_show: { label: "No-show", tone: "danger" },
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const s = MAP[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export const STATUS_LABEL = Object.fromEntries(Object.entries(MAP).map(([k, v]) => [k, v.label])) as Record<AppointmentStatus, string>;
