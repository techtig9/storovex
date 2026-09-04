import {FEATURE_COST} from "@/core/ai/creditService";
import {buildVideoAdPrompt} from "@/core/ai/videoAdService";
import {callWithResilience, resetCircuits, circuitFor} from "@/core/ai/resilience";
import {ProviderError} from "@/core/ai/providers/types";
import {
  averageOrderValue, conversionRate, grossMerchandiseValue, platformRevenue,
  refundRate, compare, rankTopProducts,
} from "@/core/analytics/metrics";

beforeEach(() => resetCircuits());

describe("AI feature pricing", () => {
  it("prices every feature, so nothing can be generated for free by omission", () => {
    for (const [feature, cost] of Object.entries(FEATURE_COST)) {
      expect(cost).toBeGreaterThan(0);
      expect(Number.isInteger(cost)).toBe(true);
      expect(feature.length).toBeGreaterThan(0);
    }
  });

  it("charges more for a video than for a chat turn", () => {
    // A mispriced feature is a direct margin loss, so the ordering is asserted.
    expect(FEATURE_COST.video_ad).toBeGreaterThan(FEATURE_COST.assistant);
    expect(FEATURE_COST.image).toBeGreaterThan(FEATURE_COST.assistant);
  });
});

describe("video ad prompt", () => {
  it("names the product and honours the music and voiceover choices", () => {
    const withBoth = buildVideoAdPrompt({productTitle: "Runner X", hasMusic: true, hasVoiceover: true});
    expect(withBoth).toContain("Runner X");
    expect(withBoth).toContain("voiceover");
    expect(withBoth).toContain("music");

    const withNeither = buildVideoAdPrompt({productTitle: "Runner X", hasMusic: false, hasVoiceover: false});
    expect(withNeither).toContain("No voiceover.");
    expect(withNeither).toContain("No music.");
  });

  it("forbids invented claims, which is the risk with generated advertising", () => {
    const prompt = buildVideoAdPrompt({productTitle: "X", hasMusic: false, hasVoiceover: false});
    expect(prompt).toMatch(/Do not invent claims/);
  });

  it("emits no undefined fragments when there is no description", () => {
    expect(buildVideoAdPrompt({productTitle: "X", hasMusic: true, hasVoiceover: true}))
      .not.toContain("undefined");
  });
});

describe("provider resilience", () => {
  const noSleep = async () => {};

  it("retries a recoverable failure", async () => {
    let calls = 0;
    const result = await callWithResilience("gemini", async () => {
      calls++;
      if (calls < 3) throw new ProviderError("gemini", "rate_limit", "429");
      return "done";
    }, {sleep: noSleep});
    expect(result).toBe("done");
    expect(calls).toBe(3);
  });

  it("does not retry an auth failure", async () => {
    let calls = 0;
    await expect(callWithResilience("gemini", async () => {
      calls++;
      throw new ProviderError("gemini", "auth", "401");
    }, {sleep: noSleep})).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("opens the circuit and then refuses to call", async () => {
    for (let i = 0; i < 3; i++) {
      await callWithResilience("cerebras", async () => {
        throw new ProviderError("cerebras", "provider_outage", "500");
      }, {sleep: noSleep, maxAttempts: 2}).catch(() => undefined);
    }
    expect(circuitFor("cerebras").state).toBe("open");

    let called = false;
    await expect(callWithResilience("cerebras", async () => { called = true; return 1; }, {sleep: noSleep}))
      .rejects.toThrow(/circuit is open/);
    expect(called).toBe(false);
  });
});

describe("commerce metrics", () => {
  it("computes average order value", () => {
    expect(averageOrderValue(10000, 4)).toBe(2500);
  });

  it("returns zero AOV for no orders rather than dividing by zero", () => {
    expect(averageOrderValue(0, 0)).toBe(0);
  });

  it("sums GMV and platform revenue separately", () => {
    // GMV is what shoppers paid; platform revenue is only the fees. Conflating them
    // would overstate the business by an order of magnitude.
    expect(grossMerchandiseValue([1999, 2500, 500])).toBe(4999);
    expect(platformRevenue([99, 125, 25])).toBe(249);
  });

  it("computes conversion and refund rates to two decimals", () => {
    expect(conversionRate(3, 200)).toBe(1.5);
    expect(refundRate(1, 8)).toBe(12.5);
  });

  it("refuses inputs that cannot be true", () => {
    expect(() => conversionRate(10, 5)).toThrow(/CONVERSION_EXCEEDS_SESSIONS/);
    expect(() => refundRate(5, 2)).toThrow(/REFUNDS_EXCEED_ORDERS/);
    expect(() => grossMerchandiseValue([-1])).toThrow(/GMV_INPUT_INVALID/);
    expect(() => averageOrderValue(-1, 1)).toThrow(/AOV_INPUT_INVALID/);
  });

  it("returns null rather than infinity when the previous period was zero", () => {
    // "Revenue up ∞%" is not information and makes a dashboard look broken.
    expect(compare(500, 0)).toEqual({current: 500, previous: 0, changePct: null});
    expect(compare(150, 100)).toEqual({current: 150, previous: 100, changePct: 50});
    expect(compare(50, 100).changePct).toBe(-50);
  });

  it("ranks top products by revenue, merging repeated titles", () => {
    const top = rankTopProducts([
      {variantId: "v1", title: "Runner X", quantity: 2, price: 1000},
      {variantId: "v2", title: "Runner X", quantity: 1, price: 1000},
      {variantId: "v3", title: "Cap", quantity: 10, price: 500},
    ]);
    expect(top[0]!.title).toBe("Cap");
    expect(top[0]!.revenue).toBe(5000);
    // The two Runner X variants merge into one line rather than splitting the report.
    expect(top[1]!.title).toBe("Runner X");
    expect(top[1]!.unitsSold).toBe(3);
    expect(top[1]!.revenue).toBe(3000);
  });

  it("limits the ranking", () => {
    const lines = Array.from({length: 30}, (_, i) => ({
      variantId: `v${i}`, title: `P${i}`, quantity: 1, price: (i + 1) * 100,
    }));
    expect(rankTopProducts(lines, 5)).toHaveLength(5);
  });

  it("handles an empty period", () => {
    expect(rankTopProducts([])).toEqual([]);
    expect(grossMerchandiseValue([])).toBe(0);
  });
});
