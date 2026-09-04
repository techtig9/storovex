"use client";
import React from "react";
import {Input} from "@/components/ui/Input";
import {Button} from "@/components/ui/Button";

export function AuthForm({
  mode, onSubmit, submitting, error,
}: {
  mode: "login" | "signup";
  onSubmit: (input: {email: string; password: string}) => void;
  submitting: boolean;
  error?: string;
}) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={e => { e.preventDefault(); onSubmit({email, password}); }}
    >
      <Input
        label="Email" type="email" name="email" required
        autoComplete="email" value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <Input
        label="Password" type="password" name="password" required
        // Tells password managers whether to offer a saved credential or a new one.
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        value={password}
        onChange={e => setPassword(e.target.value)}
        hint={mode === "signup" ? "At least 12 characters." : undefined}
      />

      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <Button type="submit" fullWidth size="lg" loading={submitting}
              loadingLabel={mode === "login" ? "Signing in…" : "Creating account…"}>
        {mode === "login" ? "Log in" : "Create account"}
      </Button>
    </form>
  );
}
