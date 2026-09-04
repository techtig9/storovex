"use client";
import React from "react";
import {cn} from "@/components/ui/cn";
import {ariaLiveAnnouncement, type AnnouncedStage} from "@/core/ui/accessibility";

const ORDER: AnnouncedStage[] = ["planning", "building", "generating_assets", "finalizing", "completed"];
const LABELS: Record<AnnouncedStage, string> = {
  planning: "Planning",
  building: "Preparing",
  generating_assets: "Generating",
  finalizing: "Finishing",
  completed: "Ready",
  failed: "Failed",
};

/**
 * Stage indicator for a background job.
 *
 * The visual list is aria-hidden and the current stage is announced through a live
 * region instead: a screen reader reading five list items on every poll would be
 * unusable, but silently changing state would leave those users with nothing.
 */
export function GenerationProgress({stage, error}: {stage: AnnouncedStage; error?: string}) {
  const currentIndex = ORDER.indexOf(stage);
  const failed = stage === "failed";

  return (
    <div>
      <ol aria-hidden="true" className="flex flex-wrap gap-2">
        {ORDER.map((s, i) => {
          const done = !failed && currentIndex > i;
          const active = !failed && currentIndex === i;
          return (
            <li
              key={s}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-normal",
                done && "border-success/30 bg-success-soft text-success",
                active && "border-brand/40 bg-brand-soft text-brand",
                !done && !active && "border-line text-ink-subtle"
              )}
            >
              {LABELS[s]}
            </li>
          );
        })}
        {failed && (
          <li className="rounded-full border border-danger/40 bg-danger-soft px-3 py-1 text-xs font-medium text-danger">
            {LABELS.failed}
          </li>
        )}
      </ol>

      <p role="status" aria-live="polite" className="mt-3 text-sm text-ink-muted">
        {ariaLiveAnnouncement(stage)}
      </p>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
