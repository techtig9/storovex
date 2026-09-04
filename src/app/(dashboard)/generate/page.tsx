"use client";
import React from "react";
import {AppShell} from "@/components/shell/AppShell";
import {GenerationForm} from "@/components/generation/GenerationForm";
import {GenerationProgress} from "@/components/generation/GenerationProgress";
import {Card, CardBody} from "@/components/ui/Card";
import {EmptyState} from "@/components/ui/States";
import {useToast} from "@/components/ui/Toast";
import type {AnnouncedStage} from "@/core/ui/accessibility";
import type {GenerationType, Quality} from "@/core/generation/catalog";
import {randomToken} from "@/core/ui/randomToken";

export default function GeneratePage() {
  return (
    <AppShell activeId="generate">
      <GenerateWorkspace />
    </AppShell>
  );
}

/** Separate component so it can sit inside the shell's ToastProvider. */
function GenerateWorkspace() {
  const toast = useToast();
  const [projectId, setProjectId] = React.useState<string>();
  const [submitting, setSubmitting] = React.useState(false);
  const [jobId, setJobId] = React.useState<string>();
  const [stage, setStage] = React.useState<AnnouncedStage>();
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    setProjectId(new URLSearchParams(window.location.search).get("projectId") ?? undefined);
  }, []);

  // Poll while the job is in flight. The worker runs out of band, so the page has no
  // other way to learn the outcome — previously it showed whatever stage the create
  // call returned and then never updated again.
  React.useEffect(() => {
    if (!jobId || !stage || stage === "completed" || stage === "failed") return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/generation/status?jobId=${encodeURIComponent(jobId)}`);
        if (!res.ok) return;
        const body = await res.json();
        const next = body.data?.job?.stage as AnnouncedStage | undefined;
        if (!next) return;
        setStage(next);
        if (next === "completed") {
          toast.push({tone: "success", title: "Your images are ready", description: `${body.data.assets?.length ?? 0} new image(s).`});
        } else if (next === "failed") {
          toast.push({tone: "danger", title: "Generation didn't finish", description: "Your credits have been refunded."});
        }
      } catch { /* transient network error; the next tick retries */ }
    }, 3000);
    return () => clearInterval(timer);
  }, [jobId, stage, toast]);

  async function handleSubmit(input: {type: GenerationType; quality: Quality; count: number}) {
    if (!projectId) {
      setError("Open this page from a project to start a generation.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    setStage("planning");
    try {
      const res = await fetch("/api/generation", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        // accountId and planId are deliberately absent: the server derives both from
        // the session, so a client cannot pick its own spend cap or billing account.
        body: JSON.stringify({projectId, ...input, idempotencyKey: randomToken()}),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? "Couldn't start the generation. Try again.");
        setStage("failed");
        return;
      }
      setJobId(body.data?.id);
      setStage((body.data?.stage as AnnouncedStage) ?? "planning");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setStage("failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-3xl">Generate</h1>
        <p className="mt-1 text-base text-ink-muted">
          Choose the shots you need. You&rsquo;re only charged for images that are delivered.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card>
          <CardBody className="pt-5">
            <GenerationForm onSubmit={handleSubmit} submitting={submitting} />
          </CardBody>
        </Card>

        <div>
          {stage ? (
            <Card>
              <CardBody className="pt-5">
                <GenerationProgress stage={stage} error={error} />
              </CardBody>
            </Card>
          ) : (
            <EmptyState
              title="Nothing generating yet"
              description="Pick a shot type and quality, then start a generation. Progress appears here."
            />
          )}
        </div>
      </div>
    </>
  );
}
