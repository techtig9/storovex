
import {assertValidStatus,canTransitionStatus,assertValidSort,duplicateName,sanitizeSearchQuery} from "../projects/projectRules";
import {activationRate,generationSuccessRate,creditsRemainingPct,summarizeKpis} from "../projects/dashboardMetrics";
import {assertCanInvite,assertInviteableRole,isInviteExpired,generateInviteToken,INVITE_EXPIRY_MS} from "../team/invitations";
import {assertCanChangeRole,assertCanRemoveMember} from "../team/roleRules";

describe("Phase 83 project rules",()=>{
 it("validates project status values",()=>{
  expect(()=>assertValidStatus("active")).not.toThrow();
  expect(()=>assertValidStatus("deleted")).toThrow("PROJECT_STATUS_INVALID");
 });
 it("allows draft<->active and either->archived, but archived only restores to active",()=>{
  expect(canTransitionStatus("draft","active")).toBe(true);
  expect(canTransitionStatus("active","draft")).toBe(true);
  expect(canTransitionStatus("active","archived")).toBe(true);
  expect(canTransitionStatus("archived","active")).toBe(true);
  expect(canTransitionStatus("archived","draft")).toBe(false);
  expect(canTransitionStatus("draft","draft")).toBe(false);
 });
 it("validates sort field and direction",()=>{
  expect(()=>assertValidSort("updated_at","desc")).not.toThrow();
  expect(()=>assertValidSort("owner","desc")).toThrow("SORT_FIELD_INVALID");
  expect(()=>assertValidSort("name","sideways")).toThrow("SORT_DIRECTION_INVALID");
 });
 it("generates a non-colliding duplicate name",()=>{
  expect(duplicateName("Summer Launch",[])).toBe("Summer Launch (copy)");
  expect(duplicateName("Summer Launch",["Summer Launch (copy)"])).toBe("Summer Launch (copy 2)");
  expect(duplicateName("Summer Launch",["Summer Launch (copy)","Summer Launch (copy 2)"])).toBe("Summer Launch (copy 3)");
 });
 it("sanitizes search queries",()=>{
  expect(sanitizeSearchQuery("  hero banner  ")).toBe("hero banner");
  expect(sanitizeSearchQuery("   ")).toBeUndefined();
 });
});

describe("Phase 83 dashboard metrics",()=>{
 it("computes activation rate as a percentage",()=>{
  expect(activationRate(25,100)).toBe(25);
  expect(activationRate(0,0)).toBe(0);
 });
 it("computes generation success rate, defaulting to 100 with no attempts",()=>{
  expect(generationSuccessRate(9,10)).toBe(90);
  expect(generationSuccessRate(0,0)).toBe(100);
 });
 it("caps credits-remaining percentage at 100",()=>{
  expect(creditsRemainingPct(400,400)).toBe(100);
  expect(creditsRemainingPct(600,400)).toBe(100);
  expect(creditsRemainingPct(100,400)).toBe(25);
 });
 it("rejects invalid metric inputs",()=>{
  expect(()=>activationRate(10,5)).toThrow("METRIC_INPUT_INVALID");
  expect(()=>creditsRemainingPct(-1,400)).toThrow("METRIC_INPUT_INVALID");
 });
 it("summarizes all KPIs together",()=>{
  const kpis=summarizeKpis({activated:5,totalUsers:10,generationsSucceeded:8,generationsTotal:10,creditBalance:200,includedCredits:400});
  expect(kpis).toEqual({activationRatePct:50,generationSuccessRatePct:80,creditsRemainingPct:50});
 });
});

describe("Phase 83 team invitations",()=>{
 it("only owner/admin can invite",()=>{
  expect(()=>assertCanInvite("member")).toThrow("FORBIDDEN");
  expect(()=>assertCanInvite("admin")).not.toThrow();
 });
 it("no one can invite as owner; admins cannot invite admins",()=>{
  expect(()=>assertInviteableRole("owner","owner")).toThrow("CANNOT_INVITE_AS_OWNER");
  expect(()=>assertInviteableRole("admin","admin")).toThrow("ADMIN_CANNOT_INVITE_ADMIN");
  expect(()=>assertInviteableRole("owner","admin")).not.toThrow();
  expect(()=>assertInviteableRole("admin","member")).not.toThrow();
 });
 it("expires invitations after the configured window",()=>{
  const created=1000;
  expect(isInviteExpired(created,created+INVITE_EXPIRY_MS-1)).toBe(false);
  expect(isInviteExpired(created,created+INVITE_EXPIRY_MS+1)).toBe(true);
 });
 it("generates a sufficiently long random token",()=>{
  const t1=generateInviteToken();
  const t2=generateInviteToken();
  expect(t1).toHaveLength(64);
  expect(t1).not.toBe(t2);
 });
});

describe("Phase 83 role rules",()=>{
 it("blocks members from changing roles",()=>{
  expect(()=>assertCanChangeRole("member","member","admin")).toThrow("FORBIDDEN");
 });
 it("blocks promoting to owner outside a dedicated transfer flow",()=>{
  expect(()=>assertCanChangeRole("owner","admin","owner")).toThrow("OWNERSHIP_TRANSFER_REQUIRES_DEDICATED_FLOW");
 });
 it("blocks admins from modifying owners or other admins",()=>{
  expect(()=>assertCanChangeRole("admin","owner","member")).toThrow("ADMIN_CANNOT_MODIFY_PEER_OR_OWNER");
  expect(()=>assertCanChangeRole("admin","admin","member")).toThrow("ADMIN_CANNOT_MODIFY_PEER_OR_OWNER");
  expect(()=>assertCanChangeRole("admin","member","admin")).not.toThrow();
 });
 it("blocks removing the last owner",()=>{
  expect(()=>assertCanRemoveMember("owner","owner",1)).toThrow("CANNOT_REMOVE_LAST_OWNER");
  expect(()=>assertCanRemoveMember("owner","owner",2)).not.toThrow();
 });
 it("blocks admins from removing owners",()=>{
  expect(()=>assertCanRemoveMember("admin","owner",2)).toThrow("ADMIN_CANNOT_REMOVE_OWNER");
 });
});
