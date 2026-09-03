// Reads request headers (rate limiting, auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {setProjectStatus, duplicateProject, deleteProject} from "@/core/projects/projectService";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

// `from` is deliberately not accepted from the client. It used to be, which meant a
// caller could lie about a project's current status to bypass the transition rules
// (for example moving an archived project straight back to draft).
const patchSchema = z.discriminatedUnion("action", [
  z.object({action: z.literal("duplicate"), storeId: z.string().uuid().optional()}),
  z.object({
    action: z.literal("set_status"),
    storeId: z.string().uuid().optional(),
    to: z.enum(["draft", "active", "archived"]),
  }),
]);

export const PATCH = withApi(
  {methods: ["PATCH"], rateLimit: {limit: 60, windowSeconds: 60, scope: "projects:update"}},
  async (req: NextRequest, {params}) => {
    const projectId = params?.id;
    if (!projectId || !z.string().uuid().safeParse(projectId).success) {
      return apiError(400, "INVALID_PROJECT_ID", "That project id isn't valid.");
    }
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the request and try again.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    const membership = await authorizeStoreAction(storeId, "store:write");

    if (parsed.data.action === "duplicate") {
      const project = await duplicateProject({storeId, userId: membership.user.id, projectId});
      return apiSuccess(project, 201);
    }
    return apiSuccess(await setProjectStatus({storeId, projectId, to: parsed.data.to}));
  }
);

export const DELETE = withApi(
  {methods: ["DELETE"], rateLimit: {limit: 30, windowSeconds: 60, scope: "projects:delete"}},
  async (req: NextRequest, {params}) => {
    const projectId = params?.id;
    if (!projectId || !z.string().uuid().safeParse(projectId).success) {
      return apiError(400, "INVALID_PROJECT_ID", "That project id isn't valid.");
    }
    const storeId = await resolveStoreId(new URL(req.url).searchParams.get("storeId"));
    await authorizeStoreAction(storeId, "store:write");
    return apiSuccess(await deleteProject({storeId, projectId}));
  }
);
