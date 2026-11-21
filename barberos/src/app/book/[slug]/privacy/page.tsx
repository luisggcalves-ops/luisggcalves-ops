import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicShop } from "@/server/domain/public-booking/service";

export const metadata: Metadata = { title: "Privacy" };

export default async function PrivacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicShop(slug);
  if (!data) notFound();
  const { shop } = data;
  return (
    <article className="flex flex-col gap-4 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
      <p>
        When you book with {shop.name}, we store your name, phone number, email (if you give it), your bookings, and any notes the shop
        makes about your haircut. This is used only to manage your appointments and give you the cut you like.
      </p>
      <p>
        {shop.name} is responsible for this data. BarberOS stores it securely on their behalf in the European Union. It is never sold
        or shared with other businesses.
      </p>
      <p>
        We only send marketing messages if you tick the box when booking, and you can opt out at any time.
      </p>
      <p>
        You can ask {shop.name} for a copy of your data, or for it to be deleted, at any time
        {shop.email ? (
          <>
            {" "}
            at <a href={`mailto:${shop.email}`} className="underline">{shop.email}</a>
          </>
        ) : null}
        {shop.phone ? ` or on ${shop.phone}` : ""}.
      </p>
      <p className="text-fg-muted">Only essential cookies are used, to keep the booking page working.</p>
      <Link href={`/book/${shop.slug}`} className="font-medium underline-offset-4 hover:underline">
        ← Back to booking
      </Link>
    </article>
  );
}
