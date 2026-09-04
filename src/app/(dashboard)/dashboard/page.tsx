"use client";
import React from "react";
import {AppShell} from "@/components/shell/AppShell";
import {EmptyState} from "@/components/ui/States";
import {Button} from "@/components/ui/Button";

export default function DashboardPage() {
  return (
    <AppShell activeId="dashboard">
      <header className="mb-6">
        <h1 className="text-3xl">Dashboard</h1>
        <p className="mt-1 text-base text-ink-muted">Your store at a glance.</p>
      </header>
      <EmptyState
        as="h2"
        title="Nothing to show yet"
        description="Once your catalogue and first orders exist, sales, stock and AI usage appear here."
        action={<Button onClick={() => { window.location.href = "/products"; }}>Add a product</Button>}
      />
    </AppShell>
  );
}
