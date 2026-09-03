import {renderEmail, hasTemplate} from "@/core/email/templates";
import {TEMPLATE_REQUIRED_VARS, assertTemplateVarsComplete, mustBypassSuppression} from "@/core/email/emailCatalog";
import {shouldSuppress, shouldRetrySend, computeRetryDelayMs} from "@/core/email/emailEvents";
import {actionForEvent, normalizeSubscriptionStatus, hasAccess} from "@/core/billing/paddleWebhook";
import {priceIdFor} from "@/core/billing/paddleClient";
import {PLANS, priceForCycle} from "@/core/billing/plans";
import type {EmailEventType} from "@/core/email/emailCatalog";

const ALL_TYPES = Object.keys(TEMPLATE_REQUIRED_VARS) as EmailEventType[];

/** Minimal valid vars for each event, so every template can be rendered in a loop. */
const SAMPLE: Record<EmailEventType, Record<string, unknown>> = {
  welcome: {userName: "Ada", dashboardUrl: "https://x.test/dashboard"},
  email_verification: {verificationUrl: "https://x.test/v"},
  password_reset: {resetUrl: "https://x.test/r"},
  subscription_activated: {planName: "Pro", billingUrl: "https://x.test/b"},
  subscription_canceled: {planName: "Pro", accessUntil: "1 October 2026", billingUrl: "https://x.test/b"},
  payment_failed: {planName: "Pro", retryUrl: "https://x.test/b"},
  grace_period_started: {planName: "Pro", graceEndsAt: "8 October 2026", billingUrl: "https://x.test/b"},
  low_credit_warning: {creditsRemaining: 12, topUpUrl: "https://x.test/b"},
  credits_exhausted: {topUpUrl: "https://x.test/b"},
  generation_completed: {projectName: "Fall Drop", assetCount: 6, projectUrl: "https://x.test/p"},
  generation_failed: {projectName: "Fall Drop", reason: "The image service was busy.", projectUrl: "https://x.test/p"},
  team_invitation: {inviterName: "Ada", storeName: "Acme", acceptUrl: "https://x.test/a"},
  team_invitation_accepted: {memberEmail: "b@x.test", storeName: "Acme", teamUrl: "https://x.test/t"},
};

describe("every catalogue event has a working template", () => {
  it("covers all 13 declared event types", () => {
    expect(ALL_TYPES).toHaveLength(13);
    for (const type of ALL_TYPES) expect(hasTemplate(type)).toBe(true);
  });

  it.each(ALL_TYPES)("%s renders a subject, html and text", type => {
    const email = renderEmail(type, SAMPLE[type]);
    expect(email.subject.length).toBeGreaterThan(3);
    // The old payload had no html/text at all and set react:undefined, so Resend
    // would have rejected every single send with a 422.
    expect(email.html).toContain("<!doctype html>");
    expect(email.text.length).toBeGreaterThan(20);
  });

  it.each(ALL_TYPES)("%s never leaves an unresolved value in the output", type => {
    const email = renderEmail(type, SAMPLE[type]);
    expect(email.html).not.toContain("undefined");
    expect(email.html).not.toContain("[object Object]");
    expect(email.text).not.toContain("undefined");
  });

  it("uses a real subject line, not the raw event key", () => {
    // The previous service sent subject: input.type, so users received an email
    // titled "password_reset".
    for (const type of ALL_TYPES) {
      expect(renderEmail(type, SAMPLE[type]).subject).not.toBe(type);
    }
  });

  it("escapes user-supplied values so a project name cannot inject markup", () => {
    const email = renderEmail("generation_completed", {
      projectName: '<img src=x onerror="alert(1)">', assetCount: 1, projectUrl: "https://x.test",
    });
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;img");
  });

  it("tells the user their credits were refunded when a generation fails", () => {
    const email = renderEmail("generation_failed", SAMPLE.generation_failed);
    expect(email.html).toContain("refunded");
    expect(email.text).toContain("refunded");
  });

  it("rejects an unknown event type", () => {
    expect(() => renderEmail("not_a_real_event" as EmailEventType, {})).toThrow(/EMAIL_EVENT_TYPE_INVALID/);
  });
});

describe("template variable contract", () => {
  it.each(ALL_TYPES)("%s accepts its declared variables", type => {
    expect(() => assertTemplateVarsComplete(type, SAMPLE[type])).not.toThrow();
  });

  it("rejects a send that is missing a required variable", () => {
    expect(() => assertTemplateVarsComplete("password_reset", {})).toThrow(/EMAIL_TEMPLATE_VARS_MISSING/);
  });

  it("treats an empty string as missing, not as provided", () => {
    expect(() => assertTemplateVarsComplete("welcome", {userName: ""})).toThrow();
  });
});

describe("suppression policy", () => {
  it("suppresses after one complaint or two bounces", () => {
    expect(shouldSuppress(0, 1)).toBe(true);
    expect(shouldSuppress(2, 0)).toBe(true);
    expect(shouldSuppress(1, 0)).toBe(false);
  });

  it("lets account recovery through a suppression, but not marketing-adjacent mail", () => {
    // Locking someone out of password reset because a notification bounced would be
    // worse than the bounce itself.
    expect(mustBypassSuppression("password_reset")).toBe(true);
    expect(mustBypassSuppression("email_verification")).toBe(true);
    expect(mustBypassSuppression("low_credit_warning")).toBe(false);
    expect(mustBypassSuppression("generation_completed")).toBe(false);
  });
});

describe("send retry policy", () => {
  it("retries a failed send up to the limit", () => {
    expect(shouldRetrySend(1, "failed")).toBe(true);
    expect(shouldRetrySend(2, "failed")).toBe(true);
    expect(shouldRetrySend(3, "failed")).toBe(false);
  });

  it("never retries a send that already succeeded", () => {
    expect(shouldRetrySend(1, "sent")).toBe(false);
    expect(shouldRetrySend(1, "delivered")).toBe(false);
  });

  it("backs off between attempts and caps the delay", () => {
    expect(computeRetryDelayMs(1)).toBe(2000);
    expect(computeRetryDelayMs(2)).toBe(4000);
    expect(computeRetryDelayMs(20)).toBe(60000);
  });
});

describe("Paddle event mapping", () => {
  it("maps every supported event to an entitlement action", () => {
    expect(actionForEvent("subscription.activated")).toBe("grant_access");
    expect(actionForEvent("subscription.updated")).toBe("sync_plan");
    expect(actionForEvent("subscription.canceled")).toBe("revoke_access_scheduled");
    expect(actionForEvent("subscription.paused")).toBe("revoke_access_now");
    expect(actionForEvent("transaction.payment_failed")).toBe("apply_grace_period");
  });

  it("rejects an unrecognised subscription status rather than storing it", () => {
    expect(() => normalizeSubscriptionStatus("exploded")).toThrow(/UNRECOGNIZED/);
    expect(normalizeSubscriptionStatus("ACTIVE")).toBe("active");
  });

  it("keeps access during past_due, so a failed card is not an instant lockout", () => {
    expect(hasAccess("active")).toBe(true);
    expect(hasAccess("trialing")).toBe(true);
    expect(hasAccess("past_due")).toBe(true);
    expect(hasAccess("canceled")).toBe(false);
    expect(hasAccess("paused")).toBe(false);
  });
});

describe("Paddle price configuration", () => {
  const saved = {...process.env};
  afterEach(() => { process.env = {...saved}; });

  it("reads price ids from the environment, since they differ per Paddle environment", () => {
    process.env.PADDLE_PRICE_PRO_MONTHLY = "pri_123";
    expect(priceIdFor("pro", "monthly")).toBe("pri_123");
  });

  it("returns undefined for an unconfigured plan rather than guessing an id", () => {
    delete process.env.PADDLE_PRICE_STARTER_ANNUAL;
    expect(priceIdFor("starter", "annual")).toBeUndefined();
  });
});

describe("plan pricing", () => {
  it("applies the annual discount over twelve months", () => {
    const monthly = PLANS.pro.monthlyCents;
    expect(priceForCycle("pro", "monthly")).toBe(monthly);
    expect(priceForCycle("pro", "annual")).toBe(Math.round(monthly * 0.8) * 12);
  });

  it("makes annual cheaper than paying monthly for a year", () => {
    for (const id of ["starter", "mid", "pro"] as const) {
      expect(priceForCycle(id, "annual")).toBeLessThan(priceForCycle(id, "monthly") * 12);
    }
  });
});
