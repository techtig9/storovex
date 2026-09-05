import React from "react";
import {Card} from "./Card";
import {cn} from "./cn";

export type MetricTone = "neutral" | "positive" | "negative";

/**
 * A single headline number. `hint` carries the meaning — a percentage with no
 * denominator is a number people misread, so it is required rather than optional.
 */
export function MetricCard({
  label, value, hint, tone = "neutral", loading,
}: {
  label: string;
  value: string | number;
  hint: string;
  tone?: MetricTone;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card className="p-5">
        <div className="h-3.5 w-24 rounded bg-surface-raised" />
        <div className="mt-3 h-8 w-20 rounded bg-surface-raised" />
        <div className="mt-3 h-3 w-32 rounded bg-surface-raised" />
        <span className="sr-only">Loading {label}</span>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <p className={cn(
        "mt-1.5 text-3xl font-semibold tabular-nums tracking-tight",
        tone === "positive" && "text-success",
        tone === "negative" && "text-danger"
      )}>
        {value}
      </p>
      <p className="mt-1.5 text-xs text-ink-subtle">{hint}</p>
    </Card>
  );
}
