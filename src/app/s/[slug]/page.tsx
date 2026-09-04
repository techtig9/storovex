import React from "react";
import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {getStoreBySlug, listStorefrontProducts} from "@/core/storefront/storefrontService";
import {formatMoney} from "@/core/commerce/money";
import {Card} from "@/components/ui/Card";
import {EmptyState} from "@/components/ui/States";

export const dynamic = "force-dynamic";

export async function generateMetadata({params}: {params: {slug: string}}): Promise<Metadata> {
  const store = await getStoreBySlug(params.slug);
  if (!store) return {title: "Store not found"};
  return {
    title: store.name,
    description: `Shop ${store.name} on Storovex.`,
    openGraph: {title: store.name, type: "website"},
  };
}

export default async function StorefrontPage({params}: {params: {slug: string}}) {
  const store = await getStoreBySlug(params.slug);
  if (!store) notFound();

  const products = await listStorefrontProducts(store.id);

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="skip-link">Skip to content</a>

      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <h1 className="text-xl font-semibold">{store.name}</h1>
          <a href={`/s/${params.slug}/cart`}
             className="inline-flex h-10 items-center rounded-md border border-line px-4 text-base font-medium transition-colors duration-fast hover:bg-surface-raised">
            Basket
          </a>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {products.length === 0 ? (
          <EmptyState as="h2" title="Nothing for sale yet"
                      description="This store hasn't published any products." />
        ) : (
          <>
            <h2 className="sr-only">Products</h2>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {products.map(product => (
                <li key={product.id}>
                  <a href={`/s/${params.slug}/p/${product.id}`} className="block focus-visible:outline-none">
                    <Card interactive className="h-full overflow-hidden">
                      <div className="aspect-square bg-surface-raised">
                        {product.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="text-base font-medium">{product.title}</h3>
                        {product.priceFrom !== null && (
                          <p className="mt-1 text-base tabular-nums text-ink-muted">
                            {formatMoney(product.priceFrom)}
                          </p>
                        )}
                      </div>
                    </Card>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-ink-subtle sm:px-6 lg:px-8">
          {store.name} — powered by Storovex
        </div>
      </footer>
    </div>
  );
}
