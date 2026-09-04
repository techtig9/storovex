import React from "react";
import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {getStoreBySlug} from "@/core/storefront/storefrontService";
import {StorefrontChrome} from "@/components/storefront/StorefrontChrome";
import {BasketScreen} from "@/components/storefront/BasketScreen";

export const dynamic = "force-dynamic";

export async function generateMetadata({params}: {params: {slug: string}}): Promise<Metadata> {
  const store = await getStoreBySlug(params.slug);
  return {
    title: store ? `Basket — ${store.name}` : "Basket",
    // A basket is per-visitor and has nothing to index.
    robots: {index: false, follow: false},
  };
}

export default async function CartPage({params}: {params: {slug: string}}) {
  const store = await getStoreBySlug(params.slug);
  if (!store) notFound();

  return (
    <StorefrontChrome storeName={store.name} slug={params.slug}>
      <h1 className="mb-6 text-3xl">Your basket</h1>
      {/*
        The basket is rendered on the client: it is keyed by a token held in the
        browser, so the server has nothing to render it from until that token is
        read. Doing it server-side would mean putting the token in a cookie and
        making every storefront page uncacheable for a visitor who is only browsing.
      */}
      <BasketScreen slug={params.slug} />
    </StorefrontChrome>
  );
}
