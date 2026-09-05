import {integrationStatuses, type IntegrationId} from "./integrations";
import {anthropicModel, cerebrasModel, openRouterModel} from "@/core/ai/providers/chat";
import type {FetchLike} from "@/core/ai/providers/types";

/**
 * Live preflight for every configured integration.
 *
 * Contract tests prove our parsing is right *given* a documented response shape.
 * They cannot prove a key works, a model name exists, or a sending domain is
 * verified. This does — with real calls that are free and side-effect-free: reads
 * and listings only. It never sends an email, never starts a charge, never generates
 * an image.
 *
 * Run it immediately after adding credentials in Vercel. It turns "we think this
 * works" into a yes or no, with the provider's own answer attached.
 */

export type CheckResult = {
  id: IntegrationId;
  label: string;
  configured: boolean;
  ok: boolean;
  detail: string;
  /** Present when the check could name a concrete remedy. */
  remedy?: string;
};

const TIMEOUT_MS = 15_000;

async function timedFetch(url: string, init: RequestInit, fetchImpl?: FetchLike) {
  const impl = fetchImpl ?? (globalThis.fetch as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await impl(url, {...init, signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

/** A 1-token message is the cheapest call that proves the key and model both work. */
async function checkAnthropic(fetchImpl?: FetchLike) {
  const model = anthropicModel();
  const res = await timedFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({model, max_tokens: 1, messages: [{role: "user", content: "hi"}]}),
  }, fetchImpl);

  if (res.ok) return {ok: true, detail: `Key valid; model "${model}" responded.`};
  const body = await res.text().catch(() => "");
  if (/not_found_error|model/i.test(body) && res.status === 404) {
    return {ok: false, detail: `Key valid, but model "${model}" was not found.`,
      remedy: "Set ANTHROPIC_MODEL to a model your account can access."};
  }
  return {ok: false, detail: `Returned ${res.status}`, remedy: "Check ANTHROPIC_API_KEY."};
}

async function checkOpenAiShaped(
  label: string, url: string, apiKey: string, model: string, envVar: string, fetchImpl?: FetchLike
) {
  const res = await timedFetch(url, {headers: {Authorization: `Bearer ${apiKey}`}}, fetchImpl);
  if (!res.ok) return {ok: false, detail: `Model listing returned ${res.status}`, remedy: `Check ${envVar}.`};
  const body = await res.json().catch(() => null) as {data?: {id?: string}[]} | null;
  const ids = (body?.data ?? []).map(m => m.id ?? "");
  if (ids.length && !ids.includes(model)) {
    return {ok: false, detail: `Key valid, but "${model}" is not available.`,
      remedy: `Pick one of: ${ids.slice(0, 5).join(", ")}`};
  }
  return {ok: true, detail: `Key valid; model "${model}" is available.`};
}

/** Reads the domain list. Never sends anything. */
async function checkResend(fetchImpl?: FetchLike) {
  const res = await timedFetch("https://api.resend.com/domains",
    {headers: {Authorization: `Bearer ${process.env.RESEND_API_KEY}`}}, fetchImpl);
  if (!res.ok) return {ok: false, detail: `Returned ${res.status}`, remedy: "Check RESEND_API_KEY."};

  const body = await res.json().catch(() => null) as {data?: {name?: string; status?: string}[]} | null;
  const from = process.env.RESEND_FROM_EMAIL ?? "";
  const domain = from.match(/@([^>\s]+)/)?.[1];
  const verified = (body?.data ?? []).filter(d => d.status === "verified").map(d => d.name);

  if (domain && verified.length && !verified.includes(domain)) {
    return {
      ok: false,
      // Mail from an unverified domain is accepted by the API and then silently
      // fails to arrive, which is far harder to diagnose than a rejected send.
      detail: `Key valid, but "${domain}" is not a verified sending domain.`,
      remedy: `Verify ${domain} in Resend, or set RESEND_FROM_EMAIL to use: ${verified.join(", ")}`,
    };
  }
  return {ok: true, detail: verified.length
    ? `Key valid; verified domains: ${verified.join(", ")}.`
    : "Key valid. No verified domain yet — add one before sending in production."};
}

/**
 * Confirms the Stripe key works and that Connect is enabled — a platform that cannot
 * create connected accounts cannot pay its merchants, and that failure is much
 * cheaper to find here than at a shopper's first checkout.
 */
async function checkStripe(fetchImpl?: FetchLike) {
  const res = await timedFetch("https://api.stripe.com/v1/accounts?limit=1",
    {headers: {Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`}}, fetchImpl);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {ok: false, detail: `Returned ${res.status}`,
      remedy: /testmode|test mode/i.test(body)
        ? "The key is for the wrong mode. Check you are using live keys in production."
        : "Check STRIPE_SECRET_KEY."};
  }
  const body = await res.json().catch(() => null) as {data?: unknown[]} | null;
  return {ok: true, detail: body?.data
    ? `Key valid; Connect enabled with ${body.data.length} account(s) visible.`
    : "Key valid."};
}

export async function verifyIntegrations(opts: {fetchImpl?: FetchLike} = {}): Promise<CheckResult[]> {
  const statuses = integrationStatuses();
  const results: CheckResult[] = [];

  for (const status of statuses) {
    const base = {id: status.id, label: status.label, configured: status.configured};
    if (!status.configured) {
      results.push({...base, ok: false, detail: `Not configured: ${status.missing.join(", ")}`});
      continue;
    }

    try {
      let outcome: {ok: boolean; detail: string; remedy?: string};
      switch (status.id) {
        case "supabase":
          // A cheap authenticated read that also proves RLS-bypass works.
          outcome = await checkSupabase(opts.fetchImpl);
          break;
        case "gemini": outcome = {ok: false, detail: "No check defined yet."}; break;
        case "anthropic": outcome = await checkAnthropic(opts.fetchImpl); break;
        case "cerebras":
          outcome = await checkOpenAiShaped("Cerebras", "https://api.cerebras.ai/v1/models",
            process.env.CEREBRAS_API_KEY!, cerebrasModel(), "CEREBRAS_API_KEY", opts.fetchImpl);
          break;
        case "openrouter":
          outcome = await checkOpenAiShaped("OpenRouter", "https://openrouter.ai/api/v1/models",
            process.env.OPENROUTER_API_KEY!, openRouterModel(), "OPENROUTER_API_KEY", opts.fetchImpl);
          break;
        case "resend": outcome = await checkResend(opts.fetchImpl); break;
        case "stripe": outcome = await checkStripe(opts.fetchImpl); break;
        default: outcome = {ok: false, detail: "No check defined."};
      }
      results.push({...base, ...outcome});
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({
        ...base, ok: false,
        detail: message.includes("abort") ? "Timed out." : `Check failed: ${message.slice(0, 200)}`,
      });
    }
  }
  return results;
}

async function checkSupabase(fetchImpl?: FetchLike) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const res = await timedFetch(`${url}/rest/v1/plans?select=id&limit=1`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  }, fetchImpl);

  if (res.status === 404 || res.status === 400) {
    return {ok: false, detail: "Connected, but the schema is missing.",
      // The exact failure we expect if migrations have not been applied yet.
      remedy: "Apply supabase/migrations in order, then re-run this check."};
  }
  if (!res.ok) return {ok: false, detail: `Returned ${res.status}`, remedy: "Check the Supabase URL and service role key."};
  const rows = await res.json().catch(() => null) as unknown[] | null;
  if (!Array.isArray(rows) || rows.length === 0) {
    return {ok: false, detail: "Schema present but the plans table is empty.",
      remedy: "Re-run migration 20260101000006_billing_credits.sql to seed the plans."};
  }
  return {ok: true, detail: "Connected; schema and seed data present."};
}
