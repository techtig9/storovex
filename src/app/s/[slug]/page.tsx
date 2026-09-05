import React from "react";
import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {getStoreBySlug, listStorefrontProducts} from "@/core/storefront/storefrontService";
import {formatMoney} from "@/core/commerce/money";
import {Card} from "@/components/ui/Card";
import {EmptyState} from "@/components/ui/States";
import {StorefrontChrome} from "@/components/storefront/StorefrontChrome";

export const dynamic = "force-dynamic";

export async function generateMetadata({params}: {params: {slug: string}}): Promise<Metadata> {
  const store = await getStoreBySlug(params.slug);
  if (!store) return {title: "Store not found"};
  return {
    title: store.name,
    description: store.tagline ?? `Shop ${store.name} on Storovex.`,
    openGraph: {title: store.name, type: "website"},
  };
}

export default async function StorefrontPage({params}: {params: {slug: string}}) {
  const store = await getStoreBySlug(params.slug);
  if (!store) notFound();

  const products = await listStorefrontProducts(store.id);

  const freeOver = store.shippingFreeThreshold;

  return (
    <StorefrontChrome storeName={store.name} slug={params.slug}
      tagline={store.tagline} logoUrl={store.logoUrl} accent={store.themeAccent}>

      {/*
        Postage stated up front. A total that appears only at the payment step is
        the single most common reason a basket is abandoned.
      */}
      {store.shippingFlatRate > 0 && (
        <p className="mb-6 rounded-lg border border-line bg-surface-raised px-4 py-3 text-base text-ink-muted">
          {formatMoney(store.shippingFlatRate)} shipping
          {freeOver !== null && <> — free on orders over {formatMoney(freeOver)}</>}
        </p>
      )}

      {products.length === 0 ? (
        <EmptyState as="h2" title="Nothing for sale yet"
                    description="This store hasn't published any products." />
      ) : (
        <>
          <h1 className="sr-only">{store.name}</h1>
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

      {store.about && (
        <section className="mt-12 max-w-2xl border-t border-line pt-8">
          <h2 className="text-md font-semibold">About {store.name}</h2>
          {/* Plain text, rendered as paragraphs — never as markup. */}
          {store.about.split(/\n{2,}/).map((paragraph, i) => (
            <p key={i} className="mt-3 text-base leading-relaxed text-ink-muted">{paragraph}</p>
          ))}
        </section>
      )}
    </StorefrontChrome>
  );
}
