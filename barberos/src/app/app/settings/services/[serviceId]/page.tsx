import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { getService } from "@/server/domain/services/service";
import { listStaff } from "@/server/domain/staff/service";
import { DomainError } from "@/server/errors";
import { centsToInput } from "@/lib/money";
import { ServiceForm } from "../service-form";
import { updateServiceAction } from "../actions";

export const metadata: Metadata = { title: "Edit service" };

export default async function EditServicePage({ params }: { params: Promise<{ serviceId: string }> }) {
  const ctx = await requirePageContext("services.manage");
  const { serviceId } = await params;
  const [service, staff] = await Promise.all([
    getService(ctx, serviceId).catch((e) => {
      if (e instanceof DomainError) return null;
      throw e;
    }),
    listStaff(ctx),
  ]);
  if (!service) notFound();
  return (
    <div className="flex flex-col gap-4">
      <Link href="/app/settings/services" className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> All services
      </Link>
      <ServiceForm
        action={updateServiceAction}
        title={service.name}
        submitLabel="Save service"
        currency={ctx.shop.currency}
        staff={staff.map((s) => ({ id: s.id, displayName: s.displayName }))}
        defaults={{
          serviceId: service.id,
          name: service.name,
          description: service.description ?? "",
          durationMin: service.durationMin,
          bufferAfterMin: service.bufferAfterMin,
          price: centsToInput(service.priceCents),
          isPublic: service.isPublic,
          staffMemberIds: service.staffMemberIds,
        }}
      />
    </div>
  );
}
