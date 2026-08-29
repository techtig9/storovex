
import {z} from "zod";
export const promptSchema=z.object({
 prompt:z.string().trim().min(1).max(100000),
 system:z.string().trim().max(30000).optional(),
 model:z.string().trim().max(200).optional(),
 maxTokens:z.number().int().min(1).max(32768).optional(),
 temperature:z.number().min(0).max(2).optional(),
}).strict();

export const generationRequestSchema=promptSchema.extend({
 storeId:z.string().uuid(),
 credits:z.number().int().min(1).max(1000000),
 idempotencyKey:z.string().min(16).max(128),
}).strict();

export const safeFilenameSchema=z.string().min(1).max(255).regex(/^[^\\\/:*?"<>|]+$/);
export function validateJson<T>(schema:z.ZodType<T>,value:unknown):T{
 const r=schema.safeParse(value);
 if(!r.success) throw new Error("INVALID_REQUEST_PAYLOAD");
 return r.data;
}
