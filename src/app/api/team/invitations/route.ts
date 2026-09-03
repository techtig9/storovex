// Reads request headers (rate limiting, auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {createInvitation} from "@/core/team/invitationService";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import type {Role} from "@/core/auth/authorization";
import {z} from "zod";

const schema = z.object({
  storeId: z.string().uuid().optional(),
  email: z.string().trim().toLowerCase().email().max(254),
  targetRole: z.enum(["admin", "member"]),
}).strict();

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 20, windowSeconds: 3600, scope: "team:invite"}},
  async (req: NextRequest) => {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the invitation details.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    const membership = await authorizeStoreAction(storeId, "members:manage");
    const invite = await createInvitation({
      storeId,
      inviterRole: membership.role as Role,
      targetRole: parsed.data.targetRole,
      email: parsed.data.email,
    });
    return apiSuccess(invite, 201);
  }
);
