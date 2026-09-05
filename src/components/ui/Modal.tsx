"use client";
import React from "react";
import {cn} from "./cn";

/**
 * Accessible dialog: focus moves in on open, is trapped while open, and returns to
 * whatever opened it on close. Escape and backdrop both dismiss.
 *
 * Built on the native <dialog> semantics manually rather than showModal(), because
 * showModal's backdrop cannot be styled consistently across the browsers we target.
 */
export function Modal({
  open, onClose, title, description, children, footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const returnFocusTo = React.useRef<HTMLElement | null>(null);
  // Held in a ref so the effect below depends only on `open`. Callers almost always
  // pass an inline arrow, which is a new function every render — depending on it
  // would re-run the effect constantly and fire its focus-restoring cleanup with it.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const titleId = React.useId();
  const descId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    // Only worth restoring to a real element. If the dialog was opened
    // programmatically rather than by a click, activeElement is <body>, and
    // "restoring" focus there would strand a keyboard user at the top of the page.
    const active = document.activeElement as HTMLElement | null;
    returnFocusTo.current = active && active !== document.body ? active : null;

    const panel = panelRef.current;
    // Not `?.focus() ?? panel?.focus()`: focus() returns undefined, so the fallback
    // would always run and pull focus straight back onto the panel.
    const preferred = panel?.querySelector<HTMLElement>("[data-autofocus]");
    if (preferred) preferred.focus();
    else panel?.focus();

    // A background page that still scrolls under a dialog is disorienting.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key !== "Tab" || !panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      // Wrap at both ends so Tab can never escape the dialog into the inert page.
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      const target = returnFocusTo.current;
      // The trigger may have unmounted while the dialog was open.
      if (target && target.isConnected) target.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-black/60"
        onClick={() => onCloseRef.current()}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-lg animate-scale-in rounded-t-2xl border border-line bg-surface shadow-overlay",
          "sm:rounded-2xl"
        )}
      >
        <div className="px-6 pt-6">
          <h2 id={titleId} className="text-xl font-semibold">{title}</h2>
          {description && <p id={descId} className="mt-1.5 text-base text-ink-muted">{description}</p>}
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
