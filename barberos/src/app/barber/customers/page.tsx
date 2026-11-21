import type { Metadata } from "next";
import { Search } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { listCustomers } from "@/server/domain/customers/crm";
import { getOwnStaffProfile } from "@/server/domain/shops/service";
import { Input } from "@/components/ui/field";
import { CustomerList } from "@/components/customers/customer-list";

export const metadata: Metadata = { title: "Customers" };

export default async function BarberCustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requirePageContext("barber_app.view");
  const { q = "" } = await searchParams;
  const profile = await getOwnStaffProfile(ctx);
  // Barbers see their own customers. Owners in barber view see everyone.
  const { rows } = profile || ctx.role !== "barber" ? await listCustomers(ctx, { q, limit: 100 }) : { rows: [] };
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
      <form className="relative" role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
        <Input name="q" defaultValue={q} placeholder="Search name or phone" className="h-11 pl-9" aria-label="Search customers" />
      </form>
      {rows.length ? (
        <CustomerList rows={rows} timeZone={ctx.shop.timezone} hrefFor={(id) => `/barber/customers/${id}`} />
      ) : (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-10 text-center text-sm text-fg-muted">
          {q ? "No customers match." : "Customers you've served or are booked with appear here."}
        </p>
      )}
    </div>
  );
}
