"use client";
import React from "react";
import {AppShell} from "@/components/shell/AppShell";
import {Button} from "@/components/ui/Button";
import {Card, CardBody, CardHeader, CardTitle} from "@/components/ui/Card";
import {Input, Select, Textarea} from "@/components/ui/Input";
import {Modal} from "@/components/ui/Modal";
import {ErrorState, Skeleton} from "@/components/ui/States";
import {useToast} from "@/components/ui/Toast";
import {ProductStatusBadge} from "@/components/merchant/StatusBadge";
import {api, messageFor} from "@/core/ui/apiClient";
import {formatMoney} from "@/core/commerce/money";

type Variant = {
  id: string; sku: string | null; price: number;
  compareAtPrice: number | null; stockQuantity: number;
  options: Record<string, string>; imageUrl: string | null;
};
type Image = {id: string; url: string; position: number};
type Product = {
  id: string; title: string; description: string | null; status: string;
  variants: Variant[]; images: Image[];
};

export default function ProductPage({params}: {params: {id: string}}) {
  return (
    <AppShell activeId="products">
      <ProductScreen productId={params.id} />
    </AppShell>
  );
}

function ProductScreen({productId}: {productId: string}) {
  const toast = useToast();
  const [product, setProduct] = React.useState<Product | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string>();

  const load = React.useCallback(async () => {
    setState("loading");
    try {
      setProduct(await api<Product>(`/api/products/${productId}`));
      setState("ready");
    } catch (e) {
      setError(messageFor(e));
      setState("error");
    }
  }, [productId]);

  React.useEffect(() => { void load(); }, [load]);

  // The h1 must exist in every state, so loading and failure keep a document
  // outline rather than rendering a page with no heading at all.
  if (state !== "ready" || !product) {
    return (
      <>
        <nav className="mb-4 text-sm" aria-label="Breadcrumb">
          <a href="/products" className="text-ink-muted underline-offset-2 hover:underline">Products</a>
        </nav>
        <h1 className="mb-6 text-3xl">Product</h1>
        {state === "loading" ? (
          <div className="space-y-4" aria-busy="true">
            <span className="sr-only" role="status">Loading product</span>
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <ErrorState as="h2" description={error ?? "We couldn't load that product."}
            action={<Button onClick={() => void load()}>Try again</Button>} />
        )}
      </>
    );
  }

  return (
    <>
      <nav className="mb-4 text-sm" aria-label="Breadcrumb">
        <a href="/products" className="text-ink-muted underline-offset-2 hover:underline">Products</a>
        <span className="mx-2 text-ink-subtle" aria-hidden="true">/</span>
        <span className="text-ink">{product.title}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl">{product.title}</h1>
          <div className="mt-2"><ProductStatusBadge status={product.status} /></div>
        </div>
        <PublishControl product={product} onChanged={load} />
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Details product={product} onSaved={load} />
        <Variants product={product} onChanged={load} />
        <Images product={product} onChanged={load} />
        <DangerZone product={product} onDeleted={() => {
          toast.push({tone: "success", title: "Product deleted"});
          window.location.href = "/products";
        }} />
      </div>
    </>
  );
}

/**
 * Publishing is the single most consequential control on this page — it is what puts
 * a product in front of shoppers — so it sits in the header rather than inside a
 * form, and it refuses to publish a product nobody could buy.
 */
function PublishControl({product, onChanged}: {product: Product; onChanged: () => Promise<void>}) {
  const toast = useToast();
  const [saving, setSaving] = React.useState(false);

  const sellable = product.variants.length > 0;
  const inStock = product.variants.some(v => v.stockQuantity > 0);

  async function setStatus(status: string) {
    setSaving(true);
    try {
      await api(`/api/products/${product.id}`, {method: "PATCH", body: {action: "update", status}});
      await onChanged();
      toast.push({
        tone: "success",
        title: status === "active" ? "Product is live" : status === "draft" ? "Moved to draft" : "Archived",
        description: status === "active" ? "It's now visible on your storefront." : undefined,
      });
    } catch (e) {
      toast.push({tone: "danger", title: "Couldn't update", description: messageFor(e)});
    } finally {
      setSaving(false);
    }
  }

  if (product.status === "active") {
    return (
      <div className="flex gap-2">
        <Button variant="secondary" loading={saving} onClick={() => setStatus("draft")}>
          Unpublish
        </Button>
        <Button variant="ghost" loading={saving} onClick={() => setStatus("archived")}>
          Archive
        </Button>
      </div>
    );
  }

  return (
    <div className="text-right">
      <Button loading={saving} disabled={!sellable} onClick={() => setStatus("active")}>
        Publish to storefront
      </Button>
      {!sellable && (
        <p className="mt-1.5 max-w-56 text-sm text-ink-muted">
          Add at least one variant with a price first.
        </p>
      )}
      {sellable && !inStock && (
        <p className="mt-1.5 max-w-56 text-sm text-warning">
          Every variant is out of stock. It will show as unavailable.
        </p>
      )}
    </div>
  );
}

function Details({product, onSaved}: {product: Product; onSaved: () => Promise<void>}) {
  const toast = useToast();
  const [title, setTitle] = React.useState(product.title);
  const [description, setDescription] = React.useState(product.description ?? "");
  const [saving, setSaving] = React.useState(false);

  const dirty = title !== product.title || description !== (product.description ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/products/${product.id}`, {
        method: "PATCH",
        body: {action: "update", title: title.trim(), description},
      });
      await onSaved();
      toast.push({tone: "success", title: "Saved"});
    } catch (err) {
      toast.push({tone: "danger", title: "Couldn't save", description: messageFor(err)});
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle as="h2">Details</CardTitle></CardHeader>
      <CardBody>
        <form onSubmit={save} className="space-y-4">
          <Input label="Name" required maxLength={200} value={title}
            onChange={e => setTitle(e.target.value)} />
          <Textarea label="Description" maxLength={20000} rows={6} value={description}
            hint="Shown on the product page. Plain text."
            onChange={e => setDescription(e.target.value)} />
          <div className="flex justify-end">
            <Button type="submit" loading={saving} disabled={!dirty || !title.trim()}>
              Save changes
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function Variants({product, onChanged}: {product: Product; onChanged: () => Promise<void>}) {
  const [adding, setAdding] = React.useState(false);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle as="h2">Variants &amp; stock</CardTitle>
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>Add variant</Button>
      </CardHeader>
      <CardBody>
        {product.variants.length === 0 ? (
          <p className="py-6 text-center text-base text-ink-muted">
            No variants yet. A product needs at least one before it can be sold.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {product.variants.map(v => (
              <VariantRow key={v.id} variant={v} onChanged={onChanged} />
            ))}
          </ul>
        )}
      </CardBody>
      <AddVariantModal
        open={adding} productId={product.id}
        onClose={() => setAdding(false)}
        onAdded={async () => { setAdding(false); await onChanged(); }}
      />
    </Card>
  );
}

function VariantRow({variant, onChanged}: {variant: Variant; onChanged: () => Promise<void>}) {
  const toast = useToast();
  const [delta, setDelta] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const label = Object.values(variant.options ?? {}).filter(Boolean).join(" · ") || variant.sku || "Default";

  async function adjust() {
    const value = Number(delta);
    if (!Number.isInteger(value) || value === 0) return;
    setSaving(true);
    try {
      await api("/api/stock", {method: "POST", body: {variantId: variant.id, delta: value}});
      setDelta("");
      await onChanged();
      toast.push({
        tone: "success",
        title: value > 0 ? `Added ${value} to stock` : `Removed ${Math.abs(value)} from stock`,
      });
    } catch (e) {
      toast.push({tone: "danger", title: "Couldn't adjust stock", description: messageFor(e)});
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-ink-muted">
          {formatMoney(variant.price)}
          {variant.compareAtPrice != null && (
            <span className="ml-2 line-through">{formatMoney(variant.compareAtPrice)}</span>
          )}
          {variant.sku && <span className="ml-2">SKU {variant.sku}</span>}
        </p>
      </div>

      <p className={variant.stockQuantity > 0 ? "tabular-nums text-base" : "tabular-nums text-base text-warning"}>
        {variant.stockQuantity} in stock
      </p>

      {/*
        Stock changes by a delta, never by setting a total. A merchant typing "50"
        while an order takes one would write 50 back and silently un-sell it.
      */}
      <div className="flex items-end gap-2">
        <Input
          label="Adjust stock" className="w-24" inputMode="numeric" placeholder="+10"
          value={delta} onChange={e => setDelta(e.target.value)}
        />
        <Button size="sm" variant="secondary" loading={saving}
          disabled={!Number.isInteger(Number(delta)) || Number(delta) === 0}
          onClick={adjust}>
          Apply
        </Button>
      </div>
    </li>
  );
}

function AddVariantModal({open, productId, onClose, onAdded}: {
  open: boolean; productId: string; onClose: () => void; onAdded: () => Promise<void>;
}) {
  const [sku, setSku] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [compareAt, setCompareAt] = React.useState("");
  const [stock, setStock] = React.useState("0");
  const [optionName, setOptionName] = React.useState("");
  const [optionValue, setOptionValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    if (open) {
      setSku(""); setPrice(""); setCompareAt(""); setStock("0");
      setOptionName(""); setOptionValue(""); setError(undefined);
    }
  }, [open]);

  // Money is entered as decimal and sent as minor units. The conversion happens once,
  // here, so nothing downstream does arithmetic on a float.
  const priceMinor = Math.round(Number(price) * 100);
  const compareMinor = compareAt.trim() === "" ? null : Math.round(Number(compareAt) * 100);
  const validPrice = Number.isInteger(priceMinor) && priceMinor > 0;
  const validCompare = compareMinor === null || (Number.isInteger(compareMinor) && compareMinor > priceMinor);
  const validStock = Number.isInteger(Number(stock)) && Number(stock) >= 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(undefined);
    try {
      await api(`/api/products/${productId}`, {
        method: "PATCH",
        body: {
          action: "add_variant",
          sku: sku.trim() || `SKU-${Date.now()}`,
          price: priceMinor,
          compareAtPrice: compareMinor,
          stockQuantity: Number(stock),
          options: optionName.trim() && optionValue.trim()
            ? {[optionName.trim()]: optionValue.trim()} : undefined,
        },
      });
      await onAdded();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a variant"
      description="A variant is one buyable version of this product — a size, a colour, or just the product itself.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Option name" data-autofocus placeholder="Size" maxLength={40}
            hint="Optional" value={optionName} onChange={e => setOptionName(e.target.value)} />
          <Input label="Option value" placeholder="Large" maxLength={40}
            hint="Optional" value={optionValue} onChange={e => setOptionValue(e.target.value)} />
        </div>
        <Input label="SKU" placeholder="Left blank, one is generated" maxLength={100}
          value={sku} onChange={e => setSku(e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Price" required inputMode="decimal" placeholder="24.99"
            error={price && !validPrice ? "Enter a price above zero." : undefined}
            value={price} onChange={e => setPrice(e.target.value)} />
          <Input label="Compare-at price" inputMode="decimal" placeholder="34.99"
            hint="Optional. Shown struck through."
            error={compareAt && !validCompare ? "Must be higher than the price." : undefined}
            value={compareAt} onChange={e => setCompareAt(e.target.value)} />
        </div>
        <Input label="Stock" required inputMode="numeric"
          error={stock && !validStock ? "Enter a whole number, zero or more." : undefined}
          value={stock} onChange={e => setStock(e.target.value)} />

        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!validPrice || !validCompare || !validStock}>
            Add variant
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Images({product, onChanged}: {product: Product; onChanged: () => Promise<void>}) {
  const toast = useToast();
  const [url, setUrl] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/products/${product.id}/images`, {method: "POST", body: {url: url.trim()}});
      setUrl("");
      await onChanged();
    } catch (err) {
      toast.push({tone: "danger", title: "Couldn't add that image", description: messageFor(err)});
    } finally {
      setSaving(false);
    }
  }

  async function act(path: string, method: string, body?: unknown) {
    try {
      await api(path, {method, body});
      await onChanged();
    } catch (err) {
      toast.push({tone: "danger", title: "Couldn't update images", description: messageFor(err)});
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle as="h2">Images</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        {product.images.length === 0 ? (
          <p className="text-base text-ink-muted">
            No images yet. The first image is used as the thumbnail on your storefront.
          </p>
        ) : (
          <ul className="space-y-2">
            {product.images.map((image, index) => (
              <li key={image.id} className="flex items-center gap-3 rounded-lg border border-line p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="" width={56} height={56}
                  className="h-14 w-14 shrink-0 rounded-md object-cover" />
                <p className="min-w-0 flex-1 truncate text-sm text-ink-muted">{image.url}</p>
                {index === 0 && <span className="shrink-0 text-xs font-medium text-brand">Thumbnail</span>}
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" disabled={index === 0}
                    onClick={() => act(`/api/products/${product.id}/images`, "PATCH",
                      {imageId: image.id, direction: "up"})}>
                    <span className="sr-only">Move {image.url} earlier</span>
                    <span aria-hidden="true">↑</span>
                  </Button>
                  <Button size="sm" variant="ghost" disabled={index === product.images.length - 1}
                    onClick={() => act(`/api/products/${product.id}/images`, "PATCH",
                      {imageId: image.id, direction: "down"})}>
                    <span className="sr-only">Move {image.url} later</span>
                    <span aria-hidden="true">↓</span>
                  </Button>
                  <Button size="sm" variant="ghost"
                    onClick={() => act(`/api/products/${product.id}/images?imageId=${image.id}`, "DELETE")}>
                    <span className="sr-only">Remove {image.url}</span>
                    <span aria-hidden="true">✕</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={add} className="flex items-end gap-2">
          <div className="flex-1">
            <Input label="Image link" type="url" placeholder="https://…"
              hint="Paste an https link to an image."
              value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary" loading={saving} disabled={!url.trim()}>Add</Button>
        </form>
      </CardBody>
    </Card>
  );
}

function DangerZone({product, onDeleted}: {product: Product; onDeleted: () => void}) {
  const toast = useToast();
  const [confirming, setConfirming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function remove() {
    setDeleting(true);
    try {
      await api(`/api/products/${product.id}`, {method: "DELETE"});
      onDeleted();
    } catch (e) {
      setConfirming(false);
      toast.push({tone: "danger", title: "Couldn't delete", description: messageFor(e)});
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="border-danger/30">
      <CardHeader><CardTitle as="h2">Delete this product</CardTitle></CardHeader>
      <CardBody className="space-y-3">
        <p className="text-base text-ink-muted">
          Products that have been ordered can&apos;t be deleted, because the order history
          points at them. Archive those instead.
        </p>
        <Button variant="danger" onClick={() => setConfirming(true)}>Delete product</Button>
      </CardBody>

      <Modal open={confirming} onClose={() => setConfirming(false)}
        title={`Delete "${product.title}"?`}
        description="This can't be undone.">
        <div className="flex justify-end gap-2">
          <Button variant="secondary" data-autofocus onClick={() => setConfirming(false)}>Cancel</Button>
          <Button variant="danger" loading={deleting} onClick={remove}>Delete</Button>
        </div>
      </Modal>
    </Card>
  );
}
