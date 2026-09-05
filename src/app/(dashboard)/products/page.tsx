"use client";
import React from "react";
import {AppShell} from "@/components/shell/AppShell";
import {Button} from "@/components/ui/Button";
import {Input, Select} from "@/components/ui/Input";
import {Modal} from "@/components/ui/Modal";
import {EmptyState, ErrorState, Skeleton} from "@/components/ui/States";
import {useToast} from "@/components/ui/Toast";
import {DataTable, type Column} from "@/components/merchant/DataTable";
import {ProductStatusBadge} from "@/components/merchant/StatusBadge";
import {api, messageFor} from "@/core/ui/apiClient";

type Product = {
  id: string; title: string; description: string | null;
  status: string; created_at: string;
};

const PAGE_SIZE = 25;

export default function ProductsPage() {
  return (
    <AppShell activeId="products">
      <ProductsScreen />
    </AppShell>
  );
}

function ProductsScreen() {
  const toast = useToast();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string>();
  const [rows, setRows] = React.useState<Product[]>([]);
  const [total, setTotal] = React.useState(0);
  const [creating, setCreating] = React.useState(false);

  // Debounced so typing a search does not fire a request per keystroke, and aborted
  // so a slow earlier response cannot overwrite a newer one.
  React.useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const params = new URLSearchParams({page: String(page), pageSize: String(PAGE_SIZE)});
        if (search.trim()) params.set("search", search.trim());
        if (status) params.set("status", status);
        const data = await api<{products: Product[]; total: number}>(
          `/api/products?${params}`, {signal: controller.signal});
        setRows(data.products);
        setTotal(data.total);
        setState("ready");
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(messageFor(e));
        setState("error");
      }
    }, search ? 300 : 0);

    return () => { controller.abort(); clearTimeout(timer); };
  }, [search, status, page]);

  const columns: Column<Product>[] = [
    {
      key: "title", header: "Product",
      render: p => (
        <div className="min-w-0">
          <a href={`/products/${p.id}`} className="font-medium text-ink underline-offset-2 hover:underline">
            {p.title}
          </a>
          {p.description && (
            <p className="mt-0.5 line-clamp-1 text-sm text-ink-muted">{p.description}</p>
          )}
        </div>
      ),
    },
    {key: "status", header: "Status", render: p => <ProductStatusBadge status={p.status} />},
    {
      key: "created", header: "Added", secondary: true,
      render: p => (
        <time dateTime={p.created_at} className="text-sm text-ink-muted">
          {new Date(p.created_at).toLocaleDateString()}
        </time>
      ),
    },
  ];

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Products</h1>
          <p className="mt-1 text-base text-ink-muted">
            {total === 0 ? "Your catalogue." : `${total} product${total === 1 ? "" : "s"} in your catalogue.`}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>Add a product</Button>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Input
          label="Search" type="search" placeholder="Search by name or description"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
        <Select label="Status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Live</option>
          <option value="archived">Archived</option>
        </Select>
      </div>

      {state === "loading" && (
        <div className="space-y-2" aria-busy="true">
          <span className="sr-only" role="status">Loading products</span>
          {Array.from({length: 5}).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      )}

      {state === "error" && (
        <ErrorState as="h2" description={error ?? "We couldn't load your products."}
          action={<Button onClick={() => setPage(p => p)}>Try again</Button>} />
      )}

      {state === "ready" && rows.length === 0 && !search && !status && (
        <EmptyState as="h2"
          title="No products yet"
          description="Add your first product, give it a price and some stock, then publish it to your storefront."
          action={<Button onClick={() => setCreating(true)}>Add a product</Button>} />
      )}

      {state === "ready" && (rows.length > 0 || search || status) && (
        <>
          <DataTable
            caption="Your products"
            columns={columns} rows={rows} rowKey={p => p.id}
            emptyMessage="No products match those filters."
          />
          {lastPage > 1 && (
            <nav className="mt-4 flex items-center justify-between" aria-label="Pagination">
              <Button variant="secondary" size="sm" disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}>Previous</Button>
              <p className="text-sm text-ink-muted">Page {page} of {lastPage}</p>
              <Button variant="secondary" size="sm" disabled={page >= lastPage}
                onClick={() => setPage(p => p + 1)}>Next</Button>
            </nav>
          )}
        </>
      )}

      <NewProductModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={id => {
          toast.push({tone: "success", title: "Product created", description: "Add a price and stock next."});
          window.location.href = `/products/${id}`;
        }}
      />
    </>
  );
}

function NewProductModal({open, onClose, onCreated}: {
  open: boolean; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    if (open) { setTitle(""); setDescription(""); setError(undefined); }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(undefined);
    try {
      const created = await api<{id: string}>("/api/products", {
        method: "POST",
        body: {title: title.trim(), description: description.trim() || undefined},
      });
      onCreated(created.id);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a product">
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Name" required data-autofocus maxLength={200}
          placeholder="Merino wool scarf"
          value={title} onChange={e => setTitle(e.target.value)}
        />
        <Input
          label="Description" maxLength={2000}
          hint="Optional. You can write this later."
          value={description} onChange={e => setDescription(e.target.value)}
        />
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!title.trim()}>Create</Button>
        </div>
      </form>
      <p className="mt-4 text-sm text-ink-muted">
        New products start as drafts. Nothing appears on your storefront until you publish it.
      </p>
    </Modal>
  );
}
