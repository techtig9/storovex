"use client";
import React from "react";
import {AuthForm} from "@/components/auth/AuthForm";
import {AuthLayout} from "@/components/auth/AuthLayout";

export default function SignupPage() {
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();

  async function handleSubmit(input: {email: string; password: string}) {
    setSubmitting(true);
    setError(undefined);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "We couldn't create that account.");
      // Signup deliberately does not sign the user in: Supabase sends a confirmation
      // first, and the response is identical whether or not the address already has
      // an account, so this cannot be used to discover who is registered.
      setNotice(body?.data?.message ?? "Check your email to confirm your account.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start generating product photography from a single reference photo."
      footer={<>Already have an account? <a href="/login" className="font-medium text-brand hover:underline">Log in</a></>}
    >
      {notice && (
        <p role="status" className="mb-5 rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm font-medium text-success">
          {notice}
        </p>
      )}
      <AuthForm mode="signup" onSubmit={handleSubmit} submitting={submitting} error={error} />
    </AuthLayout>
  );
}
