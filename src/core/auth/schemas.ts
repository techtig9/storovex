import {z} from "zod";

// Kept deliberately permissive on shape and strict on length. Supabase enforces its
// own password policy server-side; this is the first, cheap line of defence.
export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters");

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
}).strict();

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
}).strict();

export const resetRequestSchema = z.object({email: emailSchema}).strict();
