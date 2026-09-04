import {createServerSupabase} from "@/core/supabase/server";
import {toMinorUnits, toDecimalString, type Money} from "./money";

/**
 * Discount codes.
 *
 * Reads and writes through the caller's own client, so RLS scopes them to the
 * merchant's store. There is deliberately no public read policy on this table — a
 * readable discounts table lets anyone enumerate every code in the marketplace — so
 * codes are only ever validated server-side during checkout.
 */

export type DiscountType = "percent" | "fixed";

export class DiscountError extends Error {
  constructor(readonly code: string, readonly detail?: unknown) { super(code); }
}

export type DiscountRow = {
  id: string; code: string; type: DiscountType;
  /** Percent: whole percent (10 = 10%). Fixed: minor units. */
  value: number;
  minSubtotal: Money | null;
  usageLimit: number | null;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
};

function toRow(d: Record<string, unknown>): DiscountRow {
  const type = d.type as DiscountType;
  return {
    id: d.id as string,
    code: d.code as string,
    type,
    // A percent is a plain number; a fixed amount is money and must be minor units,
    // so the same column means two different things depending on the type.
    value: type === "percent" ? Number(d.value) : toMinorUnits(d.value as string),
    minSubtotal: d.min_subtotal === null ? null : toMinorUnits(d.min_subtotal as string),
    usageLimit: (d.usage_limit as number | null) ?? null,
    usedCount: (d.used_count as number) ?? 0,
    active: d.active as boolean,
    expiresAt: (d.expires_at as string | null) ?? null,
  };
}

const SELECT = "id,code,type,value,min_subtotal,usage_limit,used_count,active,expires_at";

export async function listDiscounts(storeId: string) {
  const supabase = createServerSupabase();
  const {data, error} = await supabase.from("discounts")
    .select(SELECT).eq("store_id", storeId).order("code", {ascending: true});
  if (error) throw new DiscountError("DISCOUNT_LIST_FAILED", error.message);
  return (data ?? []).map(toRow);
}

export async function createDiscount(input: {
  storeId: string; code: string; type: DiscountType; value: number;
  minSubtotal?: Money | null; usageLimit?: number | null;
  active?: boolean; expiresAt?: string | null;
}) {
  if (input.type === "percent" && (input.value <= 0 || input.value > 100)) {
    throw new DiscountError("PERCENT_OUT_OF_RANGE");
  }
  if (input.type === "fixed" && input.value <= 0) throw new DiscountError("AMOUNT_INVALID");

  const supabase = createServerSupabase();
  // Codes are matched case-insensitively at checkout, so they are stored uppercase
  // and a duplicate is refused rather than creating a second code that can never win.
  const code = input.code.trim().toUpperCase();
  const existing = await supabase.from("discounts")
    .select("id").eq("store_id", input.storeId).ilike("code", code).maybeSingle();
  if (existing.data) throw new DiscountError("DISCOUNT_CODE_TAKEN");

  const {data, error} = await supabase.from("discounts").insert({
    store_id: input.storeId, code, type: input.type,
    value: input.type === "percent" ? String(input.value) : toDecimalString(input.value),
    min_subtotal: input.minSubtotal == null ? null : toDecimalString(input.minSubtotal),
    usage_limit: input.usageLimit ?? null,
    used_count: 0,
    active: input.active ?? true,
    expires_at: input.expiresAt ?? null,
  }).select(SELECT).single();
  if (error) throw new DiscountError("DISCOUNT_CREATE_FAILED", error.message);
  return toRow(data);
}

export async function updateDiscount(input: {
  storeId: string; discountId: string;
  active?: boolean; usageLimit?: number | null; expiresAt?: string | null;
}) {
  const patch: Record<string, unknown> = {};
  if (input.active !== undefined) patch.active = input.active;
  if (input.usageLimit !== undefined) patch.usage_limit = input.usageLimit;
  if (input.expiresAt !== undefined) patch.expires_at = input.expiresAt;
  if (Object.keys(patch).length === 0) throw new DiscountError("NOTHING_TO_UPDATE");

  // The code, type and value are deliberately not editable. Changing what a code is
  // worth after shoppers have used it makes the order history unexplainable; a
  // merchant who wants different terms deactivates this one and makes another.
  const supabase = createServerSupabase();
  const {data, error} = await supabase.from("discounts").update(patch)
    .eq("id", input.discountId).eq("store_id", input.storeId).select(SELECT).maybeSingle();
  if (error) throw new DiscountError("DISCOUNT_UPDATE_FAILED", error.message);
  if (!data) throw new DiscountError("DISCOUNT_NOT_FOUND");
  return toRow(data);
}

export async function deleteDiscount(storeId: string, discountId: string) {
  const supabase = createServerSupabase();
  const {data: existing} = await supabase.from("discounts")
    .select("id,used_count").eq("id", discountId).eq("store_id", storeId).maybeSingle();
  if (!existing) throw new DiscountError("DISCOUNT_NOT_FOUND");
  // A code that has been redeemed is part of the record of why an order cost what it
  // did. Deactivating stops it being used again without erasing that.
  if (((existing.used_count as number) ?? 0) > 0) throw new DiscountError("DISCOUNT_ALREADY_USED");

  const {error} = await supabase.from("discounts")
    .delete().eq("id", discountId).eq("store_id", storeId);
  if (error) throw new DiscountError("DISCOUNT_DELETE_FAILED", error.message);
  return {deleted: true};
}
