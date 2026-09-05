"use client";
import React from "react";
import {AppShell} from "@/components/shell/AppShell";
import {Button} from "@/components/ui/Button";
import {Card, CardBody, CardHeader, CardTitle} from "@/components/ui/Card";
import {Input} from "@/components/ui/Input";
import {EmptyState, ErrorState, Skeleton} from "@/components/ui/States";
import {useToast} from "@/components/ui/Toast";
import {api, messageFor} from "@/core/ui/apiClient";

type Collection = {id: string; title: string; slug: string; productCount: number};
type Category = {id: string; name: string; slug: string};

export default function CollectionsPage() {
  return (
    <AppShell activeId="collections">
      <CollectionsScreen />
    </AppShell>
  );
}

function CollectionsScreen() {
  const toast = useToast();
  const [collections, setCollections] = React.useState<Collection[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string>();
  const [title, setTitle] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setState("loading");
    try {
      const [c, cat] = await Promise.all([
        api<{collections: Collection[]}>("/api/collections"),
        api<{categories: Category[]}>("/api/categories"),
      ]);
      setCollections(c.collections);
      setCategories(cat.categories);
      setState("ready");
    } catch (e) {
      setError(messageFor(e));
      setState("error");
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/collections", {method: "POST", body: {title: title.trim()}});
      setTitle("");
      await load();
      toast.push({tone: "success", title: "Collection created"});
    } catch (err) {
      toast.push({tone: "danger", title: "Couldn't create it", description: messageFor(err)});
    } finally {
      setSaving(false);
    }
  }

  async function remove(collection: Collection) {
    try {
      await api(`/api/collections/${collection.id}`, {method: "DELETE"});
      await load();
      toast.push({
        tone: "success", title: `${collection.title} deleted`,
        description: collection.productCount > 0
          ? "The products in it are untouched — only the grouping is gone."
          : undefined,
      });
    } catch (err) {
      toast.push({tone: "danger", title: "Couldn't delete it", description: messageFor(err)});
    }
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-3xl">Collections</h1>
        <p className="mt-1 text-base text-ink-muted">
          Your own groupings, and the shared categories shoppers browse by.
        </p>
      </header>

      {state === "loading" && (
        <div className="space-y-2" aria-busy="true">
          <span className="sr-only" role="status">Loading collections</span>
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {state === "error" && (
        <ErrorState as="h2" description={error ?? "We couldn't load your collections."}
          action={<Button onClick={() => void load()}>Try again</Button>} />
      )}

      {state === "ready" && (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <Card>
            <CardHeader><CardTitle as="h2">Your collections</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              {collections.length === 0 ? (
                <EmptyState as="h3" title="No collections yet"
                  description="A collection is your own grouping — Winter, Sale, New in. Assign products to one from the product page." />
              ) : (
                <ul className="divide-y divide-line">
                  {collections.map(c => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{c.title}</p>
                        <p className="text-sm text-ink-muted">
                          /{c.slug} · {c.productCount} product{c.productCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => remove(c)}>
                        <span className="sr-only">Delete {c.title}</span>
                        <span aria-hidden="true">✕</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={create} className="flex items-end gap-2 border-t border-line pt-4">
                <div className="flex-1">
                  <Input label="New collection" placeholder="Winter" maxLength={120}
                    value={title} onChange={e => setTitle(e.target.value)} />
                </div>
                <Button type="submit" variant="secondary" loading={saving} disabled={!title.trim()}>
                  Create
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle as="h2">Marketplace categories</CardTitle></CardHeader>
            <CardBody>
              {/*
                Categories are the platform's shared list, not per-store. A
                marketplace where every seller invents their own category names
                cannot be browsed across sellers, which is the point of one.
              */}
              <p className="mb-3 text-base text-ink-muted">
                These are shared across every store, so shoppers can browse the whole
                marketplace. You assign them from a product; you can&apos;t add new ones.
              </p>
              {categories.length === 0 ? (
                <p className="text-base text-ink-subtle">No categories have been set up yet.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {categories.map(c => (
                    <li key={c.id}
                        className="rounded-full border border-line bg-surface-raised px-3 py-1 text-sm">
                      {c.name}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
