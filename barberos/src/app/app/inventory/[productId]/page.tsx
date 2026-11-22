import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { getProduct } from "@/server/domain/finance/inventory";
import { DomainError } from "@/server/errors";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionButton } from "@/components/ui/action-button";
import { ProductForm } from "@/components/inventory/product-form";
import { StockForm } from "@/components/inventory/stock-form";
import { setProductActiveAction } from "@/app/actions/finance";
import { centsToInput } from "@/lib/money";

export const metadata: Metadata = { title: "Product" };
const TYPE: Record<string, string> = { purchase: "Delivery", sale: "Sold", usage: "Used", adjustment: "Correction", sale_reversal: "Sale voided" };

export default async function ProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const ctx = await requirePageContext("inventory.manage");
  const { productId } = await params;
  const data = await getProduct(ctx, productId).catch((e) => {
    if (e instanceof DomainError) return null;
    throw e;
  });
  if (!data) notFound();
  const { product: p, movements } = data;
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: ctx.shop.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/inventory" className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Inventory
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
        <p className="text-sm text-fg-muted">
          In stock: <span className="text-2xl font-semibold text-fg tabular">{p.stockQty}</span>
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Update stock" />
            <CardBody>
              <StockForm productId={p.id} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Stock history" description="Every change, including sales. This history can't be edited." />
            <ul className="divide-y divide-border">
              {movements.map(({ movement: mv, actorName }) => (
                <li key={mv.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span>
                    <span className="block">{TYPE[mv.type]}</span>
                    <span className="block text-[12px] text-fg-muted">
                      {fmt.format(mv.createdAt)}
                      {actorName ? ` · ${actorName}` : ""}
                      {mv.note ? ` · ${mv.note}` : ""}
                    </span>
                  </span>
                  <span className={`font-medium tabular ${mv.qtyDelta > 0 ? "text-success" : ""}`}>{mv.qtyDelta > 0 ? `+${mv.qtyDelta}` : mv.qtyDelta}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <ProductForm
                productId={p.id}
                defaults={{ name: p.name, sku: p.sku ?? "", category: p.category ?? "", kind: p.kind, cost: centsToInput(p.costCents), price: centsToInput(p.priceCents), lowStockThreshold: p.lowStockThreshold }}
              />
            </CardBody>
          </Card>
          <Card>
            <CardBody className="flex items-center justify-between gap-3">
              <p className="text-[13px] text-fg-muted">{p.active ? "Hide from sale. History is kept." : "This product is hidden from sale."}</p>
              <ActionButton action={setProductActiveAction} fields={{ productId: p.id, active: String(!p.active) }} variant={p.active ? "danger" : "secondary"}>
                {p.active ? "Deactivate" : "Reactivate"}
              </ActionButton>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
