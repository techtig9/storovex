/**
 * Guards the vocabulary the code shares with the database.
 *
 * Every value here is copied from a CHECK constraint on the live project. They are
 * asserted because getting one wrong does not throw at build time and does not
 * throw at read time either — a query filtering on a status that cannot exist just
 * returns nothing, forever, and looks like an empty catalogue rather than a bug.
 *
 * That is not hypothetical. The first version of this codebase filtered products on
 * status = 'published' while the database allows only draft | active | archived, and
 * checked for 'owner' and 'admin' team roles where only 'manager' and 'staff' can be
 * stored. Both passed typecheck, lint, 106 unit tests and a production build. Both
 * would have shipped a storefront that displayed nothing and an admin check that
 * denied everyone, including the owner.
 *
 * If a constraint changes in the database, change it here in the same commit.
 */
import {FEATURE_COST} from "@/core/ai/creditService";
import {can, isValidRole, type Role} from "@/core/auth/authorization";
import type {ProductStatus} from "@/core/commerce/productService";
import type {VideoAdStatus} from "@/core/ai/videoAdService";

describe("values the database will accept", () => {
  it("products.status — draft | active | archived", () => {
    const all: ProductStatus[] = ["draft", "active", "archived"];
    expect(all).toHaveLength(3);
    // @ts-expect-error 'published' is not a product status the database permits.
    const wrong: ProductStatus = "published";
    expect(wrong).toBe("published");
  });

  it("store_team_members.role — manager | staff, and nothing else", () => {
    expect(isValidRole("manager")).toBe(true);
    expect(isValidRole("staff")).toBe(true);
    for (const invented of ["owner", "admin", "member", "user", ""]) {
      expect(isValidRole(invented)).toBe(false);
    }
  });

  it("product_video_ads.status includes the pending state the claim depends on", () => {
    const all: VideoAdStatus[] = ["pending", "processing", "ready", "failed"];
    expect(all).toContain("pending");
    // @ts-expect-error the live vocabulary has no 'generating'.
    const wrong: VideoAdStatus = "generating";
    expect(wrong).toBe("generating");
  });

  it("credit_usage.feature — exactly the six the constraint lists", () => {
    expect(Object.keys(FEATURE_COST).sort()).toEqual([
      "ai_assistant_message", "product_video_ad", "video_ad_music",
      "video_ad_regenerate", "video_ad_voiceover", "voice_search",
    ]);
  });
});

describe("what each role may do", () => {
  it("a manager may refund and manage the team", () => {
    expect(can("manager", "orders:refund")).toBe(true);
    expect(can("manager", "team:manage")).toBe(true);
    expect(can("manager", "billing:write")).toBe(true);
  });

  it("staff may run the shop but not move money or change who has access", () => {
    expect(can("staff", "orders:fulfil")).toBe(true);
    expect(can("staff", "products:write")).toBe(true);
    expect(can("staff", "orders:refund")).toBe(false);
    expect(can("staff", "team:manage")).toBe(false);
    expect(can("staff", "billing:read")).toBe(false);
    expect(can("staff", "store:delete")).toBe(false);
  });

  it("an invented role grants nothing rather than defaulting open", () => {
    expect(can("owner" as Role, "orders:refund")).toBe(false);
    expect(can("admin" as Role, "store:read")).toBe(false);
  });
});
