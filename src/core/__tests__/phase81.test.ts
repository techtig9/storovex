
import {reserveCredits,commitReservation,refundReservation,InsufficientCreditsError,computeBalance} from "../billing/creditLedger";
import {PLANS,priceForCycle,includedCredits,maxSpendPerJob} from "../billing/plans";
import {actionForEvent,normalizeSubscriptionStatus,hasAccess,assertNotProcessed} from "../billing/paddleWebhook";
import {classifyProviderError,isRetryable,computeBackoffMs,nextCircuitState,canCall,type Circuit} from "../ai/providerAdapter";
import {routeConversation,routeGeneration,classifyComplexity,routeDifficultTask} from "../ai/router";

describe("Phase 81 credit ledger",()=>{
 it("reserves credits within balance and job spend limit",()=>{
  expect(reserveCredits(100,40,maxSpendPerJob("starter"))).toBe(60);
 });
 it("rejects reservations exceeding balance",()=>{
  expect(()=>reserveCredits(10,40,maxSpendPerJob("starter"))).toThrow(InsufficientCreditsError);
 });
 it("rejects reservations exceeding per-job spend limit",()=>{
  expect(()=>reserveCredits(1000,1000,maxSpendPerJob("starter"))).toThrow("LEDGER_JOB_SPEND_LIMIT_EXCEEDED");
 });
 it("commits partial usage and refunds the remainder",()=>{
  expect(commitReservation(50,30)).toEqual({committed:30,refunded:20});
 });
 it("rejects committing more than was reserved",()=>{
  expect(()=>commitReservation(50,60)).toThrow("LEDGER_COMMIT_EXCEEDS_RESERVATION");
 });
 it("refunds a full reservation on failure",()=>{
  expect(refundReservation(25)).toBe(25);
 });
 it("computes balance from a signed ledger",()=>{
  const bal=computeBalance([{type:"grant",amount:100},{type:"reservation",amount:30},{type:"commit",amount:30}]);
  expect(bal).toBe(40);
 });
});

describe("Phase 81 plans",()=>{
 it("exposes the three configured plans",()=>{
  expect(Object.keys(PLANS).sort()).toEqual(["mid","pro","starter"]);
 });
 it("discounts annual pricing by the configured percentage",()=>{
  expect(priceForCycle("starter","monthly")).toBe(1700);
  expect(priceForCycle("starter","annual")).toBeLessThan(1700*12);
 });
 it("returns included credits per plan",()=>{
  expect(includedCredits("pro")).toBe(3000);
 });
});

describe("Phase 81 Paddle webhook",()=>{
 it("maps subscription lifecycle events to entitlement actions",()=>{
  expect(actionForEvent("subscription.activated")).toBe("grant_access");
  expect(actionForEvent("subscription.canceled")).toBe("revoke_access_scheduled");
  expect(actionForEvent("transaction.payment_failed")).toBe("apply_grace_period");
 });
 it("normalizes and validates subscription status", ()=>{
  expect(normalizeSubscriptionStatus("ACTIVE")).toBe("active");
  expect(()=>normalizeSubscriptionStatus("bogus")).toThrow("PADDLE_STATUS_UNRECOGNIZED");
 });
 it("grants access for active, trialing and past_due, not for paused/canceled",()=>{
  expect(hasAccess("active")).toBe(true);
  expect(hasAccess("trialing")).toBe(true);
  expect(hasAccess("past_due")).toBe(true);
  expect(hasAccess("paused")).toBe(false);
  expect(hasAccess("canceled")).toBe(false);
 });
 it("rejects already-processed webhook events (idempotency)",()=>{
  const seen=new Set(["evt_1"]);
  expect(()=>assertNotProcessed(seen,"evt_1")).toThrow("PADDLE_EVENT_ALREADY_PROCESSED");
  expect(()=>assertNotProcessed(seen,"evt_2")).not.toThrow();
 });
});

describe("Phase 81 AI provider adapter",()=>{
 it("classifies provider errors",()=>{
  expect(classifyProviderError(429)).toBe("rate_limit");
  expect(classifyProviderError(401)).toBe("auth");
  expect(classifyProviderError(503)).toBe("provider_outage");
  expect(classifyProviderError(422)).toBe("validation");
 });
 it("only retries recoverable classes",()=>{
  expect(isRetryable("rate_limit")).toBe(true);
  expect(isRetryable("auth")).toBe(false);
 });
 it("computes bounded exponential backoff",()=>{
  expect(computeBackoffMs(1,250,8000)).toBe(250);
  expect(computeBackoffMs(6,250,8000)).toBe(8000);
 });
 it("opens the circuit after repeated failures and half-opens after cooldown",()=>{
  let c:Circuit={state:"closed",failures:0};
  for(let i=0;i<5;i++)c=nextCircuitState(c,"failure",1000,{failureThreshold:5,cooldownMs:1000});
  expect(c.state).toBe("open");
  expect(canCall(c)).toBe(false);
  const half=nextCircuitState(c,"failure",2500,{failureThreshold:5,cooldownMs:1000});
  expect(half.state).toBe("half_open");
 });
});

describe("Phase 81 AI routing",()=>{
 it("uses Cerebras by default and falls back to OpenRouter only on recoverable errors",()=>{
  expect(routeConversation(false)).toBe("cerebras");
  expect(routeConversation(true,"rate_limit")).toBe("openrouter");
  expect(()=>routeConversation(true,"auth")).toThrow("CEREBRAS_UNRECOVERABLE_NO_FALLBACK");
 });
 it("always routes generation to gemini",()=>{
  expect(routeGeneration()).toBe("gemini");
 });
 it("classifies task complexity",()=>{
  expect(classifyComplexity({estimatedTokens:100,requiresLongContext:false,requiresPlanning:false})).toBe("normal");
  expect(classifyComplexity({estimatedTokens:100,requiresLongContext:true,requiresPlanning:false})).toBe("complex");
 });
 it("routes difficult tasks to Claude only when configured, else falls back",()=>{
  expect(routeDifficultTask("complex",true,"cerebras")).toBe("claude");
  expect(routeDifficultTask("complex",false,"cerebras")).toBe("cerebras");
  expect(routeDifficultTask("normal",true,"cerebras")).toBe("cerebras");
 });
});
