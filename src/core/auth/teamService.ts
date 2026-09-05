import {createServerSupabase, createServiceRoleSupabase} from "@/core/supabase/server";
import {isValidRole, type Role} from "./authorization";

/**
 * Store team membership.
 *
 * The roles are `manager` and `staff` — the only two values
 * store_team_members_role_check permits. A manager holds billing, the team and
 * store deletion; staff run the shop day to day.
 */

export class TeamError extends Error {
  constructor(readonly code: string, readonly detail?: unknown) { super(code); }
}

export async function listTeam(storeId: string) {
  // Service role, because a member needs to see their colleagues' email addresses
  // and `users` is readable only to its own owner under RLS.
  const admin = createServiceRoleSupabase();
  const {data: members, error} = await admin.from("store_team_members")
    .select("id,user_id,role,invited_at").eq("store_id", storeId)
    .order("invited_at", {ascending: true});
  if (error) throw new TeamError("TEAM_LIST_FAILED", error.message);

  const ids = (members ?? []).map(m => m.user_id as string);
  const {data: users} = ids.length
    ? await admin.from("users").select("id,name,email").in("id", ids)
    : {data: []};
  const byId = new Map((users ?? []).map(u => [u.id as string, u]));

  return (members ?? []).map(m => {
    const user = byId.get(m.user_id as string);
    return {
      id: m.id as string,
      userId: m.user_id as string,
      name: (user?.name as string) ?? null,
      email: (user?.email as string) ?? "unknown",
      role: m.role as Role,
      invitedAt: m.invited_at as string,
    };
  });
}

/**
 * Adds someone who already has an account.
 *
 * There is no invitation table in this schema, so a person must have signed up
 * before they can be added. Inventing an invite flow would mean inventing storage
 * for it, and a "sent" invitation that nothing can deliver is worse than saying
 * plainly that the account has to exist.
 */
export async function addMember(input: {storeId: string; email: string; role: Role}) {
  if (!isValidRole(input.role)) throw new TeamError("ROLE_INVALID");

  const admin = createServiceRoleSupabase();
  const email = input.email.trim().toLowerCase();

  const {data: user} = await admin.from("users")
    .select("id").ilike("email", email).maybeSingle();
  if (!user) throw new TeamError("USER_NOT_FOUND");

  const {data: existing} = await admin.from("store_team_members")
    .select("id").eq("store_id", input.storeId).eq("user_id", user.id).maybeSingle();
  if (existing) throw new TeamError("ALREADY_A_MEMBER");

  const {data, error} = await admin.from("store_team_members")
    .insert({store_id: input.storeId, user_id: user.id, role: input.role})
    .select("id,user_id,role,invited_at").single();
  if (error) throw new TeamError("MEMBER_ADD_FAILED", error.message);
  return {id: data.id as string, role: data.role as Role};
}

/**
 * Counts managers, so the last one cannot be removed or demoted.
 *
 * A store with no manager is unrecoverable through the interface: nobody can manage
 * the team, so nobody can promote anyone back.
 */
async function managerCount(storeId: string): Promise<number> {
  const admin = createServiceRoleSupabase();
  const {count} = await admin.from("store_team_members")
    .select("id", {count: "exact", head: true})
    .eq("store_id", storeId).eq("role", "manager");
  return count ?? 0;
}

export async function setMemberRole(input: {storeId: string; memberId: string; role: Role}) {
  if (!isValidRole(input.role)) throw new TeamError("ROLE_INVALID");

  const admin = createServiceRoleSupabase();
  const {data: member} = await admin.from("store_team_members")
    .select("id,role").eq("id", input.memberId).eq("store_id", input.storeId).maybeSingle();
  if (!member) throw new TeamError("MEMBER_NOT_FOUND");
  if (member.role === input.role) return {role: input.role, changed: false};

  if (member.role === "manager" && await managerCount(input.storeId) <= 1) {
    throw new TeamError("LAST_MANAGER");
  }

  const {error} = await admin.from("store_team_members")
    .update({role: input.role}).eq("id", input.memberId).eq("store_id", input.storeId);
  if (error) throw new TeamError("ROLE_UPDATE_FAILED", error.message);
  return {role: input.role, changed: true};
}

export async function removeMember(input: {storeId: string; memberId: string}) {
  const admin = createServiceRoleSupabase();
  const {data: member} = await admin.from("store_team_members")
    .select("id,role").eq("id", input.memberId).eq("store_id", input.storeId).maybeSingle();
  if (!member) throw new TeamError("MEMBER_NOT_FOUND");

  if (member.role === "manager" && await managerCount(input.storeId) <= 1) {
    throw new TeamError("LAST_MANAGER");
  }

  const {error} = await admin.from("store_team_members")
    .delete().eq("id", input.memberId).eq("store_id", input.storeId);
  if (error) throw new TeamError("MEMBER_REMOVE_FAILED", error.message);
  return {removed: true};
}
