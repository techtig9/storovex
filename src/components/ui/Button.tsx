"use client";
import React from "react";
import {cn} from "./cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "ai" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-contrast hover:bg-brand-hover active:brightness-95",
  secondary: "bg-surface-raised text-ink border border-line hover:border-line-strong active:brightness-95",
  outline: "border border-line-strong text-ink hover:bg-surface-raised active:brightness-95",
  ghost: "text-ink-muted hover:bg-surface-raised hover:text-ink",
  // Cyan is reserved for AI affordances so the accent means something.
  ai: "bg-ai-soft text-ai border border-ai/30 hover:border-ai/60 active:brightness-95",
  danger: "bg-danger text-white hover:brightness-110 active:brightness-95",
  success: "bg-success text-white hover:brightness-110 active:brightness-95",
};

const SIZES: Record<ButtonSize, string> = {
  // Heights meet the 44px touch target at md and lg; sm is for dense table rows only.
  sm: "h-8 px-3 text-sm rounded-md gap-1.5",
  md: "h-11 px-4 text-base rounded-md gap-2",
  lg: "h-12 px-6 text-md rounded-lg gap-2",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Text announced to screen readers while loading. */
  loadingLabel?: string;
  iconLeft?: React.ReactNode;
  fullWidth?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {variant = "primary", size = "md", loading, loadingLabel = "Working…", iconLeft,
   fullWidth, className, children, disabled, ...rest}, ref
) {
  return (
    <button
      ref={ref}
      // A loading button must not be clickable, but it also must not vanish from the
      // tab order mid-interaction, so it stays focusable and reports busy.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center font-semibold whitespace-nowrap",
        "transition-[background-color,border-color,filter,transform] duration-fast ease-out",
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant], SIZES[size], fullWidth && "w-full", className
      )}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner />
          <span>{loadingLabel}</span>
        </>
      ) : (
        <>
          {iconLeft && <span aria-hidden="true" className="shrink-0">{iconLeft}</span>}
          {children}
        </>
      )}
    </button>
  );
});

function Spinner() {
  return (
    <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
