/**
 * @jest-environment node
 */
import {NextRequest} from "next/server";
import {updateSession} from "@/core/supabase/middleware";

/**
 * Middleware runs ahead of every route, so anything it throws is a 500 on *every*
 * URL — the marketing pages and the login form included.
 *
 * This is not hypothetical. The deployed site returned MIDDLEWARE_INVOCATION_FAILED
 * on every request because `createServerClient` was handed
 * `process.env.NEXT_PUBLIC_SUPABASE_URL!` and rejected the undefined value. The app
 * is built to boot without credentials so it can be deployed first and configured
 * after; the middleware was the one place that did not honour that.
 */
describe("middleware without a working database", () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    if (key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;
  });

  it("returns a response instead of throwing when nothing is configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const result = await updateSession(new NextRequest("https://example.test/"));
    expect(result.response).toBeDefined();
    // Reporting no user is the safe direction: public pages render and protected
    // routes redirect to /login, which is right when no session can be verified.
    expect(result.user).toBeNull();
    expect(result.configured).toBe(false);
  });

  it("treats a half-configured environment as unconfigured", async () => {
    // A URL with no key would construct a client that fails on first use, which is
    // the same 500 in a less obvious place.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const result = await updateSession(new NextRequest("https://example.test/"));
    expect(result.user).toBeNull();
    expect(result.configured).toBe(false);
  });

  it("degrades to signed-out rather than 500ing when auth cannot be reached", async () => {
    // A syntactically valid but unreachable host: getUser() rejects, and the whole
    // site must not go down with it.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://unreachable.invalid";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const result = await updateSession(new NextRequest("https://example.test/"));
    expect(result.response).toBeDefined();
    expect(result.user).toBeNull();
    // It *was* configured — the distinction matters, because "not set up" and
    // "set up but broken" call for different fixes.
    expect(result.configured).toBe(true);
  });
});
