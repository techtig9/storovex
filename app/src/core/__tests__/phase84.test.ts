
import {assertTemplateVarsComplete,mustBypassSuppression,TEMPLATE_REQUIRED_VARS} from "../email/emailCatalog";
import {isTerminalStatus,shouldSuppress,shouldRetrySend,computeRetryDelayMs,MAX_EMAIL_RETRIES} from "../email/emailEvents";
import {mrrFromMonthlyAmounts,arrFromMrr,churnRate,aiCostPerCustomerCents,marginPct,timeToFirstValueMs} from "../analytics/metrics";
import {isFeatureEnabled,assertPlanOverrideReasonProvided,isDeadLetterQueueUnhealthy} from "../admin/adminRules";

describe("Phase 84 email catalog",()=>{
 it("covers every event type with at least one required variable",()=>{
  for(const type of Object.keys(TEMPLATE_REQUIRED_VARS)){
   expect(TEMPLATE_REQUIRED_VARS[type as keyof typeof TEMPLATE_REQUIRED_VARS].length).toBeGreaterThan(0);
  }
 });
 it("validates required template variables are present",()=>{
  expect(()=>assertTemplateVarsComplete("welcome",{userName:"Ada"})).not.toThrow();
  expect(()=>assertTemplateVarsComplete("welcome",{})).toThrow("EMAIL_TEMPLATE_VARS_MISSING: userName");
  expect(()=>assertTemplateVarsComplete("bogus" as any,{})).toThrow("EMAIL_EVENT_TYPE_INVALID");
 });
 it("only password reset and verification bypass suppression",()=>{
  expect(mustBypassSuppression("password_reset")).toBe(true);
  expect(mustBypassSuppression("email_verification")).toBe(true);
  expect(mustBypassSuppression("welcome")).toBe(false);
 });
});

describe("Phase 84 email events",()=>{
 it("identifies terminal delivery statuses",()=>{
  expect(isTerminalStatus("delivered")).toBe(true);
  expect(isTerminalStatus("queued")).toBe(false);
 });
 it("suppresses on any complaint or repeated bounces",()=>{
  expect(shouldSuppress(0,1)).toBe(true);
  expect(shouldSuppress(2,0)).toBe(true);
  expect(shouldSuppress(1,0)).toBe(false);
 });
 it("only retries failed sends up to the max attempts",()=>{
  expect(shouldRetrySend(1,"failed")).toBe(true);
  expect(shouldRetrySend(MAX_EMAIL_RETRIES,"failed")).toBe(false);
  expect(shouldRetrySend(1,"delivered")).toBe(false);
 });
 it("computes bounded exponential retry delay",()=>{
  expect(computeRetryDelayMs(1)).toBe(2000);
  expect(computeRetryDelayMs(10)).toBe(60000);
 });
});

describe("Phase 84 analytics metrics",()=>{
 it("sums MRR from normalized monthly amounts and derives ARR",()=>{
  const mrr=mrrFromMonthlyAmounts([1700,3400,6900]);
  expect(mrr).toBe(12000);
  expect(arrFromMrr(mrr)).toBe(144000);
 });
 it("computes churn rate as a percentage",()=>{
  expect(churnRate(5,100)).toBe(5);
  expect(churnRate(0,0)).toBe(0);
  expect(()=>churnRate(10,5)).toThrow("CHURN_INPUT_INVALID");
 });
 it("computes AI cost per customer",()=>{
  expect(aiCostPerCustomerCents(10000,50)).toBe(200);
  expect(()=>aiCostPerCustomerCents(10000,0)).toThrow("AI_COST_INPUT_INVALID");
 });
 it("computes margin percentage",()=>{
  expect(marginPct(10000,4000)).toBe(60);
  expect(()=>marginPct(0,100)).toThrow("MARGIN_INPUT_INVALID");
 });
 it("computes time to first value",()=>{
  expect(timeToFirstValueMs(1000,5000)).toBe(4000);
  expect(()=>timeToFirstValueMs(5000,1000)).toThrow("TTFV_INPUT_INVALID");
 });
});

describe("Phase 84 admin rules",()=>{
 it("evaluates feature flags against a stable bucket value",()=>{
  expect(isFeatureEnabled({enabled:false},10)).toBe(false);
  expect(isFeatureEnabled({enabled:true},10)).toBe(true);
  expect(isFeatureEnabled({enabled:true,rolloutPct:50},10)).toBe(true);
  expect(isFeatureEnabled({enabled:true,rolloutPct:50},80)).toBe(false);
 });
 it("rejects out-of-range bucket or rollout values",()=>{
  expect(()=>isFeatureEnabled({enabled:true},150)).toThrow("BUCKET_VALUE_INVALID");
  expect(()=>isFeatureEnabled({enabled:true,rolloutPct:150},10)).toThrow("ROLLOUT_PCT_INVALID");
 });
 it("requires a substantive reason for plan overrides",()=>{
  expect(()=>assertPlanOverrideReasonProvided("")).toThrow("PLAN_OVERRIDE_REASON_REQUIRED");
  expect(()=>assertPlanOverrideReasonProvided("Manually verified refund request from support")).not.toThrow();
  expect(()=>assertPlanOverrideReasonProvided("short")).toThrow("PLAN_OVERRIDE_REASON_REQUIRED");
 });
 it("flags an unhealthy dead-letter rate above the threshold",()=>{
  expect(isDeadLetterQueueUnhealthy(2,100)).toBe(false);
  expect(isDeadLetterQueueUnhealthy(10,100)).toBe(true);
  expect(isDeadLetterQueueUnhealthy(0,0)).toBe(false);
  expect(()=>isDeadLetterQueueUnhealthy(1,0)).toThrow("DEAD_LETTER_INPUT_INVALID");
 });
});
