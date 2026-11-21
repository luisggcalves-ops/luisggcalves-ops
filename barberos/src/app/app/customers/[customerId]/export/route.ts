import { resolveShopContext } from "@/server/tenancy";
import { exportCustomer } from "@/server/domain/customers/crm";
import { can } from "@/server/authz/permissions";
import { DomainError } from "@/server/errors";

/** GDPR data export as a JSON download. */
export async function GET(_req: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const ctx = await resolveShopContext();
  if (!ctx || !can(ctx.role, "customers.export")) return new Response("Forbidden", { status: 403 });
  const { customerId } = await params;
  try {
    const data = await exportCustomer(ctx, customerId);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="customer-${customerId.slice(0, 8)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof DomainError) return new Response(e.message, { status: 404 });
    throw e;
  }
}
