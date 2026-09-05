export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {setMemberRole, removeMember} from "@/core/auth/teamService";
import {teamFailure} from "../errors";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

const uuid = z.string().uuid();
const patchSchema = z.object({
  storeId: uuid.optional(),
  role: z.enum(["manager", "staff"]),
}).strict();

export const PATCH = withApi(
  {methods: ["PATCH"], rateLimit: {limit: 60, windowSeconds: 60, scope: "team:role"}},
  async (req: NextRequest, {params}) => {
    if (!params?.id || !uuid.safeParse(params.id).success) {
      return apiError(400, "INVALID_MEMBER_ID", "That team member id isn't valid.");
    }
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Pick either manager or staff.");
    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "team:manage");
    try {
      return apiSuccess(await setMemberRole({storeId, memberId: params.id, role: parsed.data.role}));
    } catch (e) { return teamFailure(e); }
  }
);

export const DELETE = withApi(
  {methods: ["DELETE"], rateLimit: {limit: 30, windowSeconds: 60, scope: "team:remove"}},
  async (req: NextRequest, {params}) => {
    if (!params?.id || !uuid.safeParse(params.id).success) {
      return apiError(400, "INVALID_MEMBER_ID", "That team member id isn't valid.");
    }
    const storeId = await resolveStoreId(new URL(req.url).searchParams.get("storeId"));
    await authorizeStoreAction(storeId, "team:manage");
    try {
      return apiSuccess(await removeMember({storeId, memberId: params.id}));
    } catch (e) { return teamFailure(e); }
  }
);
