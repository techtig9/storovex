import React from "react";
import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {getStoreBySlug} from "@/core/storefront/storefrontService";
import {StorefrontChrome} from "@/components/storefront/StorefrontChrome";
import {OrderConfirmation} from "@/components/storefront/OrderConfirmation";

export const dynamic = "force-dynamic";

export async function generateMetadata({params}: {params: {slug: string}}): Promise<Metadata> {
  const store = await getStoreBySlug(params.slug);
  return {
    title: store ? `Your order — ${store.name}` : "Your order",
    robots: {index: false, follow: false},
  };
}

export default async function OrderPage({params}: {params: {slug: string; groupId: string}}) {
  const store = await getStoreBySlug(params.slug);
  if (!store) notFound();

  return (
    <StorefrontChrome storeName={store.name} slug={params.slug}>
      <OrderConfirmation groupId={params.groupId} slug={params.slug} />
    </StorefrontChrome>
  );
}
