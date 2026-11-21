import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicShop } from "@/server/domain/public-booking/service";
import { Logo } from "@/components/logo";

/** Public booking layout: the shop's identity, an optional brand accent, and a demo banner when relevant. */
export default async function BookingLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicShop(slug);
  if (!data) notFound();
  const brand = data.shop.brandColor;
  const style = brand
    ? ({ "--primary": brand, "--primary-hover": brand, "--primary-fg": "#ffffff", "--ring": brand } as React.CSSProperties)
    : undefined;
  return (
    <div className="min-h-dvh" style={style}>
      {data.shop.isDemo ? (
        <div role="note" className="bg-warning-bg px-4 py-1.5 text-center text-[12px] font-medium text-warning">
          Demo shop: bookings here are sample data.
        </div>
      ) : null}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-[15px] font-semibold text-primary-fg">
            {data.shop.name.slice(0, 1).toUpperCase()}
          </span>
          <Link href={`/book/${data.shop.slug}`} className="min-w-0">
            <span className="block truncate font-semibold tracking-tight">{data.shop.name}</span>
            {data.shop.address ? <span className="block truncate text-[12px] text-fg-muted">{data.shop.address}</span> : null}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16 pt-6 animate-in">{children}</main>
      <footer className="mx-auto flex max-w-xl items-center justify-between px-4 pb-10 text-[12px] text-fg-subtle">
        <Link href={`/book/${data.shop.slug}/privacy`} className="hover:text-fg">
          Privacy
        </Link>
        <span className="inline-flex items-center gap-1.5">
          Powered by <Logo className="text-[12px] [&>span:first-child]:size-4 [&>span:first-child>svg]:size-2.5" />
        </span>
      </footer>
    </div>
  );
}
