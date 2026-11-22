import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "BarberOS", template: "%s · BarberOS" },
  description: "Everything your barbershop needs, in one place.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers renders every page per request, which the CSP nonce needs (see src/proxy.ts).
  await headers();
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
