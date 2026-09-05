import {TeamError} from "@/core/auth/teamService";
import {apiError} from "@/core/security/apiHandler";

export function teamFailure(e: unknown) {
  if (!(e instanceof TeamError)) throw e;
  const messages: Record<string, [number, string]> = {
    USER_NOT_FOUND: [404, "Nobody with that email has a Storovex account yet. Ask them to sign up first."],
    ALREADY_A_MEMBER: [409, "They're already on your team."],
    MEMBER_NOT_FOUND: [404, "That team member doesn't exist."],
    ROLE_INVALID: [422, "Pick either manager or staff."],
    LAST_MANAGER: [409, "This is your only manager. Make someone else a manager first, or nobody will be able to manage the team."],
  };
  const [status, message] = messages[e.code] ?? [400, "We couldn't update your team."];
  return apiError(status, e.code, message, e.detail);
}
