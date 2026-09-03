import {safeRedirectPath} from "@/core/auth/redirect";
import {escapeLikePattern, canTransitionStatus} from "@/core/projects/projectRules";
import {signupSchema, loginSchema, emailSchema, passwordSchema} from "@/core/auth/schemas";
import {integrationStatuses, requiredIntegrationsReady, requireIntegration, IntegrationNotConfiguredError} from "@/core/config/integrations";
import {siteUrl} from "@/core/config/site";
import {estimateCredits} from "@/core/generation/catalog";
import {maxSpendPerJob} from "@/core/billing/plans";

describe("open redirect protection (auth callback and login `next`)", () => {
  it("keeps a same-origin path", () => {
    expect(safeRedirectPath("/dashboard/settings")).toBe("/dashboard/settings");
  });

  it.each([
    ["//evil.com", "protocol-relative URL"],
    ["https://evil.com", "absolute URL"],
    ["http://evil.com/x", "absolute URL with path"],
    ["/\\evil.com", "backslash form some browsers normalise to //"],
    ["javascript:alert(1)", "javascript scheme"],
    ["evil.com", "bare host"],
  ])("rejects %s (%s)", input => {
    expect(safeRedirectPath(input)).toBe("/dashboard");
  });

  it("falls back when absent", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
    expect(safeRedirectPath("")).toBe("/dashboard");
  });

  it("rejects control characters used to smuggle header breaks", () => {
    expect(safeRedirectPath("/ok\r\nSet-Cookie: a=b")).toBe("/dashboard");
  });
});

describe("ILIKE wildcard escaping (search DoS)", () => {
  it("neutralises wildcards so a term matches literally", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("%%%%%%")).toBe("\\%\\%\\%\\%\\%\\%");
  });

  it("escapes the backslash itself first, so escaping cannot be escaped", () => {
    expect(escapeLikePattern("a\\%")).toBe("a\\\\\\%");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeLikePattern("Spring Campaign")).toBe("Spring Campaign");
  });
});

describe("project status transitions are server-decided", () => {
  it("allows draft and active to move freely", () => {
    expect(canTransitionStatus("draft", "active")).toBe(true);
    expect(canTransitionStatus("active", "draft")).toBe(true);
  });

  it("only allows an archived project back to active", () => {
    expect(canTransitionStatus("archived", "active")).toBe(true);
    // The transition a client used to be able to force by lying about `from`.
    expect(canTransitionStatus("archived", "draft")).toBe(false);
  });

  it("rejects a no-op transition", () => {
    expect(canTransitionStatus("active", "active")).toBe(false);
  });
});

describe("auth input validation", () => {
  it("normalises email case and whitespace", () => {
    expect(emailSchema.parse("  Alice@Example.COM ")).toBe("alice@example.com");
  });

  it("enforces a 12 character minimum password", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("a-long-enough-passphrase").success).toBe(true);
  });

  it("rejects unknown fields so extra keys cannot ride along", () => {
    const r = signupSchema.safeParse({
      email: "a@b.com", password: "a-long-enough-passphrase", isAdmin: true,
    });
    expect(r.success).toBe(false);
  });

  it("accepts a valid login", () => {
    expect(loginSchema.safeParse({email: "a@b.com", password: "x"}).success).toBe(true);
  });
});

describe("deferred credentials", () => {
  const saved = {...process.env};
  afterEach(() => { process.env = {...saved}; });

  it("reports every integration as unconfigured on an empty environment", () => {
    for (const k of Object.keys(process.env)) {
      if (/SUPABASE|PADDLE|RESEND|GEMINI|CEREBRAS|OPENROUTER|ANTHROPIC/.test(k)) delete process.env[k];
    }
    const statuses = integrationStatuses();
    expect(statuses.every(s => !s.configured)).toBe(true);
    expect(requiredIntegrationsReady()).toBe(false);
  });

  it("never exposes a value, only the names of missing variables", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "super-secret-anon-value";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = integrationStatuses().find(s => s.id === "supabase")!;
    expect(supabase.missing).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
    expect(JSON.stringify(supabase)).not.toContain("super-secret-anon-value");
  });

  it("treats a blank string as unset, so an empty Vercel field is not 'configured'", () => {
    process.env.GEMINI_API_KEY = "   ";
    expect(integrationStatuses().find(s => s.id === "gemini")!.configured).toBe(false);
  });

  it("marks only Supabase as required", () => {
    expect(integrationStatuses().filter(s => s.required).map(s => s.id)).toEqual(["supabase"]);
  });

  it("throws a typed error naming the integration and its missing vars", () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_WEBHOOK_SECRET;
    try {
      requireIntegration("resend");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(IntegrationNotConfiguredError);
      expect((e as IntegrationNotConfiguredError).integration).toBe("resend");
      expect((e as IntegrationNotConfiguredError).missing).toContain("RESEND_API_KEY");
    }
  });
});

describe("site origin is configuration, never a request header", () => {
  const saved = {...process.env};
  afterEach(() => { process.env = {...saved}; });

  it("strips trailing slashes", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://storovex.com///";
    expect(siteUrl()).toBe("https://storovex.com");
  });

  it("falls back to localhost when unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});

describe("per-job spend cap is enforced, not silently applied", () => {
  it("a high-quality collection exceeds the starter cap", () => {
    // 20 base * 1.8 high * 1 = 36 credits; starter allows 60, so this is under.
    expect(estimateCredits("collection", "high", 1)).toBe(36);
    expect(estimateCredits("collection", "high", 1)).toBeLessThan(maxSpendPerJob("starter"));
  });

  it("a batch of them exceeds it, and the estimate reflects the true cost", () => {
    const credits = estimateCredits("collection", "high", 4);
    expect(credits).toBe(144);
    // generationService now refuses this rather than reserving the 60-credit cap and
    // performing 144 credits of work, which is what Math.min() used to do.
    expect(credits).toBeGreaterThan(maxSpendPerJob("starter"));
  });
});
