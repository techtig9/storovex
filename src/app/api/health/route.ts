import {integrationStatuses, requiredIntegrationsReady} from "@/core/config/integrations";
import {withApi, apiSuccess} from "@/core/security/apiHandler";

export const dynamic = "force-dynamic";

/**
 * Deployment health. Reports which integrations are configured without ever
 * revealing a value — only the names of variables that are still empty.
 *
 * Use this straight after a Vercel deploy to confirm the environment took effect.
 */
export const GET = withApi({methods: ["GET"]}, async () => {
  const integrations = integrationStatuses().map(s => ({
    id: s.id,
    label: s.label,
    configured: s.configured,
    required: s.required,
    // Variable NAMES only. Never values, never partial values.
    missing: s.missing,
    disables: s.configured ? null : s.disables,
  }));

  return apiSuccess({
    status: requiredIntegrationsReady() ? "ok" : "degraded",
    time: new Date().toISOString(),
    integrations,
  });
});
