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
    default: "Storovex — AI product photography for online stores",
    template: "%s · Storovex",
  },
  description:
    "Upload one reference photo. Storovex generates hero shots, lifestyle scenes and campaign creative in your store's style — sized and ready to publish.",
  openGraph: {
    type: "website",
    siteName: "Storovex",
    title: "Storovex — AI product photography for online stores",
    description:
      "Upload one reference photo and get a full set of product images, sized for your product pages, ads and social.",
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
