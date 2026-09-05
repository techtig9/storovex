"use client";
import React from "react";
import {cn} from "@/components/ui/cn";

/**
 * A table that stays a table.
 *
 * Below sm the columns marked `secondary` are hidden rather than the layout being
 * swapped for cards: a merchant scanning orders on a phone still wants rows, and a
 * table that reflows into stacked labels loses the alignment that makes a list of
 * prices readable. The wrapper scrolls horizontally so nothing is ever cut off.
 */
export type Column<T> = {
  key: string;
  header: string;
  /** Hidden on small screens. Use for anything that is not the row's identity. */
  secondary?: boolean;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
};

export function DataTable<T>({
  columns, rows, rowKey, caption, onRowClick, emptyMessage = "Nothing here yet.",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Describes the table for screen readers. Required — an unlabelled table is a maze. */
  caption: string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full border-collapse text-left text-base">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map(c => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-4 py-3 text-sm font-semibold text-ink-muted",
                  c.align === "right" && "text-right",
                  c.secondary && "hidden sm:table-cell"
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-ink-muted">
                {emptyMessage}
              </td>
            </tr>
          )}
          {rows.map(row => (
            <tr
              key={rowKey(row)}
              className={cn(
                "border-b border-line last:border-0",
                onRowClick && "cursor-pointer transition-colors duration-fast hover:bg-surface-raised"
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map(c => (
                <td
                  key={c.key}
                  className={cn(
                    "px-4 py-3 align-middle",
                    c.align === "right" && "text-right tabular-nums",
                    c.secondary && "hidden sm:table-cell"
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
