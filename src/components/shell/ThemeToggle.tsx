"use client";
import React from "react";
import {THEME_STORAGE_KEY} from "@/components/theme/ThemeScript";

export type ThemeId = "light" | "dark" | "high-contrast";
const LABELS: Record<ThemeId, string> = {
  light: "Light", dark: "Dark", "high-contrast": "High contrast",
};

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<ThemeId>("light");

  // Read from the DOM rather than storage: the blocking script in <head> has already
  // resolved the effective theme, including the system preference fallback.
  React.useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "light" || current === "dark" || current === "high-contrast") setTheme(current);
  }, []);

  function apply(next: ThemeId) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* private mode */ }
  }

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Theme</span>
      <select
        value={theme}
        onChange={e => apply(e.target.value as ThemeId)}
        className="h-9 rounded-md border border-line bg-surface px-2 text-sm text-ink transition-colors duration-fast hover:border-line-strong"
      >
        {(Object.keys(LABELS) as ThemeId[]).map(id => (
          <option key={id} value={id}>{LABELS[id]}</option>
        ))}
      </select>
    </label>
  );
}
