import {assertCan, type Permission} from "./authorization";
import {requireStoreMembership} from "./session";

/** Verifies membership and permission in one call, for use at the top of a route. */
export async function authorizeStoreAction(storeId: string, permission: Permission) {
  const membership = await requireStoreMembership(storeId);
  assertCan(membership.role, permission);
  return membership;
}
