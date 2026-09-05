import {DiscountError} from "@/core/commerce/discountService";
import {apiError} from "@/core/security/apiHandler";

/**
 * Maps a DiscountError to a response. Kept beside the routes rather than inside
 * either one, so importing it never drags a route module in as a side effect.
 */
export function discountFailure(e: unknown) {
  if (!(e instanceof DiscountError)) throw e;
  const messages: Record<string, [number, string]> = {
    DISCOUNT_CODE_TAKEN: [409, "You already have a discount with that code."],
    PERCENT_OUT_OF_RANGE: [422, "A percentage discount must be between 1 and 100."],
    AMOUNT_INVALID: [422, "A fixed discount must be more than zero."],
    DISCOUNT_NOT_FOUND: [404, "That discount doesn't exist."],
    DISCOUNT_ALREADY_USED: [409, "This code has been used on an order, so it can't be deleted. Deactivate it instead."],
    NOTHING_TO_UPDATE: [400, "No changes were supplied."],
  };
  const [status, message] = messages[e.code] ?? [400, "We couldn't save that discount."];
  return apiError(status, e.code, message, e.detail);
}
