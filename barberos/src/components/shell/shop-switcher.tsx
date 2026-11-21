import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { switchShopAction } from "@/app/session-actions";
import { ROLE_LABELS } from "@/server/authz/permissions";
import type { ShopContext } from "@/server/tenancy";

/** Shop switcher built on <details>, so it works without client JavaScript. */
export function ShopSwitcher({ ctx }: { ctx: ShopContext }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface text-[13px] font-semibold">
          {ctx.shop.shopName.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{ctx.shop.shopName}</span>
          <span className="block text-[12px] text-fg-muted">{ROLE_LABELS[ctx.role]}</span>
        </span>
        <ChevronsUpDown className="size-4 text-fg-subtle" aria-hidden />
      </summary>
      <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-border bg-surface p-1 shadow-pop animate-in">
        {ctx.memberships.map((m) => (
          <form key={m.shopId} action={switchShopAction}>
            <input type="hidden" name="shopId" value={m.shopId} />
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-muted"
            >
              <span className="min-w-0 flex-1 truncate">{m.shopName}</span>
              <span className="text-[12px] text-fg-subtle">{ROLE_LABELS[m.role]}</span>
              {m.shopId === ctx.shopId ? <Check className="size-4" aria-label="Current shop" /> : <span className="size-4" />}
            </button>
          </form>
        ))}
        <div className="my-1 border-t border-border" />
        <Link href="/onboarding" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-fg-muted hover:bg-surface-muted hover:text-fg">
          <Plus className="size-4" aria-hidden /> Create another shop
        </Link>
      </div>
    </details>
  );
}
