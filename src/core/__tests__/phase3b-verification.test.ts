import {verifyIntegrations} from "@/core/config/verifyIntegrations";
import type {FetchLike} from "@/core/ai/providers/types";

/**
 * The verifier is the thing that closes the "we have never called this API" risk, so
 * it needs to be right about what it reports. These drive it against responses shaped
 * like each provider's real API — including the two failure modes that offline tests
 * cannot otherwise catch: a model name that does not exist, and a sending domain that
 * is not verified.
 */
const savedEnv = {...process.env};
afterEach(() => { process.env = {...savedEnv}; });

function envWith(vars: Record<string, string>) {
  for (const k of Object.keys(process.env)) {
    if (/SUPABASE|PADDLE|RESEND|GEMINI|CEREBRAS|OPENROUTER|ANTHROPIC/.test(k)) delete process.env[k];
  }
  Object.assign(process.env, vars);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {"Content-Type": "application/json"}});

describe("integration verification", () => {
  it("reports unconfigured integrations as skipped, naming the missing variables", async () => {
    envWith({});
    const results = await verifyIntegrations({fetchImpl: async () => json({})});
    const supabase = results.find(r => r.id === "supabase")!;
    expect(supabase.configured).toBe(false);
    expect(supabase.detail).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("passes Gemini when the key works and the configured model exists", async () => {
    envWith({GEMINI_API_KEY: "k", GEMINI_IMAGE_MODEL: "gemini-2.5-flash-image"});
    const fetchImpl: FetchLike = async () => json({
      models: [{name: "models/gemini-2.5-flash-image"}, {name: "models/gemini-2.5-pro"}],
    });
    const gemini = (await verifyIntegrations({fetchImpl})).find(r => r.id === "gemini")!;
    expect(gemini.ok).toBe(true);
    expect(gemini.detail).toContain("gemini-2.5-flash-image");
  });

  it("fails Gemini when the model name does not exist, and suggests real ones", async () => {
    // Google validates the key before the model name, so an invalid-key probe can
    // never catch a wrong model. This check is the only thing that can.
    envWith({GEMINI_API_KEY: "k", GEMINI_IMAGE_MODEL: "gemini-nonexistent-image"});
    const fetchImpl: FetchLike = async () => json({
      models: [{name: "models/gemini-2.5-flash-image"}, {name: "models/gemini-2.5-pro"}],
    });
    const gemini = (await verifyIntegrations({fetchImpl})).find(r => r.id === "gemini")!;
    expect(gemini.ok).toBe(false);
    expect(gemini.detail).toContain("not in the");
    expect(gemini.remedy).toContain("gemini-2.5-flash-image");
  });

  it("recognises Google's HTTP 400 bad-key response and names the right remedy", async () => {
    envWith({GEMINI_API_KEY: "bad"});
    const fetchImpl: FetchLike = async () => json({
      error: {code: 400, status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key."},
    }, 400);
    const gemini = (await verifyIntegrations({fetchImpl})).find(r => r.id === "gemini")!;
    expect(gemini.ok).toBe(false);
    expect(gemini.remedy).toContain("GEMINI_API_KEY is not valid");
  });

  it("fails Resend when the from-address domain is not verified", async () => {
    // Resend accepts a send from an unverified domain and then silently fails to
    // deliver, which is far harder to diagnose than an outright rejection.
    envWith({
      RESEND_API_KEY: "k", RESEND_WEBHOOK_SECRET: "s",
      RESEND_FROM_EMAIL: "Storovex <hello@notverified.test>",
    });
    const fetchImpl: FetchLike = async () => json({data: [{name: "storovex.com", status: "verified"}]});
    const resend = (await verifyIntegrations({fetchImpl})).find(r => r.id === "resend")!;
    expect(resend.ok).toBe(false);
    expect(resend.detail).toContain("notverified.test");
    expect(resend.remedy).toContain("storovex.com");
  });

  it("passes Resend when the sending domain is verified", async () => {
    envWith({
      RESEND_API_KEY: "k", RESEND_WEBHOOK_SECRET: "s",
      RESEND_FROM_EMAIL: "Storovex <hello@storovex.com>",
    });
    const fetchImpl: FetchLike = async () => json({data: [{name: "storovex.com", status: "verified"}]});
    expect((await verifyIntegrations({fetchImpl})).find(r => r.id === "resend")!.ok).toBe(true);
  });

  it("fails Paddle when a configured price id does not exist in that environment", async () => {
    envWith({
      PADDLE_API_KEY: "k", PADDLE_WEBHOOK_SECRET: "s", PADDLE_ENVIRONMENT: "sandbox",
      PADDLE_PRICE_PRO_MONTHLY: "pri_live_only",
    });
    const fetchImpl: FetchLike = async () => json({data: [{id: "pri_sandbox_1"}]});
    const paddle = (await verifyIntegrations({fetchImpl})).find(r => r.id === "paddle")!;
    expect(paddle.ok).toBe(false);
    expect(paddle.detail).toContain("PADDLE_PRICE_PRO_MONTHLY");
    expect(paddle.remedy).toContain("sandbox");
  });

  it("fails Paddle when the key works but no price ids are configured", async () => {
    envWith({PADDLE_API_KEY: "k", PADDLE_WEBHOOK_SECRET: "s"});
    const fetchImpl: FetchLike = async () => json({data: []});
    const paddle = (await verifyIntegrations({fetchImpl})).find(r => r.id === "paddle")!;
    expect(paddle.ok).toBe(false);
    expect(paddle.remedy).toContain("PADDLE_PRICE_PRO_MONTHLY");
  });

  it("detects a Supabase project whose migrations have not been applied", async () => {
    envWith({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc",
    });
    const fetchImpl: FetchLike = async () => json({message: "relation does not exist"}, 404);
    const supabase = (await verifyIntegrations({fetchImpl})).find(r => r.id === "supabase")!;
    expect(supabase.ok).toBe(false);
    expect(supabase.remedy).toContain("Apply supabase/migrations");
  });

  it("passes Supabase when the schema and seed data are present", async () => {
    envWith({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc",
    });
    const fetchImpl: FetchLike = async () => json([{id: "pro"}]);
    expect((await verifyIntegrations({fetchImpl})).find(r => r.id === "supabase")!.ok).toBe(true);
  });

  it("never puts a credential value in its output", async () => {
    envWith({
      GEMINI_API_KEY: "super-secret-gemini-value",
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "super-secret-service-key",
    });
    const fetchImpl: FetchLike = async () => json({models: []});
    const serialized = JSON.stringify(await verifyIntegrations({fetchImpl}));
    expect(serialized).not.toContain("super-secret-gemini-value");
    expect(serialized).not.toContain("super-secret-service-key");
  });

  it("turns a provider timeout into a clear result rather than throwing", async () => {
    envWith({GEMINI_API_KEY: "k"});
    const fetchImpl: FetchLike = async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; };
    const gemini = (await verifyIntegrations({fetchImpl})).find(r => r.id === "gemini")!;
    expect(gemini.ok).toBe(false);
    expect(gemini.detail).toMatch(/timed out|aborted/i);
  });
});
