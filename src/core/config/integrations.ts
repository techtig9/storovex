/**
 * Deferred-credentials model.
 *
 * No key is required at build time and none is required to boot. You can deploy to
 * Vercel with an empty environment, then paste keys into Project Settings →
 * Environment Variables and redeploy. Nothing here reads a secret at module scope,
 * so a missing key can never break the build or crash the server on start — it only
 * disables the feature that needs it, at the moment that feature is used.
 *
 * The rule this encodes: a missing credential is a configuration state, not a crash.
 */

export type IntegrationId = "supabase" | "paddle" | "resend" | "gemini" | "cerebras" | "openrouter" | "anthropic";

export type IntegrationStatus = {
  id: IntegrationId;
  label: string;
  configured: boolean;
  required: boolean;
  missing: string[];
  /** What stops working while this is unconfigured. */
  disables: string;
};

function present(name: string) {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

function check(
  id: IntegrationId, label: string, vars: string[], required: boolean, disables: string
): IntegrationStatus {
  const missing = vars.filter(v => !present(v));
  return {id, label, configured: missing.length === 0, required, missing, disables};
}

export function integrationStatuses(): IntegrationStatus[] {
  return [
    check("supabase", "Supabase",
      ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
      true, "Authentication, database and storage — the app cannot serve signed-in users."),
    check("paddle", "Paddle", ["PADDLE_API_KEY", "PADDLE_WEBHOOK_SECRET"],
      false, "Checkout and subscription webhooks. Existing plans still read from the database."),
    check("resend", "Resend", ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET"],
      false, "Transactional email. Supabase still sends its own auth emails."),
    check("gemini", "Gemini", ["GEMINI_API_KEY"], false, "Image generation."),
    check("cerebras", "Cerebras", ["CEREBRAS_API_KEY"], false, "Primary chat provider."),
    check("openrouter", "OpenRouter", ["OPENROUTER_API_KEY"], false, "Chat fallback provider."),
    check("anthropic", "Anthropic", ["ANTHROPIC_API_KEY"], false, "Complex reasoning tasks."),
  ];
}

/** True only when every integration marked required is fully configured. */
export function requiredIntegrationsReady() {
  return integrationStatuses().filter(s => s.required).every(s => s.configured);
}

export function missingRequiredVars() {
  return integrationStatuses().filter(s => s.required).flatMap(s => s.missing);
}

/**
 * Thrown by a feature whose credential is absent, so the caller can return a clean
 * 503 that names the integration instead of a 500 with a stack trace.
 */
export class IntegrationNotConfiguredError extends Error {
  constructor(readonly integration: IntegrationId, readonly missing: string[]) {
    super(`INTEGRATION_NOT_CONFIGURED: ${integration}`);
  }
}

export function requireIntegration(id: IntegrationId) {
  const status = integrationStatuses().find(s => s.id === id);
  if (!status || !status.configured) {
    throw new IntegrationNotConfiguredError(id, status?.missing ?? []);
  }
}
