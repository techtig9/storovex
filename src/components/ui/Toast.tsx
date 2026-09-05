"use client";
import React from "react";
import {cn} from "./cn";

export type ToastTone = "info" | "success" | "warning" | "danger";
export type Toast = {id: string; tone: ToastTone; title: string; description?: string};

type ToastContext = {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
};

const Ctx = React.createContext<ToastContext | null>(null);

export function useToast() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const AUTO_DISMISS_MS = 6000;

export function ToastProvider({children}: {children: React.ReactNode}) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: string) => {
    setToasts(t => t.filter(x => x.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const push = React.useCallback((toast: Omit<Toast, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts(t => [...t, {...toast, id}]);
    // Errors stay until dismissed: auto-hiding a failure the user may not have read
    // is how people miss that their work did not save.
    if (toast.tone !== "danger") {
      timers.current.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
    }
  }, [dismiss]);

  React.useEffect(() => {
    const map = timers.current;
    return () => { map.forEach(clearTimeout); map.clear(); };
  }, []);

  return (
    <Ctx.Provider value={{toasts, push, dismiss}}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </Ctx.Provider>
  );
}

const TONE_STYLES: Record<ToastTone, string> = {
  info: "border-line",
  success: "border-success/40",
  warning: "border-warning/40",
  danger: "border-danger/40",
};

function ToastViewport({toasts, onDismiss}: {toasts: Toast[]; onDismiss: (id: string) => void}) {
  return (
    <div
      // Polite so a toast never interrupts what a screen reader is already saying.
      // Errors get role="alert" on the item itself.
      // A bare div cannot carry aria-label; it needs a role for the name to attach to.
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          role={t.tone === "danger" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto w-full max-w-sm animate-fade-up rounded-lg border bg-surface p-4 shadow-overlay",
            TONE_STYLES[t.tone]
          )}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold">{t.title}</p>
              {t.description && <p className="mt-0.5 text-sm text-ink-muted">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="-m-1.5 shrink-0 rounded-md p-1.5 text-ink-subtle transition-colors duration-fast hover:bg-surface-raised hover:text-ink"
            >
              <span className="sr-only">Dismiss</span>
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="m4 4 8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
