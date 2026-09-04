import React from "react";
import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {getStoreBySlug} from "@/core/storefront/storefrontService";
import {StorefrontChrome} from "@/components/storefront/StorefrontChrome";
import {CheckoutScreen} from "@/components/storefront/CheckoutScreen";

export const dynamic = "force-dynamic";

export async function generateMetadata({params}: {params: {slug: string}}): Promise<Metadata> {
  const store = await getStoreBySlug(params.slug);
  return {
    title: store ? `Checkout — ${store.name}` : "Checkout",
    robots: {index: false, follow: false},
  };
}

export default async function CheckoutPage({
  params, searchParams,
}: {params: {slug: string}; searchParams: {codes?: string}}) {
  const store = await getStoreBySlug(params.slug);
  if (!store) notFound();

  // Discount codes travel in the URL from the basket. They are re-validated
  // server-side during the quote, so a shopper editing them here changes nothing
  // beyond which codes get checked.
  let codes: Record<string, string> = {};
  try {
    codes = searchParams.codes ? JSON.parse(decodeURIComponent(searchParams.codes)) : {};
  } catch { codes = {}; }

  return (
    <StorefrontChrome storeName={store.name} slug={params.slug}>
      <h1 className="mb-6 text-3xl">Checkout</h1>
      <CheckoutScreen
        slug={params.slug}
        discountCodes={codes}
        publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null}
      />
    </StorefrontChrome>
  );
}
