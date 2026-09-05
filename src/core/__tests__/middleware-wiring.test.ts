import {existsSync, readFileSync} from "fs";
import {join} from "path";

/**
 * Guards where the middleware file lives.
 *
 * Next.js looks for middleware beside the `app` directory: at the repository root
 * for a root-level app/, and inside src/ for a src/app/ project. This project is the
 * second kind, and the file was at the root — so Next compiled no middleware at all
 * and every guard in it was silently inert. Protected routes served to signed-out
 * visitors, and sessions were never refreshed.
 *
 * Nothing caught it. The file typechecked, linted and read correctly; it was simply
 * never loaded. There is no import to break and no type to fail, so the only thing
 * that can catch a regression is asserting the location itself.
 */
const root = join(__dirname, "..", "..", "..");

describe("middleware is where Next.js will find it", () => {
  it("lives at src/middleware.ts, beside src/app", () => {
    expect(existsSync(join(root, "src", "app"))).toBe(true);
    expect(existsSync(join(root, "src", "middleware.ts"))).toBe(true);
  });

  it("is not at the repository root, where it would be ignored", () => {
    // Both present is worse than wrong: Next would load one and quietly ignore the
    // other, so the guards you were reading are not the guards that ran.
    expect(existsSync(join(root, "middleware.ts"))).toBe(false);
    expect(existsSync(join(root, "middleware.js"))).toBe(false);
  });

  it("protects every merchant route the app actually has", () => {
    const source = readFileSync(join(root, "src", "middleware.ts"), "utf8");
    const listed = source.slice(
      source.indexOf("const PROTECTED_PREFIXES"),
      source.indexOf("// Signed-in users are bounced")
    );

    // Each of these has a page under src/app/(dashboard) and must not render to a
    // signed-out visitor.
    for (const route of ["/dashboard", "/products", "/orders", "/discounts", "/settings"]) {
      expect(listed).toContain(`"${route}"`);
    }

    // Routes from the previous product that no longer exist here. Leaving them in
    // is harmless at runtime but hides which list is actually maintained.
    for (const stale of ["/generate", "/projects", "/billing"]) {
      expect(listed).not.toContain(`"${stale}"`);
    }
  });
});
