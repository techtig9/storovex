import {requestIdFrom, redactFields, newRequestId} from "@/core/security/observability";

describe("request ids", () => {
  it("generates one when the client sends none", () => {
    const id = requestIdFrom(new Headers());
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("honours a well-formed inbound id so a trace can span a proxy", () => {
    const headers = new Headers({"x-request-id": "abc123-DEF_456"});
    expect(requestIdFrom(headers)).toBe("abc123-DEF_456");
  });

  it("refuses an id that isn't one, rather than echoing client text into logs", () => {
    // A forged id containing newlines or JSON would let a caller write their own
    // log lines.
    for (const hostile of [
      'x", "level": "info", "note": "forged',
      "short",
      "with spaces",
      "a".repeat(200),
      '{"nested":"json"}',
    ]) {
      const id = requestIdFrom(new Headers({"x-request-id": hostile}));
      expect(id).not.toBe(hostile);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("generates a different id each time", () => {
    expect(newRequestId()).not.toBe(newRequestId());
  });
});

describe("redaction", () => {
  it("drops anything that looks like a credential", () => {
    const out = redactFields({
      authorization: "Bearer sk_live_secret",
      cookie: "session=abc",
      apikey: "sb_secret_xyz",
      route: "/api/products",
    });
    expect(out.authorization).toBe("[redacted]");
    expect(out.cookie).toBe("[redacted]");
    expect(out.apikey).toBe("[redacted]");
    // Everything else survives, or the log is useless.
    expect(out.route).toBe("/api/products");
  });

  it("is case-insensitive about header names", () => {
    expect(redactFields({Authorization: "Bearer x"}).Authorization).toBe("[redacted]");
    expect(redactFields({"Set-Cookie": "a=b"})["Set-Cookie"]).toBe("[redacted]");
  });

  it("truncates a long value rather than filling the log with one line", () => {
    const out = redactFields({body: "x".repeat(2000)}) as {body: string};
    expect(out.body.length).toBeLessThan(600);
    expect(out.body).toContain("[truncated]");
  });

  it("leaves short values exactly as they are", () => {
    expect(redactFields({status: 404, ok: false}).status).toBe(404);
    expect(redactFields({status: 404, ok: false}).ok).toBe(false);
  });
});
