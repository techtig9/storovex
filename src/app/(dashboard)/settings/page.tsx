"use client";
import React from "react";
import {AppShell} from "@/components/shell/AppShell";
import {Button} from "@/components/ui/Button";
import {Card, CardBody, CardHeader, CardTitle} from "@/components/ui/Card";
import {Input} from "@/components/ui/Input";
import {Badge, ErrorState, Skeleton} from "@/components/ui/States";
import {useToast} from "@/components/ui/Toast";
import {Textarea} from "@/components/ui/Input";
import {api, messageFor} from "@/core/ui/apiClient";
import {formatMoney} from "@/core/commerce/money";

type Store = {
  id: string; name: string; slug: string;
  stripeConnected: boolean; creditsRemaining: number;
  tagline: string | null; about: string | null;
  logoUrl: string | null; themeAccent: string | null;
  shippingFlatRate: number; shippingFreeThreshold: number | null;
  taxBasisPoints: number;
};

export default function SettingsPage() {
  return (
    <AppShell activeId="settings">
      <SettingsScreen />
    </AppShell>
  );
}

function SettingsScreen() {
  const [store, setStore] = React.useState<Store | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string>();

  const load = React.useCallback(async () => {
    setState("loading");
    try {
      setStore(await api<Store>("/api/stores"));
      setState("ready");
    } catch (e) {
      setError(messageFor(e));
      setState("error");
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  // The heading renders in every state. A page whose h1 only appears once data
  // arrives has no h1 at all while loading or failing, which leaves a screen reader
  // with nothing to announce and breaks the document outline.
  return (
    <>
      <header className="mb-6">
        <h1 className="text-3xl">Settings</h1>
        <p className="mt-1 text-base text-ink-muted">Your store and how you get paid.</p>
      </header>

      {state === "loading" && (
        <div className="space-y-4" aria-busy="true">
          <span className="sr-only" role="status">Loading settings</span>
          <Skeleton className="h-52 w-full" />
        </div>
      )}

      {(state === "error" || (state === "ready" && !store)) && (
        <ErrorState as="h2" description={error ?? "We couldn't load your settings."}
          action={<Button onClick={() => void load()}>Try again</Button>} />
      )}

      {state === "ready" && store && (
        <div className="grid gap-6 lg:grid-cols-2">
          <StoreDetails store={store} onSaved={load} />
          <Payouts store={store} />
          <ShippingAndTax store={store} onSaved={load} />
          <Storefront store={store} onSaved={load} />
          <Credits store={store} />
        </div>
      )}
    </>
  );
}

function StoreDetails({store, onSaved}: {store: Store; onSaved: () => Promise<void>}) {
  const toast = useToast();
  const [name, setName] = React.useState(store.name);
  const [slug, setSlug] = React.useState(store.slug);
  const [saving, setSaving] = React.useState(false);

  const slugOk = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug);
  const dirty = name !== store.name || slug !== store.slug;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/stores", {method: "PATCH", body: {name: name.trim(), slug: slug.trim()}});
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
      <CardHeader><CardTitle as="h2">Store</CardTitle></CardHeader>
      <CardBody>
        <form onSubmit={save} className="space-y-4">
          <Input label="Store name" required maxLength={120}
            value={name} onChange={e => setName(e.target.value)} />
          <Input label="Storefront address" required maxLength={60}
            hint={`Your storefront is at /s/${slug || "your-store"}`}
            error={slug && !slugOk ? "Lowercase letters, numbers and hyphens." : undefined}
            value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} />
          <div className="flex items-center justify-between gap-3">
            <a href={`/s/${store.slug}`} className="text-sm text-ink-muted underline-offset-2 hover:underline">
              View your storefront
            </a>
            <Button type="submit" loading={saving} disabled={!dirty || !slugOk || !name.trim()}>
              Save changes
            </Button>
          </div>
        </form>
        {/* Changing the address breaks every link already shared — worth saying before
            they click, not after. */}
        {slug !== store.slug && slugOk && (
          <p className="mt-3 text-sm text-warning">
            Changing this breaks any links to your old address.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function Payouts({store}: {store: Store}) {
  const toast = useToast();
  const [working, setWorking] = React.useState(false);

  async function connect() {
    setWorking(true);
    try {
      const {url} = await api<{url: string}>("/api/stores/connect", {method: "POST", body: {}});
      window.location.href = url;
    } catch (e) {
      toast.push({tone: "danger", title: "Couldn't start Stripe onboarding", description: messageFor(e)});
      setWorking(false);
    }
  }

  return (
    <Card className={store.stripeConnected ? undefined : "border-warning/40"}>
      <CardHeader className="flex items-center justify-between">
        <CardTitle as="h2">Getting paid</CardTitle>
        {store.stripeConnected
          ? <Badge tone="success">Connected</Badge>
          : <Badge tone="warning">Not connected</Badge>}
      </CardHeader>
      <CardBody className="space-y-3">
        {store.stripeConnected ? (
          <>
            <p className="text-base text-ink-muted">
              Your Stripe account is connected. Payments from your storefront go to you
              directly, with the platform fee deducted in transit.
            </p>
            <Button variant="secondary" loading={working} onClick={connect}>
              Update Stripe details
            </Button>
          </>
        ) : (
          <>
            <p className="text-base text-ink-muted">
              Until you connect Stripe, shoppers can&apos;t pay you. Orders can still be
              placed and stock is held, but no payment is taken — so connect this before
              you publish anything.
            </p>
            <Button loading={working} onClick={connect}>Connect Stripe</Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function Credits({store}: {store: Store}) {
  return (
    <Card>
      <CardHeader><CardTitle as="h2">AI credits</CardTitle></CardHeader>
      <CardBody>
        <p className="text-3xl tabular-nums">{store.creditsRemaining.toLocaleString()}</p>
        <p className="mt-1 text-base text-ink-muted">
          Credits are spent on video ads and assistant messages. Failed generations are
          refunded automatically.
        </p>
      </CardBody>
    </Card>
  );
}

/** Decimal input to minor units, for money a merchant types. */
function toMinor(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function ShippingAndTax({store, onSaved}: {store: Store; onSaved: () => Promise<void>}) {
  const toast = useToast();
  const [flat, setFlat] = React.useState((store.shippingFlatRate / 100).toFixed(2));
  const [threshold, setThreshold] = React.useState(
    store.shippingFreeThreshold === null ? "" : (store.shippingFreeThreshold / 100).toFixed(2));
  const [taxPercent, setTaxPercent] = React.useState((store.taxBasisPoints / 100).toString());
  const [saving, setSaving] = React.useState(false);

  const flatMinor = toMinor(flat) ?? 0;
  const thresholdMinor = threshold.trim() === "" ? null : toMinor(threshold);
  const taxNumber = Number(taxPercent);
  const taxOk = Number.isFinite(taxNumber) && taxNumber >= 0 && taxNumber <= 100;
  const thresholdOk = threshold.trim() === "" || thresholdMinor !== null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/stores", {
        method: "PATCH",
        body: {
          shippingFlatRate: flatMinor,
          shippingFreeThreshold: thresholdMinor,
          // Percent to basis points, rounded so 8.25 becomes 825 exactly.
          taxBasisPoints: Math.round(taxNumber * 100),
        },
      });
      await onSaved();
      toast.push({tone: "success", title: "Shipping and tax saved"});
    } catch (err) {
      toast.push({tone: "danger", title: "Couldn't save", description: messageFor(err)});
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle as="h2">Shipping &amp; tax</CardTitle></CardHeader>
      <CardBody>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Shipping per order" inputMode="decimal" placeholder="4.99"
              hint="Charged once per order, not per item."
              value={flat} onChange={e => setFlat(e.target.value)} />
            <Input label="Free shipping over" inputMode="decimal" placeholder="50.00"
              hint="Leave blank to always charge."
              error={!thresholdOk ? "Enter an amount, or leave it blank." : undefined}
              value={threshold} onChange={e => setThreshold(e.target.value)} />
          </div>
          <Input label="Tax rate (%)" inputMode="decimal" placeholder="8.25"
            hint="Applied to goods plus shipping, after any discount."
            error={taxPercent && !taxOk ? "Between 0 and 100." : undefined}
            value={taxPercent} onChange={e => setTaxPercent(e.target.value)} />

          {/*
            Shows the merchant the arithmetic on a real basket, because a rate typed
            into a box is not the same as seeing what a customer will be charged.
          */}
          <p className="rounded-lg border border-line bg-surface-raised p-3 text-sm text-ink-muted">
            On a {formatMoney(4000)} order you would charge{" "}
            <span className="text-ink">
              {formatMoney(thresholdMinor !== null && 4000 >= thresholdMinor ? 0 : flatMinor)}
            </span>{" "}
            shipping and{" "}
            <span className="text-ink">
              {formatMoney(Math.floor(((4000 + (thresholdMinor !== null && 4000 >= thresholdMinor ? 0 : flatMinor)) * Math.round((taxOk ? taxNumber : 0) * 100)) / 10000))}
            </span>{" "}
            tax.
          </p>

          <div className="flex justify-end">
            <Button type="submit" loading={saving} disabled={!taxOk || !thresholdOk}>
              Save
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function Storefront({store, onSaved}: {store: Store; onSaved: () => Promise<void>}) {
  const toast = useToast();
  const [tagline, setTagline] = React.useState(store.tagline ?? "");
  const [about, setAbout] = React.useState(store.about ?? "");
  const [logoUrl, setLogoUrl] = React.useState(store.logoUrl ?? "");
  const [accent, setAccent] = React.useState(store.themeAccent ?? "#2E5AAC");
  const [saving, setSaving] = React.useState(false);

  const accentOk = /^#[0-9A-Fa-f]{6}$/.test(accent);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/stores", {
        method: "PATCH",
        body: {
          tagline: tagline.trim() || null,
          about: about.trim() || null,
          logoUrl: logoUrl.trim() || null,
          themeAccent: accentOk ? accent : null,
        },
      });
      await onSaved();
      toast.push({tone: "success", title: "Storefront updated"});
    } catch (err) {
      toast.push({tone: "danger", title: "Couldn't save", description: messageFor(err)});
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle as="h2">Storefront appearance</CardTitle></CardHeader>
      <CardBody>
        <form onSubmit={save} className="space-y-4">
          <Input label="Tagline" maxLength={160} placeholder="Hand-knitted, made to last"
            hint="Shown under your store name."
            value={tagline} onChange={e => setTagline(e.target.value)} />
          <Textarea label="About" maxLength={2000} rows={4}
            hint="A short paragraph about your shop."
            value={about} onChange={e => setAbout(e.target.value)} />
          <Input label="Logo link" type="url" maxLength={2048} placeholder="https://…"
            hint="An https link to an image."
            value={logoUrl} onChange={e => setLogoUrl(e.target.value)} />

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input label="Accent colour" maxLength={7} placeholder="#2E5AAC"
                error={accent && !accentOk ? "Use a hex colour like #2E5AAC." : undefined}
                value={accent} onChange={e => setAccent(e.target.value)} />
            </div>
            <div aria-hidden="true"
                 className="mb-1 h-11 w-11 shrink-0 rounded-md border border-line"
                 style={{background: accentOk ? accent : "transparent"}} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <a href={`/s/${store.slug}`} className="text-sm text-ink-muted underline-offset-2 hover:underline">
              Preview your storefront
            </a>
            <Button type="submit" loading={saving} disabled={Boolean(accent) && !accentOk}>Save</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
