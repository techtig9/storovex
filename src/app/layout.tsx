import React from "react";
import type {Metadata, Viewport} from "next";
import {Inter} from "next/font/google";
import "./globals.css";
import {ThemeScript} from "@/components/theme/ThemeScript";

/**
 * Self-hosted via next/font, which also inlines a font-display and preloads the
 * subset. The previous stylesheet named three font families and loaded none of them,
 * so every page silently fell back to system fonts.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Storovex — sell online, without building a shop",
    template: "%s · Storovex",
  },
  description:
    "Open a storefront, list your products and take payment. No monthly fee — Storovex takes a small percentage of each sale, and the rest goes straight to your own Stripe account.",
  openGraph: {
    type: "website",
    siteName: "Storovex",
    title: "Storovex — sell online, without building a shop",
    description:
      "Open a storefront, list your products and take payment. Payouts go straight to your own Stripe account.",
  },
  twitter: {card: "summary_large_image"},
  robots: {index: true, follow: true},
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    {media: "(prefers-color-scheme: light)", color: "#fafafa"},
    {media: "(prefers-color-scheme: dark)", color: "#09090b"},
  ],
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
