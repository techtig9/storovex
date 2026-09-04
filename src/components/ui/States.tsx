import React from "react";
import {Card} from "./Card";
import {cn} from "./cn";

/** Shimmer placeholder. aria-hidden because the live region announces loading, not this. */
export function Skeleton({className}: {className?: string}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-md bg-surface-raised",
        "bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.06),transparent)] bg-[length:200%_100%]",
        "animate-shimmer",
        className
      )}
    />
  );
}

export function EmptyState({
  title, description, action, icon,
}: {
  title: string; description: string; action?: React.ReactNode; icon?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon && <div aria-hidden="true" className="text-ink-subtle">{icon}</div>}
      <h3 className="text-md font-semibold">{title}</h3>
      <p className="max-w-sm text-base text-ink-muted">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

/**
 * role="alert" rather than a plain region: an error that replaces content the user
 * asked for should be announced, not silently swapped in.
 */
export function ErrorState({
  title = "Something went wrong", description, action,
}: {
  title?: string; description: string; action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 border-danger/30 px-6 py-12 text-center" role="alert">
      <h3 className="text-md font-semibold text-danger">{title}</h3>
      <p className="max-w-sm text-base text-ink-muted">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "ai";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-raised text-ink-muted border-line",
  brand: "bg-brand-soft text-brand border-brand/25",
  success: "bg-success-soft text-success border-success/25",
  warning: "bg-warning-soft text-warning border-warning/25",
  danger: "bg-danger-soft text-danger border-danger/25",
  ai: "bg-ai-soft text-ai border-ai/25",
};

/**
 * Status is never conveyed by colour alone — the label carries the meaning, so this
 * stays readable in high-contrast mode and for colour-blind users.
 */
export function Badge({tone = "neutral", children}: {tone?: BadgeTone; children: React.ReactNode}) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
      TONES[tone]
    )}>
      {children}
    </span>
  );
}
