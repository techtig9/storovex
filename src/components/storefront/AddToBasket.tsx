"use client";
import React from "react";
import {Button} from "@/components/ui/Button";
import {Select} from "@/components/ui/Input";
import {formatMoney} from "@/core/commerce/money";
import {cartToken} from "./cartToken";

export type StorefrontVariant = {
  id: string; sku: string; price: number; inStock: boolean;
  options: Record<string, string>;
};

function describeVariant(v: StorefrontVariant) {
  const options = Object.values(v.options ?? {}).filter(Boolean).join(" · ");
  return `${options || v.sku} — ${formatMoney(v.price)}${v.inStock ? "" : " (out of stock)"}`;
}

export function AddToBasket({storeSlug, variants}: {storeSlug: string; variants: StorefrontVariant[]}) {
  const inStock = variants.filter(v => v.inStock);
  const [variantId, setVariantId] = React.useState(inStock[0]?.id ?? variants[0]?.id ?? "");
  const [quantity, setQuantity] = React.useState(1);
  const [state, setState] = React.useState<"idle" | "adding" | "added" | "error">("idle");
  const [message, setMessage] = React.useState<string>();

  if (variants.length === 0) {
    return <p className="text-base text-ink-muted">This product has no variants for sale.</p>;
  }

  const selected = variants.find(v => v.id === variantId);
  const canAdd = Boolean(selected?.inStock);

  async function add() {
    setState("adding");
    setMessage(undefined);
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({sessionToken: cartToken(), variantId, quantity}),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(body?.error?.message ?? "We couldn't add that to your basket.");
        setState("error");
        return;
      }
      setState("added");
    } catch {
      setMessage("Couldn't reach the server. Check your connection and try again.");
      setState("error");
    }
  }

  return (
    <div className="space-y-4">
      {variants.length > 1 && (
        <Select label="Option" value={variantId} onChange={e => setVariantId(e.target.value)}>
          {variants.map(v => (
            <option key={v.id} value={v.id} disabled={!v.inStock}>{describeVariant(v)}</option>
          ))}
        </Select>
      )}

      <Select label="Quantity" value={String(quantity)} onChange={e => setQuantity(Number(e.target.value))}>
        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
      </Select>

      <Button size="lg" fullWidth onClick={add} disabled={!canAdd}
              loading={state === "adding"} loadingLabel="Adding…">
        {canAdd ? "Add to basket" : "Out of stock"}
      </Button>

      {state === "added" && (
        <p role="status" className="text-sm font-medium text-success">
          Added. <a href={`/s/${storeSlug}/cart`} className="underline">View your basket</a>
        </p>
      )}
      {state === "error" && message && (
        <p role="alert" className="text-sm font-medium text-danger">{message}</p>
      )}
    </div>
  );
}
