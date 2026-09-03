// Reads request headers (auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {resolveStoreId} from "@/core/auth/session";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {createServerSupabase} from "@/core/supabase/server";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 240, windowSeconds: 60, scope: "notifications:list"}},
  async (req: NextRequest) => {
    const params = new URL(req.url).searchParams;
    const storeId = await resolveStoreId(params.get("storeId"));
    await authorizeStoreAction(storeId, "store:read");

    const supabase = createServerSupabase();
    let query = supabase.from("notifications")
      .select("id,type,title,body,read_at,created_at")
      .eq("store_id", storeId).order("created_at", {ascending: false}).limit(50);
    if (params.get("unread") === "true") query = query.is("read_at", null);

    const {data} = await query;
    return apiSuccess({
      notifications: data ?? [],
      unreadCount: (data ?? []).filter(n => !n.read_at).length,
    });
  }
);

const patchSchema = z.object({
  storeId: z.string().uuid().optional(),
  // Omitting ids marks everything read, which is what a "mark all" control needs.
  ids: z.array(z.string().uuid()).max(100).optional(),
}).strict();

export const PATCH = withApi(
  {methods: ["PATCH"], rateLimit: {limit: 60, windowSeconds: 60, scope: "notifications:read"}},
  async (req: NextRequest) => {
    const parsed = patchSchema.safeParse(await readJson(req) ?? {});
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the request and try again.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "store:read");

    const supabase = createServerSupabase();
    let query = supabase.from("notifications")
      .update({read_at: new Date().toISOString()})
      .eq("store_id", storeId).is("read_at", null);
    if (parsed.data.ids?.length) query = query.in("id", parsed.data.ids);

    const {error} = await query;
    if (error) return apiError(500, "UPDATE_FAILED", "Couldn't update those notifications.", error);
    return apiSuccess({ok: true});
  }
);
