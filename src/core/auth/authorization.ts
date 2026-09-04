/**
 * Marketplace roles, as stored in store_team_members.role.
 *
 * A member can run the shop day to day. An admin can additionally manage the team.
 * Only an owner can touch billing or delete the store, because those are the two
 * actions nobody else should be able to take on someone else's business.
 */
export type Role = "owner" | "admin" | "member";

export type Permission =
  | "store:read" | "store:write" | "store:delete"
  | "products:read" | "products:write"
  | "orders:read" | "orders:fulfil" | "orders:refund"
  | "discounts:write" | "channels:write"
  | "team:manage"
  | "billing:read" | "billing:write"
  | "ai:use";

const MATRIX: Record<Role, Permission[]> = {
  owner: [
    "store:read", "store:write", "store:delete",
    "products:read", "products:write",
    "orders:read", "orders:fulfil", "orders:refund",
    "discounts:write", "channels:write",
    "team:manage", "billing:read", "billing:write", "ai:use",
  ],
  admin: [
    "store:read", "store:write",
    "products:read", "products:write",
    "orders:read", "orders:fulfil", "orders:refund",
    "discounts:write", "channels:write",
    "team:manage", "billing:read", "ai:use",
  ],
  member: [
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
  return value === "owner" || value === "admin" || value === "member";
}
