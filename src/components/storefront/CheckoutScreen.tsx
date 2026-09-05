"use client";
import React from "react";
import {loadStripe, type Stripe} from "@stripe/stripe-js";
import {Elements, PaymentElement, useElements, useStripe} from "@stripe/react-stripe-js";
import {Button} from "@/components/ui/Button";
import {Card, CardBody} from "@/components/ui/Card";
import {Input} from "@/components/ui/Input";
import {EmptyState, ErrorState, Skeleton} from "@/components/ui/States";
import {api, messageFor} from "@/core/ui/apiClient";
import {formatMoney} from "@/core/commerce/money";
import {existingCartToken, clearCartToken} from "./cartToken";

type Quote = {
  cartId: string | null;
  stores: {
    storeId: string;
    lines: {cartItemId: string; title: string; quantity: number; unitPrice: number}[];
    totals: {subtotal: number; discountTotal: number; total: number};
  }[];
  grandTotal: number;
};

type Intent = {orderId: string; storeId: string; clientSecret?: string; error?: string};
type Placed = {orderGroupId: string; orders: {id: string; orderNumber: number}[]; intents: Intent[]};

/**
 * Checkout in two steps: place the order, then pay for it.
 *
 * They are separate because the order and its stock reservation must exist before a
 * card is charged — otherwise a successful payment could land against a basket whose
 * stock someone else has taken in the meantime. The reservation holds the goods for
 * the length of the payment.
 *
 * A basket spanning several merchants produces one payment per merchant, because a
 * Stripe payment intent settles to a single connected account.
 */
export function CheckoutScreen({slug, discountCodes, publishableKey}: {
  slug: string;
  discountCodes: Record<string, string>;
  publishableKey: string | null;
}) {
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string>();
  const [placed, setPlaced] = React.useState<Placed | null>(null);

  React.useEffect(() => {
    (async () => {
      const token = existingCartToken();
      if (!token) { setState("ready"); return; }
      try {
        setQuote(await api<Quote>("/api/checkout", {
          method: "POST",
          body: {sessionToken: token, discountCodes},
        }));
        setState("ready");
      } catch (e) {
        setError(messageFor(e));
        setState("error");
      }
    })();
    // discountCodes comes from the URL and does not change while this page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "loading") {
    return (
      <div className="space-y-3" aria-busy="true">
        <span className="sr-only" role="status">Loading checkout</span>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (state === "error") {
    return (
      <ErrorState as="h2" description={error ?? "We couldn't start your checkout."}
        action={<Button onClick={() => { window.location.href = `/s/${slug}/cart`; }}>
          Back to your basket
        </Button>} />
    );
  }

  if (!quote || quote.stores.length === 0) {
    return (
      <EmptyState as="h2" title="Your basket is empty"
        description="There's nothing to check out."
        action={<Button onClick={() => { window.location.href = `/s/${slug}`; }}>
          Continue shopping
        </Button>} />
    );
  }

  if (placed) {
    return <PayStep slug={slug} placed={placed} quote={quote} publishableKey={publishableKey} />;
  }

  return <DetailsStep slug={slug} quote={quote} discountCodes={discountCodes} onPlaced={setPlaced} />;
}

function Summary({quote}: {quote: Quote}) {
  return (
    <Card className="lg:sticky lg:top-6">
      <CardBody className="space-y-3 pt-5">
        <h2 className="text-md font-semibold">Your order</h2>
        <ul className="divide-y divide-line text-base">
          {quote.stores.flatMap(s => s.lines).map(line => (
            <li key={line.cartItemId} className="flex justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate">{line.title}</span>
                <span className="text-sm text-ink-muted">× {line.quantity}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {formatMoney(line.unitPrice * line.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-line pt-3 text-md font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(quote.grandTotal)}</span>
        </div>
      </CardBody>
    </Card>
  );
}

function DetailsStep({slug, quote, discountCodes, onPlaced}: {
  slug: string; quote: Quote;
  discountCodes: Record<string, string>;
  onPlaced: (p: Placed) => void;
}) {
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [line1, setLine1] = React.useState("");
  const [city, setCity] = React.useState("");
  const [postcode, setPostcode] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [placing, setPlacing] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const emailOk = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email.trim());
  const addressOk = [name, line1, city, postcode, country].every(v => v.trim().length > 0);

  async function place(e: React.FormEvent) {
    e.preventDefault();
    const token = existingCartToken();
    if (!token) return;
    setPlacing(true); setError(undefined);
    try {
      const result = await api<Placed>("/api/checkout?commit=true", {
        method: "POST",
        body: {
          sessionToken: token,
          email: email.trim().toLowerCase(),
          discountCodes,
          shippingAddress: {
            name: name.trim(), line1: line1.trim(), city: city.trim(),
            postcode: postcode.trim(), country: country.trim(),
          },
        },
      });
      onPlaced(result);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
      <Card>
        <CardBody className="pt-5">
          <form onSubmit={place} className="space-y-4">
            <h2 className="text-md font-semibold">Where it&apos;s going</h2>

            <Input label="Email" type="email" required autoComplete="email"
              hint="Your receipt and any updates go here."
              error={email && !emailOk ? "Enter a valid email address." : undefined}
              value={email} onChange={e => setEmail(e.target.value)} />

            <Input label="Full name" required autoComplete="name"
              value={name} onChange={e => setName(e.target.value)} />
            <Input label="Address" required autoComplete="address-line1"
              value={line1} onChange={e => setLine1(e.target.value)} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Town or city" required autoComplete="address-level2"
                value={city} onChange={e => setCity(e.target.value)} />
              <Input label="Postcode" required autoComplete="postal-code"
                value={postcode} onChange={e => setPostcode(e.target.value)} />
            </div>
            <Input label="Country" required autoComplete="country-name"
              value={country} onChange={e => setCountry(e.target.value)} />

            {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}

            <Button type="submit" size="lg" fullWidth loading={placing}
              loadingLabel="Reserving your items…"
              disabled={!emailOk || !addressOk}>
              Continue to payment
            </Button>
            <p className="text-sm text-ink-subtle">
              Your items are held for 20 minutes while you pay.
            </p>
          </form>
        </CardBody>
      </Card>

      <Summary quote={quote} />
    </div>
  );
}

function PayStep({slug, placed, quote, publishableKey}: {
  slug: string; placed: Placed; quote: Quote; publishableKey: string | null;
}) {
  const payable = placed.intents.filter(i => i.clientSecret);
  const blocked = placed.intents.filter(i => !i.clientSecret);

  // The order exists and stock is held either way, so the failure below is about
  // taking payment, not about the order being lost.
  if (!publishableKey) {
    return (
      <ErrorState as="h2" title="Payment isn't set up"
        description="Your order has been placed and your items are reserved, but this store can't take card payments yet. Contact the seller to complete it."
        action={<Button onClick={() => { window.location.href = `/s/${slug}/order/${placed.orderGroupId}`; }}>
          View your order
        </Button>} />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
      <div className="space-y-4">
        {blocked.length > 0 && (
          <Card className="border-warning/40">
            <CardBody className="pt-5">
              <h2 className="text-md font-semibold">One seller can&apos;t take payment yet</h2>
              <p className="mt-2 text-base text-ink-muted">
                {blocked.length === placed.intents.length
                  ? "This seller hasn't finished setting up payments. Your order is saved and your items are reserved — contact them to complete it."
                  : "Part of your order is with a seller who hasn't finished setting up payments. You can pay for the rest now."}
              </p>
            </CardBody>
          </Card>
        )}

        {payable.map(intent => (
          <PaymentForm key={intent.orderId} slug={slug} intent={intent}
            publishableKey={publishableKey} orderGroupId={placed.orderGroupId} />
        ))}
      </div>

      <Summary quote={quote} />
    </div>
  );
}

/**
 * One Stripe instance per connected account is not needed here — the client secret
 * carries the account — but a separate Elements provider per intent is, because each
 * has its own secret.
 */
const stripeCache = new Map<string, Promise<Stripe | null>>();
function stripeFor(key: string) {
  if (!stripeCache.has(key)) stripeCache.set(key, loadStripe(key));
  return stripeCache.get(key)!;
}

function PaymentForm({slug, intent, publishableKey, orderGroupId}: {
  slug: string; intent: Intent; publishableKey: string; orderGroupId: string;
}) {
  return (
    <Card>
      <CardBody className="pt-5">
        <h2 className="mb-4 text-md font-semibold">Payment</h2>
        <Elements
          stripe={stripeFor(publishableKey)}
          options={{clientSecret: intent.clientSecret!, appearance: {theme: "night"}}}
        >
          <PaymentFields slug={slug} orderGroupId={orderGroupId} />
        </Elements>
      </CardBody>
    </Card>
  );
}

function PaymentFields({slug, orderGroupId}: {slug: string; orderGroupId: string}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = React.useState(false);
  const [error, setError] = React.useState<string>();

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true); setError(undefined);

    const returnUrl = `${window.location.origin}/s/${slug}/order/${orderGroupId}`;
    const {error: stripeError} = await stripe.confirmPayment({
      elements,
      confirmParams: {return_url: returnUrl},
      // Only redirect when the payment method actually requires it. A card that
      // succeeds outright should land on the confirmation page without a round trip.
      redirect: "if_required",
    });

    if (stripeError) {
      setError(stripeError.message ?? "Your payment couldn't be completed.");
      setPaying(false);
      return;
    }

    // The webhook is what marks the order paid; this only takes the shopper onward.
    // Clearing the basket here rather than earlier means a failed payment leaves
    // them with their items still in it.
    clearCartToken();
    window.location.href = returnUrl;
  }

  return (
    <form onSubmit={pay} className="space-y-4">
      <PaymentElement />
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      <Button type="submit" size="lg" fullWidth loading={paying} loadingLabel="Taking payment…"
        disabled={!stripe || !elements}>
        Pay now
      </Button>
    </form>
  );
}
