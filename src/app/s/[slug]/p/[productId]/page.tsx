import React from "react";
import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {getStoreBySlug, getStorefrontProduct} from "@/core/storefront/storefrontService";
import {formatMoney} from "@/core/commerce/money";
import {Badge} from "@/components/ui/States";
import {AddToBasket} from "@/components/storefront/AddToBasket";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  {params}: {params: {slug: string; productId: string}}
): Promise<Metadata> {
  const store = await getStoreBySlug(params.slug);
  if (!store) return {title: "Not found"};
  const product = await getStorefrontProduct(store.id, params.productId);
  if (!product) return {title: "Not found"};
  return {
    title: `${product.title} · ${store.name}`,
    description: product.description?.slice(0, 160) ?? `Buy ${product.title} from ${store.name}.`,
    openGraph: {
      title: product.title, type: "website",
      images: product.images[0] ? [product.images[0].url] : undefined,
    },
  };
}

export default async function ProductPage(
  {params}: {params: {slug: string; productId: string}}
) {
  const store = await getStoreBySlug(params.slug);
  if (!store) notFound();
  const product = await getStorefrontProduct(store.id, params.productId);
  if (!product) notFound();

  const cheapest = product.variants.length
    ? Math.min(...product.variants.map(v => v.price)) : null;
  const anyInStock = product.variants.some(v => v.inStock);

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="skip-link">Skip to content</a>

      <header className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
          <a href={`/s/${params.slug}`} className="text-base font-semibold hover:text-brand">
            {store.name}
          </a>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <div className="aspect-square overflow-hidden rounded-xl border border-line bg-surface-raised">
              {product.images[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.images[0].url} alt={product.title}
                     className="h-full w-full object-cover" />
              )}
            </div>
            {product.videoUrl && (
              <video controls preload="none" className="mt-4 w-full rounded-xl border border-line"
                     aria-label={`Video for ${product.title}`}>
                <source src={product.videoUrl} />
              </video>
            )}
          </div>

          <div>
            <h1 className="text-3xl">{product.title}</h1>
            {cheapest !== null && (
              <p className="mt-3 text-2xl font-semibold tabular-nums">{formatMoney(cheapest)}</p>
            )}
            <div className="mt-3">
              {anyInStock
                ? <Badge tone="success">In stock</Badge>
                : <Badge tone="warning">Out of stock</Badge>}
            </div>

            {product.description && (
              <div className="mt-6 whitespace-pre-line text-base leading-relaxed text-ink-muted">
                {product.description}
              </div>
            )}

            <div className="mt-8">
              <AddToBasket
                storeSlug={params.slug}
                variants={product.variants.map(v => ({
                  id: v.id, sku: v.sku, price: v.price, inStock: v.inStock, options: v.options,
                }))}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
