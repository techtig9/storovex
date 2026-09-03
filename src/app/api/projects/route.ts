// Reads request headers (rate limiting, auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {listProjects, createProject} from "@/core/projects/projectService";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

const listSchema = z.object({
  storeId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  sortField: z.enum(["updated_at", "created_at", "name"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const createSchema = z.object({
  storeId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(140),
  templateId: z.string().uuid().optional(),
}).strict();

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 120, windowSeconds: 60, scope: "projects:list"}},
  async (req: NextRequest) => {
    const parsed = listSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check your filters and try again.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "store:read");
    return apiSuccess(await listProjects({...parsed.data, storeId}));
  }
);

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 30, windowSeconds: 60, scope: "projects:create"}},
  async (req: NextRequest) => {
    const parsed = createSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the project details and try again.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    const membership = await authorizeStoreAction(storeId, "store:write");
    const project = await createProject({
      storeId, userId: membership.user.id,
      name: parsed.data.name, templateId: parsed.data.templateId,
    });
    return apiSuccess(project, 201);
  }
);
