import {CollectionError} from "@/core/commerce/collectionService";
import {apiError} from "@/core/security/apiHandler";

export function collectionFailure(e: unknown) {
  if (!(e instanceof CollectionError)) throw e;
  const messages: Record<string, [number, string]> = {
    COLLECTION_EXISTS: [409, "You already have a collection with that name."],
    TITLE_REQUIRED: [422, "Give the collection a name."],
    TITLE_UNUSABLE: [422, "That name needs at least one letter or number."],
    PRODUCT_NOT_FOUND: [404, "That product doesn't exist."],
  };
  const [status, message] = messages[e.code] ?? [400, "We couldn't save that."];
  return apiError(status, e.code, message, e.detail);
}
