import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { listCustomers } from "@/server/domain/customers/crm";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { CustomerList } from "@/components/customers/customer-list";

export const metadata: Metadata = { title: "Customers" };

const PAGE = 50;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; deleted?: string }> }) {
  const ctx = await requirePageContext("customers.view_all");
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const q = (sp.q ?? "").slice(0, 80);
  const { rows, hasMore } = await listCustomers(ctx, { q, limit: PAGE, offset: page * PAGE });
  const qs = (p: number) => `/app/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Customers" description="Everyone who has booked, with their history and haircut notes." />
      {sp.deleted ? (
        <p role="status" className="mb-4 rounded-lg bg-success-bg px-3 py-2 text-[13px] text-success">
          The customer&apos;s personal data was deleted.
        </p>
      ) : null}
      <form className="relative mb-4 max-w-md" role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
        <Input name="q" defaultValue={q} placeholder="Search name, phone or email" className="pl-9" aria-label="Search customers" />
      </form>
      {rows.length ? (
        <CustomerList rows={rows} timeZone={ctx.shop.timezone} hrefFor={(id) => `/app/customers/${id}`} />
      ) : (
        <p className="rounded-xl border border-dashed border-border-strong px-6 py-12 text-center text-sm text-fg-muted">
          {q ? "No customers match your search." : "No customers yet. They're added automatically when someone books."}
        </p>
      )}
      <div className="mt-4 flex justify-between">
        {page > 0 ? (
          <Link href={qs(page - 1)} className={buttonClass("secondary", "sm")}>
            Previous
          </Link>
        ) : (
          <span />
        )}
        {hasMore ? (
          <Link href={qs(page + 1)} className={buttonClass("secondary", "sm")}>
            Next
          </Link>
        ) : null}
      </div>
    </>
  );
}
