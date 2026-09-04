"use client";
import React from "react";
import {Button} from "@/components/ui/Button";
import {Card, CardBody} from "@/components/ui/Card";
import {Input} from "@/components/ui/Input";
import {EmptyState, ErrorState, Skeleton} from "@/components/ui/States";
import {api, messageFor} from "@/core/ui/apiClient";
import {formatMoney} from "@/core/commerce/money";
import {existingCartToken} from "./cartToken";

type Line = {
  cartItemId: string; variantId: string; storeId: string;
  title: string; sku: string | null; quantity: number; unitPrice: number;
};
type StoreQuote = {
  storeId: string; lines: Line[];
  totals: {subtotal: number; discountTotal: number; shippingTotal: number; taxTotal: number; total: number};
  discountCode: string | null;
  discountError?: string;
};
type Quote = {cartId: string | null; stores: StoreQuote[]; grandTotal: number};

/** The reasons a code can be refused, in words a shopper can act on. */
const DISCOUNT_MESSAGES: Record<string, string> = {
  DISCOUNT_NOT_FOUND: "We don't recognise that code.",
  DISCOUNT_INACTIVE: "That code is no longer active.",
  DISCOUNT_EXPIRED: "That code has expired.",
  DISCOUNT_USAGE_LIMIT_REACHED: "That code has been fully redeemed.",
  DISCOUNT_MIN_SUBTOTAL_NOT_MET: "Your basket isn't large enough for that code yet.",
};

export function BasketScreen({slug}: {slug: string}) {
  const [token, setToken] = React.useState<string | null | undefined>(undefined);
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string>();
  const [busyLine, setBusyLine] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [appliedCodes, setAppliedCodes] = React.useState<Record<string, string>>({});

  // localStorage is not available during server rendering, so the token is read
  // after mount. `undefined` means "not looked yet", null means "no basket".
  React.useEffect(() => { setToken(existingCartToken()); }, []);

  const load = React.useCallback(async (codes: Record<string, string>) => {
    const current = existingCartToken();
    if (!current) { setState("ready"); setQuote(null); return; }
    setState("loading");
    try {
      // The quote endpoint prices the basket without committing anything, so the
      // shopper sees the real total — including any discount — before paying.
      const data = await api<Quote>("/api/checkout", {
        method: "POST",
        body: {sessionToken: current, discountCodes: Object.keys(codes).length ? codes : undefined},
      });
      setQuote(data);
      setState("ready");
    } catch (e) {
      setError(messageFor(e));
      setState("error");
    }
  }, []);

  React.useEffect(() => {
    if (token === undefined) return;
    if (token === null) { setState("ready"); return; }
    void load(appliedCodes);
  }, [token, load, appliedCodes]);

  async function setQuantity(line: Line, quantity: number) {
    const current = existingCartToken();
    if (!current) return;
    setBusyLine(line.cartItemId);
    try {
      await api("/api/cart", {
        method: "PATCH",
        body: {sessionToken: current, cartItemId: line.cartItemId, quantity},
      });
      await load(appliedCodes);
    } catch (e) {
      setError(messageFor(e));
      setState("error");
    } finally {
      setBusyLine(null);
    }
  }

  if (state === "loading" && !quote) {
    return (
      <div className="space-y-3" aria-busy="true">
        <span className="sr-only" role="status">Loading your basket</span>
        {Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  if (state === "error") {
    return (
      <ErrorState as="h2" description={error ?? "We couldn't load your basket."}
        action={<Button onClick={() => void load(appliedCodes)}>Try again</Button>} />
    );
  }

  const isEmpty = !quote || quote.stores.length === 0;
  if (isEmpty) {
    return (
      <EmptyState as="h2" title="Your basket is empty"
        description="Add something from the shop and it will appear here."
        action={<Button onClick={() => { window.location.href = `/s/${slug}`; }}>
          Continue shopping
        </Button>} />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
      <div className="space-y-6">
        {quote.stores.map(store => (
          <Card key={store.storeId}>
            <CardBody className="space-y-4 pt-5">
              {/*
                A basket can hold items from more than one merchant, because a cart
                has no store. Each is priced and paid for separately, so saying so
                here avoids a surprise at checkout.
              */}
              {quote.stores.length > 1 && (
                <p className="text-sm text-ink-muted">
                  Sold and shipped separately by one of the sellers in your basket.
                </p>
              )}

              <ul className="divide-y divide-line">
                {store.lines.map(line => (
                  <li key={line.cartItemId} className="flex flex-wrap items-center gap-3 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{line.title}</p>
                      <p className="text-sm text-ink-muted">
                        {formatMoney(line.unitPrice)} each
                        {line.sku && <span className="ml-2">SKU {line.sku}</span>}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="secondary"
                        disabled={busyLine === line.cartItemId}
                        onClick={() => setQuantity(line, line.quantity - 1)}>
                        <span className="sr-only">Reduce quantity of {line.title}</span>
                        <span aria-hidden="true">−</span>
                      </Button>
                      <span className="w-8 text-center tabular-nums" aria-live="polite">
                        <span className="sr-only">Quantity of {line.title}: </span>
                        {line.quantity}
                      </span>
                      <Button size="sm" variant="secondary"
                        disabled={busyLine === line.cartItemId || line.quantity >= 20}
                        onClick={() => setQuantity(line, line.quantity + 1)}>
                        <span className="sr-only">Increase quantity of {line.title}</span>
                        <span aria-hidden="true">+</span>
                      </Button>
                    </div>

                    <p className="w-20 shrink-0 text-right tabular-nums">
                      {formatMoney(line.unitPrice * line.quantity)}
                    </p>

                    <Button size="sm" variant="ghost"
                      disabled={busyLine === line.cartItemId}
                      onClick={() => setQuantity(line, 0)}>
                      <span className="sr-only">Remove {line.title} from your basket</span>
                      <span aria-hidden="true">✕</span>
                    </Button>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
                <div className="flex-1 min-w-48">
                  <Input label="Discount code" placeholder="SPRING20" maxLength={40}
                    value={store.discountCode ?? code}
                    disabled={Boolean(store.discountCode)}
                    onChange={e => setCode(e.target.value.toUpperCase())} />
                </div>
                {store.discountCode ? (
                  <Button variant="secondary" onClick={() => {
                    const next = {...appliedCodes};
                    delete next[store.storeId];
                    setAppliedCodes(next);
                    setCode("");
                  }}>
                    Remove
                  </Button>
                ) : (
                  <Button variant="secondary" disabled={!code.trim()}
                    onClick={() => setAppliedCodes({...appliedCodes, [store.storeId]: code.trim()})}>
                    Apply
                  </Button>
                )}
              </div>

              {/*
                A code that does not apply is reported rather than silently dropped —
                otherwise the shopper pays full price wondering why.
              */}
              {store.discountError && (
                <p role="alert" className="text-sm font-medium text-danger">
                  {DISCOUNT_MESSAGES[store.discountError] ?? "That code can't be used on this basket."}
                </p>
              )}
              {store.discountCode && (
                <p role="status" className="text-sm font-medium text-success">
                  {store.discountCode} applied — {formatMoney(store.totals.discountTotal)} off.
                </p>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="lg:sticky lg:top-6">
        <CardBody className="space-y-3 pt-5">
          <h2 className="text-md font-semibold">Summary</h2>
          <dl className="space-y-2 text-base">
            {quote.stores.map((store, i) => (
              <React.Fragment key={store.storeId}>
                {quote.stores.length > 1 && (
                  <dt className="pt-2 text-sm font-medium text-ink-muted">Seller {i + 1}</dt>
                )}
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Subtotal</dt>
                  <dd className="tabular-nums">{formatMoney(store.totals.subtotal)}</dd>
                </div>
                {store.totals.discountTotal > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">Discount</dt>
                    <dd className="tabular-nums">−{formatMoney(store.totals.discountTotal)}</dd>
                  </div>
                )}
              </React.Fragment>
            ))}
            <div className="flex justify-between border-t border-line pt-3 text-md font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(quote.grandTotal)}</dd>
            </div>
          </dl>

          <p className="text-sm text-ink-subtle">
            Shipping and tax are calculated at checkout.
          </p>

          <Button size="lg" fullWidth
            onClick={() => {
              const codes = encodeURIComponent(JSON.stringify(appliedCodes));
              window.location.href = `/s/${slug}/checkout?codes=${codes}`;
            }}>
            Checkout
          </Button>
          <Button variant="ghost" fullWidth onClick={() => { window.location.href = `/s/${slug}`; }}>
            Continue shopping
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
