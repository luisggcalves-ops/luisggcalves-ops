import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { listProducts } from "@/server/domain/finance/inventory";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductForm } from "@/components/inventory/product-form";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const ctx = await requirePageContext("inventory.manage");
  const products = await listProducts(ctx, { includeInactive: true });
  const m = (c: number) => formatMoney(c, ctx.shop.currency);
  return (
    <>
      <PageHeader title="Inventory" description="Products you sell and use. Stock updates automatically when you sell them." />
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card>
          <CardHeader title="Products" description={`${products.filter((p) => p.active).length} active`} />
          {products.length ? (
            <ul className="divide-y divide-border">
              {products.map((p) => {
                const low = p.lowStockThreshold > 0 && p.stockQty <= p.lowStockThreshold;
                return (
                  <li key={p.id}>
                    <Link href={`/app/inventory/${p.id}`} className={`flex items-center gap-3 px-5 py-3 hover:bg-surface-muted/60 ${p.active ? "" : "opacity-60"}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="block text-[12px] text-fg-muted">
                          {p.category ? `${p.category} · ` : ""}cost {m(p.costCents)} · sells {m(p.priceCents)}
                        </span>
                      </span>
                      {!p.active ? <Badge>Inactive</Badge> : p.stockQty <= 0 ? <Badge tone="danger">Out of stock</Badge> : low ? <Badge tone="warning">Low stock</Badge> : null}
                      <span className="w-16 text-right text-sm font-semibold tabular">{p.stockQty}</span>
                      <ChevronRight className="size-4 text-fg-subtle" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <CardBody className="text-sm text-fg-muted">No products yet.</CardBody>
          )}
        </Card>
        <Card className="self-start">
          <CardHeader title="Add a product" />
          <CardBody>
            <ProductForm />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
