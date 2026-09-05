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

type Member = {
  id: string; userId: string; name: string | null; email: string;
  role: "manager" | "staff"; invitedAt: string;
};

export default function TeamPage() {
  return (
    <AppShell activeId="team">
      <TeamScreen />
    </AppShell>
  );
}

function TeamScreen() {
  const toast = useToast();
  const [members, setMembers] = React.useState<Member[]>([]);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string>();
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(async () => {
    setState("loading");
    try {
      const data = await api<{members: Member[]}>("/api/team");
      setMembers(data.members);
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
      toast.push({tone: "danger", title: "Couldn't update the team", description: messageFor(e)});
    }
  }

  const managerCount = members.filter(m => m.role === "manager").length;

  const columns: Column<Member>[] = [
    {
      key: "person", header: "Person",
      render: m => (
        <div className="min-w-0">
          <p className="font-medium">{m.name ?? m.email}</p>
          {m.name && <p className="text-sm text-ink-muted">{m.email}</p>}
        </div>
      ),
    },
    {
      key: "role", header: "Role",
      render: m => m.role === "manager"
        ? <Badge tone="brand">Manager</Badge>
        : <Badge tone="neutral">Staff</Badge>,
    },
    {
      key: "since", header: "Since", secondary: true,
      render: m => (
        <time dateTime={m.invitedAt} className="text-sm text-ink-muted">
          {new Date(m.invitedAt).toLocaleDateString()}
        </time>
      ),
    },
    {
      key: "actions", header: "", align: "right",
      render: m => {
        // The last manager cannot be demoted or removed: a store with no manager
        // is unrecoverable, because nobody left can promote anyone back.
        const isLastManager = m.role === "manager" && managerCount <= 1;
        return (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" disabled={isLastManager}
              title={isLastManager ? "This is your only manager." : undefined}
              onClick={() => act(
                () => api(`/api/team/${m.id}`, {
                  method: "PATCH", body: {role: m.role === "manager" ? "staff" : "manager"},
                }),
                m.role === "manager" ? `${m.email} is now staff` : `${m.email} is now a manager`)}>
              Make {m.role === "manager" ? "staff" : "manager"}
            </Button>
            <Button size="sm" variant="ghost" disabled={isLastManager}
              onClick={() => act(
                () => api(`/api/team/${m.id}`, {method: "DELETE"}), `${m.email} removed`)}>
              <span className="sr-only">Remove {m.email}</span>
              <span aria-hidden="true">✕</span>
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Team</h1>
          <p className="mt-1 text-base text-ink-muted">Who can work on this store.</p>
        </div>
        <Button onClick={() => setAdding(true)}>Add someone</Button>
      </header>

      {state === "loading" && (
        <div className="space-y-2" aria-busy="true">
          <span className="sr-only" role="status">Loading your team</span>
          {Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      )}

      {state === "error" && (
        <ErrorState as="h2" description={error ?? "We couldn't load your team."}
          action={<Button onClick={() => void load()}>Try again</Button>} />
      )}

      {state === "ready" && members.length === 0 && (
        <EmptyState as="h2" title="Nobody else yet"
          description="Add a colleague so they can manage products and fulfil orders."
          action={<Button onClick={() => setAdding(true)}>Add someone</Button>} />
      )}

      {state === "ready" && members.length > 0 && (
        <>
          <DataTable caption="Your team" columns={columns} rows={members} rowKey={m => m.id} />
          <div className="mt-4 rounded-xl border border-line bg-surface p-5">
            <h2 className="text-md font-semibold">What each role can do</h2>
            <dl className="mt-3 space-y-2 text-base text-ink-muted">
              <div>
                <dt className="inline font-medium text-ink">Manager — </dt>
                <dd className="inline">everything, including refunds, billing, the team and deleting the store.</dd>
              </div>
              <div>
                <dt className="inline font-medium text-ink">Staff — </dt>
                <dd className="inline">
                  products, orders and fulfilment. Deliberately no refunds, no billing and no
                  team changes: those move money or change who has access.
                </dd>
              </div>
            </dl>
          </div>
        </>
      )}

      <AddMemberModal open={adding} onClose={() => setAdding(false)}
        onAdded={async () => {
          setAdding(false);
          await load();
          toast.push({tone: "success", title: "Added to your team"});
        }} />
    </>
  );
}

function AddMemberModal({open, onClose, onAdded}: {
  open: boolean; onClose: () => void; onAdded: () => Promise<void>;
}) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"manager" | "staff">("staff");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    if (open) { setEmail(""); setRole("staff"); setError(undefined); }
  }, [open]);

  const emailOk = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(undefined);
    try {
      await api("/api/team", {method: "POST", body: {email: email.trim().toLowerCase(), role}});
      await onAdded();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add someone to your team">
      <form onSubmit={submit} className="space-y-4">
        <Input label="Email" type="email" required data-autofocus
          hint="They need a Storovex account already."
          error={email && !emailOk ? "Enter a valid email address." : undefined}
          value={email} onChange={e => setEmail(e.target.value)} />
        <Select label="Role" value={role}
          onChange={e => setRole(e.target.value as "manager" | "staff")}>
          <option value="staff">Staff — products and orders</option>
          <option value="manager">Manager — everything, including refunds and billing</option>
        </Select>
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!emailOk}>Add</Button>
        </div>
      </form>
    </Modal>
  );
}
