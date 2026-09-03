// Reads request headers (rate limiting, auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {validateUpload} from "@/core/storage/uploadSecurity";
import {createUploadRecord} from "@/core/storage/uploadService";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {randomUUID} from "crypto";
import {z} from "zod";

export const runtime = "nodejs";

const schema = z.object({
  storeId: z.string().uuid().optional(),
  name: z.string().min(1).max(180),
  mime: z.string().min(1).max(160),
  size: z.number().int().positive(),
}).strict();

/**
 * Registers an upload and returns the storage path the client should write to.
 * Previously this validated metadata and returned a message without persisting
 * anything, so no upload was ever actually recorded.
 */
export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 60, windowSeconds: 60, scope: "uploads:create"}},
  async (req: NextRequest) => {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the file details and try again.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    const membership = await authorizeStoreAction(storeId, "store:write");

    try {
      validateUpload({size: parsed.data.size, mime: parsed.data.mime, name: parsed.data.name});
    } catch (e) {
      const code = e instanceof Error ? e.message : "UPLOAD_INVALID";
      const message = code === "UPLOAD_SIZE_INVALID" ? "That file is too large."
        : code === "UPLOAD_MIME_NOT_ALLOWED" ? "That file type isn't supported."
        : "That filename isn't valid.";
      return apiError(422, code, message);
    }

    const record = await createUploadRecord({
      storeId, userId: membership.user.id, fileId: randomUUID(),
      name: parsed.data.name, mime: parsed.data.mime, size: parsed.data.size,
    });
    return apiSuccess(record, 201);
  }
);
