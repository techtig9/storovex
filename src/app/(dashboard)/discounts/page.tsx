"use client";
import React from "react";
import {AppShell} from "@/components/shell/AppShell";
import {Button} from "@/components/ui/Button";
import {Input, Select} from "@/components/ui/Input";
import {Modal} from "@/components/ui/Modal";
import {Badge, EmptyState, ErrorState, Skeleton} from "@/components/ui/States";
import {useToast} from "@/components/ui/Toast";
import {DataTable, type Column} from "@/components/merchant/DataTable";
import {api, messageFor} from "@/core/ui/apiClient";
import {formatMoney} from "@/core/commerce/money";

type Discount = {
  id: string; code: string; type: "percent" | "fixed"; value: number;
  minSubtotal: number | null; usageLimit: number | null; usedCount: number;
  active: boolean; expiresAt: string | null;
};

export default function DiscountsPage() {
  return (
    <AppShell activeId="discounts">
      <DiscountsScreen />
    </AppShell>
  );
}

function DiscountsScreen() {
  const toast = useToast();
  const [rows, setRows] = React.useState<Discount[]>([]);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string>();
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(async () => {
    setState("loading");
    try {
      const data = await api<{discounts: Discount[]}>("/api/discounts");
      setRows(data.discounts);
      setState("ready");
    } catch (e) {
      setError(messageFor(e));
      setState("error");
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  async function act(fn: () => Promise<unknown>, title: string) {
    try {
      await fn();
      await load();
      toast.push({tone: "success", title});
    } catch (e) {
      toast.push({tone: "danger", title: "Couldn't update", description: messageFor(e)});
    }
  }

  function describe(d: Discount) {
    const amount = d.type === "percent" ? `${d.value}% off` : `${formatMoney(d.value)} off`;
    return d.minSubtotal ? `${amount} over ${formatMoney(d.minSubtotal)}` : amount;
  }

  const expired = (d: Discount) => Boolean(d.expiresAt && new Date(d.expiresAt) < new Date());
  const exhausted = (d: Discount) => d.usageLimit != null && d.usedCount >= d.usageLimit;

  const columns: Column<Discount>[] = [
    {key: "code", header: "Code", render: d => <code className="font-mono font-medium">{d.code}</code>},
    {key: "value", header: "Discount", render: d => describe(d)},
    {
      key: "state", header: "State",
      render: d =>
        // Three separate reasons a code stops working. Showing "Inactive" for all of
        // them leaves a merchant wondering why a code they never touched stopped.
        !d.active ? <Badge tone="neutral">Inactive</Badge>
        : expired(d) ? <Badge tone="warning">Expired</Badge>
        : exhausted(d) ? <Badge tone="warning">Limit reached</Badge>
        : <Badge tone="success">Active</Badge>,
    },
    {
      key: "used", header: "Used", secondary: true, align: "right",
      render: d => <span className="text-ink-muted">{d.usedCount}{d.usageLimit != null && ` / ${d.usageLimit}`}</span>,
    },
    {
      key: "actions", header: "", align: "right",
      render: d => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost"
            onClick={() => act(
              () => api(`/api/discounts/${d.id}`, {method: "PATCH", body: {active: !d.active}}),
              d.active ? `${d.code} deactivated` : `${d.code} activated`)}>
            {d.active ? "Deactivate" : "Activate"}
          </Button>
          {d.usedCount === 0 && (
            <Button size="sm" variant="ghost"
              onClick={() => act(
                () => api(`/api/discounts/${d.id}`, {method: "DELETE"}), `${d.code} deleted`)}>
              <span className="sr-only">Delete {d.code}</span>
              <span aria-hidden="true">✕</span>
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Discounts</h1>
          <p className="mt-1 text-base text-ink-muted">
            Codes shoppers can enter at checkout.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>Create a code</Button>
      </header>

      {state === "loading" && (
        <div className="space-y-2" aria-busy="true">
          <span className="sr-only" role="status">Loading discounts</span>
          {Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      )}

      {state === "error" && (
        <ErrorState as="h2" description={error ?? "We couldn't load your discounts."}
          action={<Button onClick={() => void load()}>Try again</Button>} />
      )}

      {state === "ready" && rows.length === 0 && (
        <EmptyState as="h2" title="No discount codes"
          description="Create a code to run a sale or reward a customer. Codes are never listed publicly — a shopper has to know one to use it."
          action={<Button onClick={() => setCreating(true)}>Create a code</Button>} />
      )}

      {state === "ready" && rows.length > 0 && (
        <DataTable caption="Your discount codes" columns={columns} rows={rows} rowKey={d => d.id} />
      )}

      <NewDiscountModal open={creating} onClose={() => setCreating(false)}
        onCreated={async () => {
          setCreating(false);
          await load();
          toast.push({tone: "success", title: "Discount created"});
        }} />
    </>
  );
}

function NewDiscountModal({open, onClose, onCreated}: {
  open: boolean; onClose: () => void; onCreated: () => Promise<void>;
}) {
  const [code, setCode] = React.useState("");
  const [type, setType] = React.useState<"percent" | "fixed">("percent");
  const [value, setValue] = React.useState("");
  const [minSubtotal, setMinSubtotal] = React.useState("");
  const [usageLimit, setUsageLimit] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    if (open) {
      setCode(""); setType("percent"); setValue("");
      setMinSubtotal(""); setUsageLimit(""); setError(undefined);
    }
  }, [open]);

  const numeric = Number(value);
  const valueOk = type === "percent"
    ? Number.isInteger(numeric) && numeric >= 1 && numeric <= 100
    : Number.isFinite(numeric) && numeric > 0;
  const codeOk = /^[A-Za-z0-9_-]{3,40}$/.test(code.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(undefined);
    try {
      await api("/api/discounts", {
        method: "POST",
        body: {
          code: code.trim(),
          type,
          // Percent is a whole number; a fixed amount is money, so it converts to
          // minor units exactly like every other price in the system.
          value: type === "percent" ? Math.round(numeric) : Math.round(numeric * 100),
          minSubtotal: minSubtotal.trim() ? Math.round(Number(minSubtotal) * 100) : null,
          usageLimit: usageLimit.trim() ? Math.round(Number(usageLimit)) : null,
        },
      });
      await onCreated();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create a discount code">
      <form onSubmit={submit} className="space-y-4">
        <Input label="Code" required data-autofocus placeholder="SPRING20" maxLength={40}
          hint="Letters, numbers, hyphens and underscores. Stored in capitals."
          error={code && !codeOk ? "Between 3 and 40 letters, numbers, - or _." : undefined}
          value={code} onChange={e => setCode(e.target.value.toUpperCase())} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Type" value={type} onChange={e => setType(e.target.value as "percent" | "fixed")}>
            <option value="percent">Percentage off</option>
            <option value="fixed">Fixed amount off</option>
          </Select>
          <Input
            label={type === "percent" ? "Percent off" : "Amount off"}
            required inputMode="decimal"
            placeholder={type === "percent" ? "20" : "5.00"}
            error={value && !valueOk
              ? type === "percent" ? "A whole number from 1 to 100." : "An amount above zero."
              : undefined}
            value={value} onChange={e => setValue(e.target.value)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Minimum spend" inputMode="decimal" placeholder="25.00"
            hint="Optional" value={minSubtotal} onChange={e => setMinSubtotal(e.target.value)} />
          <Input label="Usage limit" inputMode="numeric" placeholder="100"
            hint="Optional. Total uses across all shoppers."
            value={usageLimit} onChange={e => setUsageLimit(e.target.value)} />
        </div>

        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!codeOk || !valueOk}>Create</Button>
        </div>
      </form>
      <p className="mt-4 text-sm text-ink-muted">
        The code and its value can&apos;t be edited later — changing what a code was worth
        after it has been used would make your order history impossible to explain.
      </p>
    </Modal>
  );
}
