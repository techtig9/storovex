"use client";
import React from "react";
import {AppShell} from "@/components/shell/AppShell";
import {MetricCard} from "@/components/ui/MetricCard";
import {ProjectList, type ProjectSummary} from "@/components/dashboard/ProjectList";
import {EmptyState, ErrorState} from "@/components/ui/States";
import {Button} from "@/components/ui/Button";

type Kpis = {activationRatePct: number; generationSuccessRatePct: number; creditsRemainingPct: number};
type Load<T> = {state: "loading"} | {state: "ready"; data: T} | {state: "error"};

export default function DashboardPage() {
  const [kpis, setKpis] = React.useState<Load<Kpis>>({state: "loading"});
  const [projects, setProjects] = React.useState<Load<ProjectSummary[]>>({state: "loading"});

  React.useEffect(() => {
    const ac = new AbortController();

    // No storeId: the server resolves the caller's store from their session.
    fetch("/api/dashboard/kpis", {signal: ac.signal})
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(b => setKpis({state: "ready", data: b.data}))
      .catch(e => { if (e.name !== "AbortError") setKpis({state: "error"}); });

    fetch("/api/projects", {signal: ac.signal})
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(b => setProjects({state: "ready", data: b.data?.projects ?? []}))
      .catch(e => { if (e.name !== "AbortError") setProjects({state: "error"}); });

    return () => ac.abort();
  }, []);

  return (
    <AppShell
      activeId="dashboard"
      creditsRemaining={kpis.state === "ready" ? Math.round(kpis.data.creditsRemainingPct) : undefined}
      headerActions={<Button size="sm" onClick={() => { window.location.href = "/generate"; }}>New generation</Button>}
    >
      <header className="mb-6">
        <h1 className="text-3xl">Dashboard</h1>
        <p className="mt-1 text-base text-ink-muted">How your store is using Storovex.</p>
      </header>

      <section aria-labelledby="kpi-heading" className="mb-10">
        <h2 id="kpi-heading" className="sr-only">Key metrics</h2>
        {kpis.state === "error" ? (
          <ErrorState description="We couldn't load your numbers. Refresh to try again." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              loading={kpis.state === "loading"}
              label="Active projects"
              value={kpis.state === "ready" ? `${kpis.data.activationRatePct}%` : "—"}
              hint="Share of your projects currently active"
            />
            <MetricCard
              loading={kpis.state === "loading"}
              label="Generation success"
              value={kpis.state === "ready" ? `${kpis.data.generationSuccessRatePct}%` : "—"}
              hint="Completed generations as a share of all attempts"
              tone={kpis.state === "ready" && kpis.data.generationSuccessRatePct < 80 ? "negative" : "neutral"}
            />
            <MetricCard
              loading={kpis.state === "loading"}
              label="Credits remaining"
              value={kpis.state === "ready" ? `${kpis.data.creditsRemainingPct}%` : "—"}
              hint="Of your plan's included credits this period"
              tone={kpis.state === "ready" && kpis.data.creditsRemainingPct < 20 ? "negative" : "neutral"}
            />
          </div>
        )}
      </section>

      <section aria-labelledby="projects-heading">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="projects-heading" className="text-xl">Projects</h2>
        </div>

        {projects.state === "loading" && (
          <p role="status" className="text-base text-ink-muted">Loading your projects…</p>
        )}
        {projects.state === "error" && (
          <ErrorState description="We couldn't load your projects. Refresh to try again." />
        )}
        {projects.state === "ready" && (
          projects.data.length === 0 ? (
            <EmptyState
              title="No projects yet"
              description="A project holds one product and everything Storovex generates for it. Create your first to get started."
              action={<Button onClick={() => { window.location.href = "/generate"; }}>Create a project</Button>}
            />
          ) : (
            <ProjectList projects={projects.data} />
          )
        )}
      </section>
    </AppShell>
  );
}
