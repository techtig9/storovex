import {generateImages} from "@/core/ai/providers/gemini";
import {cerebrasChat, anthropicChat} from "@/core/ai/providers/chat";
import {providerFetch} from "@/core/ai/providers/http";
import {ProviderError, type FetchLike} from "@/core/ai/providers/types";
import {callWithResilience, resetCircuits, circuitFor} from "@/core/ai/resilientCall";
import {buildImagePrompt} from "@/core/ai/imageGeneration";

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {status, headers: {"Content-Type": "application/json"}});
}

const savedEnv = {...process.env};
beforeEach(() => {
  process.env = {
    ...savedEnv,
    GEMINI_API_KEY: "test-gemini-key",
    CEREBRAS_API_KEY: "test-cerebras-key",
    ANTHROPIC_API_KEY: "test-anthropic-key",
  };
  resetCircuits();
});
afterEach(() => { process.env = {...savedEnv}; });

describe("Gemini image adapter", () => {
  it("decodes inline image data and reports usage", async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({
      candidates: [{content: {parts: [{inlineData: {mimeType: "image/png", data: PNG_B64}}]}}],
      usageMetadata: {promptTokenCount: 120, candidatesTokenCount: 8},
    });

    const result = await generateImages({prompt: "a shoe", count: 1}, {fetchImpl});
    expect(result.provider).toBe("gemini");
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.mimeType).toBe("image/png");
    expect(Array.from(result.images[0]!.data)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(result.inputTokens).toBe(120);
  });

  it("sends the API key as a header, never in the URL", async () => {
    let seenUrl = ""; let seenHeaders: Record<string, string> = {};
    const fetchImpl: FetchLike = async (url, init) => {
      seenUrl = url;
      seenHeaders = (init?.headers ?? {}) as Record<string, string>;
      return jsonResponse({candidates: [{content: {parts: [{inlineData: {mimeType: "image/png", data: PNG_B64}}]}}]});
    };
    await generateImages({prompt: "x", count: 1}, {fetchImpl});
    // Query strings land in access logs and proxy caches.
    expect(seenUrl).not.toContain("test-gemini-key");
    expect(seenHeaders["x-goog-api-key"]).toBe("test-gemini-key");
  });

  it("attaches a reference image as an inline part", async () => {
    let body: any;
    const fetchImpl: FetchLike = async (_u, init) => {
      body = JSON.parse(init!.body as string);
      return jsonResponse({candidates: [{content: {parts: [{inlineData: {mimeType: "image/png", data: PNG_B64}}]}}]});
    };
    await generateImages({
      prompt: "hero", count: 1,
      referenceImage: {data: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg"},
    }, {fetchImpl});
    expect(body.contents[0].parts[1].inlineData.mimeType).toBe("image/jpeg");
  });

  it("treats a 200 with no image as a failure, so credits are never committed for nothing", async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({candidates: [{content: {parts: []}}]});
    await expect(generateImages({prompt: "x", count: 1}, {fetchImpl}))
      .rejects.toThrow(/no image data/i);
  });

  it("refuses to run when the key is absent, rather than calling with undefined", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(generateImages({prompt: "x", count: 1}, {fetchImpl: async () => jsonResponse({})}))
      .rejects.toThrow(/INTEGRATION_NOT_CONFIGURED/);
  });
});

describe("error classification from real HTTP statuses", () => {
  it.each([
    [429, "rate_limit"],
    [401, "auth"],
    [400, "validation"],
    [500, "provider_outage"],
    [503, "provider_outage"],
  ])("maps %i to %s", async (status, expected) => {
    const fetchImpl: FetchLike = async () => new Response("upstream said no", {status});
    try {
      await providerFetch("gemini", "https://example.test", {}, {fetchImpl});
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).errorClass).toBe(expected);
      expect((e as ProviderError).status).toBe(status);
    }
  });

  it("classifies an aborted request as a timeout", async () => {
    const fetchImpl: FetchLike = (_u, init) => new Promise((_res, rej) => {
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("aborted"); err.name = "AbortError"; rej(err);
      });
    });
    const err = await providerFetch("gemini", "https://example.test", {}, {fetchImpl, timeoutMs: 20})
      .catch(e => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).errorClass).toBe("timeout");
  });

  it("classifies a network failure as an outage, which is retryable", async () => {
    const fetchImpl: FetchLike = async () => { throw new Error("ECONNREFUSED"); };
    const err = await providerFetch("gemini", "https://example.test", {}, {fetchImpl}).catch(e => e);
    expect((err as ProviderError).errorClass).toBe("provider_outage");
  });

  it("truncates the upstream body so a full prompt echo cannot reach the logs", async () => {
    const fetchImpl: FetchLike = async () => new Response("x".repeat(5000), {status: 500});
    const err = await providerFetch("gemini", "https://example.test", {}, {fetchImpl}).catch(e => e);
    expect((err as ProviderError).message.length).toBeLessThan(700);
  });
});

describe("retry and circuit breaker", () => {
  const noSleep = async () => {};

  it("retries a rate limit and succeeds on a later attempt", async () => {
    let calls = 0;
    const result = await callWithResilience("gemini", async () => {
      calls++;
      if (calls < 3) throw new ProviderError("gemini", "rate_limit", "429");
      return "done";
    }, {sleep: noSleep});
    expect(result).toBe("done");
    expect(calls).toBe(3);
  });

  it("does not retry an auth failure — it will fail identically next time", async () => {
    let calls = 0;
    await expect(callWithResilience("gemini", async () => {
      calls++;
      throw new ProviderError("gemini", "auth", "401");
    }, {sleep: noSleep})).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("stops after maxAttempts on a persistent outage", async () => {
    let calls = 0;
    await expect(callWithResilience("gemini", async () => {
      calls++;
      throw new ProviderError("gemini", "provider_outage", "500");
    }, {sleep: noSleep, maxAttempts: 3})).rejects.toThrow();
    expect(calls).toBe(3);
  });

  it("opens the circuit after repeated failures and then refuses to call at all", async () => {
    for (let i = 0; i < 3; i++) {
      await callWithResilience("cerebras", async () => {
        throw new ProviderError("cerebras", "provider_outage", "500");
      }, {sleep: noSleep, maxAttempts: 2}).catch(() => undefined);
    }
    expect(circuitFor("cerebras").state).toBe("open");

    let called = false;
    await expect(callWithResilience("cerebras", async () => { called = true; return "x"; }, {sleep: noSleep}))
      .rejects.toThrow(/circuit is open/);
    expect(called).toBe(false);
  });

  it("reports every attempt so provider telemetry is measured, not estimated", async () => {
    const logs: {attempt: number; ok: boolean}[] = [];
    await callWithResilience("gemini", async () => {
      if (logs.length < 1) throw new ProviderError("gemini", "timeout", "slow");
      return "ok";
    }, {sleep: noSleep, onAttempt: l => logs.push({attempt: l.attempt, ok: l.ok})});
    expect(logs).toEqual([{attempt: 1, ok: false}, {attempt: 2, ok: true}]);
  });
});

describe("chat adapters", () => {
  it("reads Cerebras OpenAI-shaped responses", async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({
      choices: [{message: {content: "hello"}}],
      usage: {prompt_tokens: 10, completion_tokens: 3},
    });
    const r = await cerebrasChat({prompt: "hi"}, {fetchImpl});
    expect(r.text).toBe("hello");
    expect(r.outputTokens).toBe(3);
  });

  it("reads Anthropic message-shaped responses and joins text blocks", async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({
      content: [{type: "text", text: "one "}, {type: "thinking"}, {type: "text", text: "two"}],
      usage: {input_tokens: 5, output_tokens: 2},
    });
    const r = await anthropicChat({prompt: "hi"}, {fetchImpl});
    expect(r.text).toBe("one two");
    expect(r.inputTokens).toBe(5);
  });

  it("sends the anthropic-version header the API requires", async () => {
    let headers: Record<string, string> = {};
    const fetchImpl: FetchLike = async (_u, init) => {
      headers = (init?.headers ?? {}) as Record<string, string>;
      return jsonResponse({content: [{type: "text", text: "x"}]});
    };
    await anthropicChat({prompt: "hi"}, {fetchImpl});
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["x-api-key"]).toBe("test-anthropic-key");
  });

  it("rejects an empty completion rather than returning blank content", async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({choices: [{message: {content: ""}}]});
    await expect(cerebrasChat({prompt: "hi"}, {fetchImpl})).rejects.toThrow(/empty content/i);
  });
});

describe("prompt construction", () => {
  it("varies by shot type", () => {
    expect(buildImagePrompt({type: "product_hero"})).toContain("studio hero shot");
    expect(buildImagePrompt({type: "banner"})).toContain("banner");
  });

  it("always instructs the model to preserve the real product", () => {
    const p = buildImagePrompt({type: "campaign", productName: "Runner X"});
    expect(p).toContain("Preserve the product's true shape");
    expect(p).toContain("Runner X");
  });

  it("omits absent direction rather than emitting empty fragments", () => {
    expect(buildImagePrompt({type: "product_hero"})).not.toContain("undefined");
  });
});
