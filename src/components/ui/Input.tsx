"use client";
import React from "react";
import {cn} from "./cn";

const FIELD =
  "w-full rounded-md border bg-surface px-3 text-base text-ink placeholder:text-ink-subtle " +
  "transition-[border-color,box-shadow] duration-fast " +
  "disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Label, hint and error are part of the field, not the caller's job. Making them
 * optional-and-separate is how forms end up with inputs that have no accessible name.
 */
function useFieldIds(id: string | undefined, hint?: string, error?: string) {
  const generated = React.useId();
  const fieldId = id ?? generated;
  return {
    fieldId,
    hintId: hint ? `${fieldId}-hint` : undefined,
    errorId: error ? `${fieldId}-error` : undefined,
    describedBy: [hint ? `${fieldId}-hint` : null, error ? `${fieldId}-error` : null]
      .filter(Boolean).join(" ") || undefined,
  };
}

function Shell({
  label, hint, error, required, fieldId, hintId, errorId, children,
}: {
  label: string; hint?: string; error?: string; required?: boolean;
  fieldId: string; hintId?: string; errorId?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-1 text-danger" aria-hidden="true">*</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {hint && <p id={hintId} className="text-xs text-ink-subtle">{hint}</p>}
      {children}
      {/* role="alert" so the message is announced when validation fails. */}
      {error && <p id={errorId} role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string; hint?: string; error?: string;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {label, hint, error, className, id, required, ...rest}, ref
) {
  const ids = useFieldIds(id, hint, error);
  return (
    <Shell label={label} hint={hint} error={error} required={required} {...ids}>
      <input
        ref={ref}
        id={ids.fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={cn(FIELD, "h-11", error ? "border-danger" : "border-line focus:border-brand", className)}
        {...rest}
      />
    </Shell>
  );
});

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string; hint?: string; error?: string;
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {label, hint, error, className, id, required, children, ...rest}, ref
) {
  const ids = useFieldIds(id, hint, error);
  return (
    <Shell label={label} hint={hint} error={error} required={required} {...ids}>
      <select
        ref={ref}
        id={ids.fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={cn(FIELD, "h-11", error ? "border-danger" : "border-line focus:border-brand", className)}
        {...rest}
      >
        {children}
      </select>
    </Shell>
  );
});

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string; hint?: string; error?: string;
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {label, hint, error, className, id, required, ...rest}, ref
) {
  const ids = useFieldIds(id, hint, error);
  return (
    <Shell label={label} hint={hint} error={error} required={required} {...ids}>
      <textarea
        ref={ref}
        id={ids.fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={cn(FIELD, "min-h-24 py-2.5 leading-relaxed", error ? "border-danger" : "border-line focus:border-brand", className)}
        {...rest}
      />
    </Shell>
  );
});
