export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {listTeam, addMember} from "@/core/auth/teamService";
import {teamFailure} from "./errors";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

const addSchema = z.object({
  storeId: z.string().uuid().optional(),
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["manager", "staff"]),
}).strict();

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 120, windowSeconds: 60, scope: "team:list"}},
  async (req: NextRequest) => {
    const storeId = await resolveStoreId(new URL(req.url).searchParams.get("storeId"));
    // Reading the team is a manager action: it exposes colleagues' email addresses.
    await authorizeStoreAction(storeId, "team:manage");
    return apiSuccess({members: await listTeam(storeId)});
  }
);

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 20, windowSeconds: 300, scope: "team:add"}},
  async (req: NextRequest) => {
    const parsed = addSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the email address and role.");
    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "team:manage");
    try {
      return apiSuccess(await addMember({storeId, email: parsed.data.email, role: parsed.data.role}), 201);
    } catch (e) { return teamFailure(e); }
  }
);
