"use client";
import React from "react";
import {cn} from "@/components/ui/cn";
import type {NavItem} from "./navItems";

export function Sidebar({
  items, activeId, storeName, onNavigate,
}: {
  items: NavItem[]; activeId: string; storeName: string; onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Primary" className="flex h-full flex-col gap-1 p-3">
      <div className="flex items-center gap-2 px-2 pb-4 pt-1">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-xs font-bold text-brand-contrast">
          S
        </span>
        <span className="truncate text-base font-semibold">{storeName}</span>
      </div>

      <ul className="flex flex-col gap-0.5">
        {items.map(item => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-md px-3 text-base font-medium",
                  "transition-colors duration-fast",
                  active
                    ? "bg-brand-soft text-brand"
                    : "text-ink-muted hover:bg-surface-raised hover:text-ink"
                )}
              >
                <span aria-hidden="true">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
