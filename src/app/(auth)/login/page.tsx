"use client";
import React from "react";
import {AuthForm} from "@/components/auth/AuthForm";
import {AuthLayout} from "@/components/auth/AuthLayout";

export default function LoginPage() {
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string>();

  async function handleSubmit(input: {email: string; password: string}) {
    setSubmitting(true);
    setError(undefined);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Email or password is incorrect.");
      }
      // Only a same-origin path survives, so this cannot become an open redirect.
      const next = new URLSearchParams(window.location.search).get("next");
      const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      window.location.assign(safe);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Log in"
      subtitle="Welcome back."
      footer={<>New here? <a href="/signup" className="font-medium text-brand hover:underline">Create an account</a></>}
    >
      <AuthForm mode="login" onSubmit={handleSubmit} submitting={submitting} error={error} />
    </AuthLayout>
  );
}
