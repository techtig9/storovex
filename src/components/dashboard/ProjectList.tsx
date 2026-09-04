"use client";
import React from "react";
import {Card} from "@/components/ui/Card";
import {Badge, type BadgeTone} from "@/components/ui/States";
import {cn} from "@/components/ui/cn";

export type ProjectSummary = {
  id: string; name: string; status: "draft" | "active" | "archived";
  updated_at?: string; updatedAt?: string;
};

const STATUS_TONE: Record<ProjectSummary["status"], BadgeTone> = {
  draft: "neutral", active: "success", archived: "warning",
};

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", {day: "numeric", month: "short", year: "numeric"});
}

export function ProjectList({projects}: {projects: ProjectSummary[]}) {
  return (
    <Card className="overflow-hidden">
      {/* The table scrolls inside its own container so the page body never scrolls
          horizontally on a narrow viewport. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <caption className="sr-only">Your projects</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Project</th>
              <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Status</th>
              <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Updated</th>
            </tr>
          </thead>
          <tbody>
            {projects.map(p => (
              <tr key={p.id} className={cn("border-b border-line last:border-0", "transition-colors duration-fast hover:bg-surface-raised")}>
                <td className="px-5 py-3">
                  <a href={`/projects/${p.id}`} className="text-base font-medium text-ink hover:text-brand">
                    {p.name}
                  </a>
                </td>
                <td className="px-5 py-3">
                  <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                </td>
                <td className="px-5 py-3 text-sm tabular-nums text-ink-muted">
                  {formatDate(p.updated_at ?? p.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
