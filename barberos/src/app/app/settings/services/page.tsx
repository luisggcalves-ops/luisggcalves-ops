import type { Metadata } from "next";
import Link from "next/link";
import { requirePageContext } from "@/server/tenancy";
import { listServices } from "@/server/domain/services/service";
import { listStaff } from "@/server/domain/staff/service";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { formatMoney } from "@/lib/money";
import { ServiceForm } from "./service-form";
import { createServiceAction, setServiceActiveAction } from "./actions";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  const ctx = await requirePageContext("services.manage");
  const [services, staff] = await Promise.all([listServices(ctx, { includeInactive: true }), listStaff(ctx)]);
  const currency = ctx.shop.currency;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Services & prices" description="Prices are snapshotted on each booking, so changing a price never rewrites past appointments." />
        {services.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[12px] uppercase tracking-wider text-fg-subtle">
                  <th className="px-5 py-2.5 font-medium">Service</th>
                  <th className="px-5 py-2.5 font-medium">Duration</th>
                  <th className="px-5 py-2.5 font-medium">Price</th>
                  <th className="px-5 py-2.5 font-medium">Barbers</th>
                  <th className="px-5 py-2.5" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {services.map((s) => (
                  <tr key={s.id} className={s.active ? undefined : "text-fg-subtle"}>
                    <td className="px-5 py-3">
                      <Link href={`/app/settings/services/${s.id}`} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                      <div className="mt-0.5 flex gap-1.5">
                        {!s.active ? <Badge>Inactive</Badge> : null}
                        {s.active && !s.isPublic ? <Badge>Staff only</Badge> : null}
                      </div>
                    </td>
                    <td className="px-5 py-3 tabular text-fg-muted">
                      {s.durationMin} min{s.bufferAfterMin ? ` + ${s.bufferAfterMin}` : ""}
                    </td>
                    <td className="px-5 py-3 tabular">{formatMoney(s.priceCents, currency)}</td>
                    <td className="px-5 py-3 tabular text-fg-muted">{s.staffCount}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/app/settings/services/${s.id}`} className="px-2 text-[13px] text-fg-muted hover:text-fg">
                          Edit
                        </Link>
                        <ActionButton
                          action={setServiceActiveAction}
                          fields={{ serviceId: s.id, active: String(!s.active) }}
                          variant={s.active ? "ghost" : "secondary"}
                          confirm={s.active ? `Deactivate ${s.name}? It can no longer be booked. Past appointments are kept.` : undefined}
                        >
                          {s.active ? "Deactivate" : "Reactivate"}
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-fg-muted">No services yet. Add your first one below.</p>
        )}
      </Card>

      <ServiceForm
        action={createServiceAction}
        title="Add a service"
        submitLabel="Add service"
        currency={currency}
        staff={staff.map((s) => ({ id: s.id, displayName: s.displayName }))}
        defaults={{
          name: "",
          description: "",
          durationMin: 30,
          bufferAfterMin: 0,
          price: "",
          isPublic: true,
          staffMemberIds: staff.map((s) => s.id),
        }}
      />
    </div>
  );
}
