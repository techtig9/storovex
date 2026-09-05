/**
 * Marketplace roles, as stored in store_team_members.role.
 *
 * The database constrains this column to exactly "manager" and "staff", so those
 * are the only two roles that can exist. An earlier version of this file invented
 * owner/admin/member; none of them could ever have been stored, which would have
 * made every role check silently false.
 *
 * Staff run the shop day to day. Managers additionally hold the team, billing and
 * store-deletion permissions — the actions nobody but the business owner should be
 * able to take on someone else's business.
 */
export type Role = "manager" | "staff";

export type Permission =
  | "store:read" | "store:write" | "store:delete"
  | "products:read" | "products:write"
  | "orders:read" | "orders:fulfil" | "orders:refund"
  | "discounts:write" | "channels:write"
  | "team:manage"
  | "billing:read" | "billing:write"
  | "ai:use";

const MATRIX: Record<Role, Permission[]> = {
  manager: [
    "store:read", "store:write", "store:delete",
    "products:read", "products:write",
    "orders:read", "orders:fulfil", "orders:refund",
    "discounts:write", "channels:write",
    "team:manage", "billing:read", "billing:write", "ai:use",
  ],
  // Staff deliberately cannot refund, manage the team, or see billing: those move
  // money or change who has access, and a shop assistant needs neither.
  staff: [
    "store:read", "products:read", "products:write",
    "orders:read", "orders:fulfil", "ai:use",
  ],
};

export function can(role: Role, permission: Permission) {
  return MATRIX[role]?.includes(permission) ?? false;
}

export function assertCan(role: Role, permission: Permission) {
  if (!can(role, permission)) throw new Error("FORBIDDEN");
}

export function isValidRole(value: string): value is Role {
  return value === "manager" || value === "staff";
}
