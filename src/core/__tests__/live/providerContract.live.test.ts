/**
 * LIVE provider contract tests.
 *
 * These call the real provider endpoints over the network. They are skipped unless
 * STOROVEX_LIVE_TESTS=1, so a normal `npm test` never depends on the internet or on
 * a provider being up.
 *
 * Why they exist: every other provider test drives an injected fetch against a
 * response shaped like the documented API. That proves our parsing is correct *given*
 * the documented shape — it cannot catch a wrong URL, a wrong header name, or a
 * documented shape that no longer matches reality. These close that gap.
 *
 * They deliberately use an INVALID key. A rejected request still proves the endpoint
 * exists, the method and headers are accepted well enough to be authenticated, and
 * that our classification of a real error response is right. No credentials needed,
 * nothing is charged.
 *
 *   STOROVEX_LIVE_TESTS=1 npx jest providerContract.live
 */
import {generateImages, geminiImageModel} from "@/core/ai/providers/gemini";
import {anthropicChat, cerebrasChat, openRouterChat} from "@/core/ai/providers/chat";
import {ProviderError} from "@/core/ai/providers/types";

const LIVE = process.env.STOROVEX_LIVE_TESTS === "1";
const d = LIVE ? describe : describe.skip;

const savedEnv = {...process.env};
beforeEach(() => {
  process.env = {
    ...savedEnv,
    GEMINI_API_KEY: "invalid-key-for-contract-probe",
    ANTHROPIC_API_KEY: "invalid-key-for-contract-probe",
    CEREBRAS_API_KEY: "invalid-key-for-contract-probe",
    OPENROUTER_API_KEY: "invalid-key-for-contract-probe",
  };
});
afterEach(() => { process.env = {...savedEnv}; });

async function capture(fn: () => Promise<unknown>): Promise<ProviderError> {
  try {
    await fn();
    throw new Error("A deliberately invalid key must never succeed");
  } catch (e) {
    if (!(e instanceof ProviderError)) throw e;
    return e;
  }
}

d("live provider contracts (invalid key, no charge)", () => {
  jest.setTimeout(60_000);

  it("Gemini: the endpoint exists and rejects a bad key as an auth failure", async () => {
    const err = await capture(() => generateImages({prompt: "contract probe", count: 1}, {timeoutMs: 30_000}));
    // A 404 here would mean our URL or model path is wrong — the failure mode a
    // fixture-based test can never catch.
    expect(err.status).not.toBe(404);
    expect(err.status).toBeGreaterThanOrEqual(400);
    // Google answers 400 for a bad key, so this asserts the body-aware
    // classification rather than the status alone.
    expect(err.errorClass).toBe("auth");
    console.log(`  gemini(${geminiImageModel()}) → ${err.status} ${err.errorClass}`);
  });

  it("Anthropic: the endpoint exists and rejects a bad key as an auth failure", async () => {
    const err = await capture(() => anthropicChat({prompt: "contract probe", maxTokens: 16}, {timeoutMs: 30_000}));
    expect(err.status).not.toBe(404);
    expect(err.errorClass).toBe("auth");
    console.log(`  anthropic → ${err.status} ${err.errorClass}`);
  });

  // These two are unreachable from some sandboxed environments. A network-level
  // block classifies as provider_outage, which is a legitimate result here: it means
  // the adapter behaved correctly, not that the contract is wrong.
  it("Cerebras: reachable, or cleanly classified as an outage", async () => {
    const err = await capture(() => cerebrasChat({prompt: "probe", maxTokens: 8}, {timeoutMs: 20_000}));
    expect(["auth", "validation", "provider_outage", "timeout"]).toContain(err.errorClass);
    console.log(`  cerebras → ${err.status ?? "no-response"} ${err.errorClass}`);
  });

  it("OpenRouter: reachable, or cleanly classified as an outage", async () => {
    const err = await capture(() => openRouterChat({prompt: "probe", maxTokens: 8}, {timeoutMs: 20_000}));
    expect(["auth", "validation", "provider_outage", "timeout"]).toContain(err.errorClass);
    console.log(`  openrouter → ${err.status ?? "no-response"} ${err.errorClass}`);
  });
});
