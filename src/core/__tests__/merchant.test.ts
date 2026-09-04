import {canTransition, ORDER_STATUSES, type OrderStatus} from "@/core/commerce/orderService";
import {isSafeImageUrl} from "@/core/security/url";

/**
 * The order state machine.
 *
 * These are not stylistic rules. Each forbidden transition below is a way to lose
 * money or goods, so they are asserted rather than left to the reviewer's memory.
 */
describe("order transitions", () => {
  it("will not fulfil an order nobody has paid for", () => {
    // Shipping against an unpaid order gives the goods away.
    expect(canTransition("pending_payment", "fulfilled")).toBe(false);
    expect(canTransition("failed", "fulfilled")).toBe(false);
  });

  it("will not refund an order that was never paid", () => {
    expect(canTransition("pending_payment", "refunded")).toBe(false);
    expect(canTransition("failed", "refunded")).toBe(false);
  });

  it("treats refunded and cancelled as final", () => {
    // Re-refunding sends the money twice.
    for (const to of ORDER_STATUSES) {
      expect(canTransition("refunded", to)).toBe(false);
      expect(canTransition("cancelled", to)).toBe(false);
    }
  });

  it("allows the ordinary path a shop actually follows", () => {
    expect(canTransition("pending_payment", "cancelled")).toBe(true);
    expect(canTransition("paid", "fulfilled")).toBe(true);
    expect(canTransition("paid", "refunded")).toBe(true);
    // A customer who returns something after delivery still gets their money back.
    expect(canTransition("fulfilled", "refunded")).toBe(true);
  });

  it("never allows a status to transition to itself", () => {
    for (const status of ORDER_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("only names statuses the database will accept", () => {
    // orders_status_check permits exactly these six.
    expect([...ORDER_STATUSES].sort()).toEqual([
      "cancelled", "failed", "fulfilled", "paid", "pending_payment", "refunded",
    ]);
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        if (canTransition(from, to)) {
          expect(ORDER_STATUSES).toContain(to as OrderStatus);
        }
      }
    }
  });
});

describe("product image links", () => {
  it("accepts an ordinary https image", () => {
    expect(isSafeImageUrl("https://cdn.example.com/photo.jpg")).toBe(true);
  });

  it("refuses http, because a browser blocks it as mixed content anyway", () => {
    // Accepting one would only produce a broken picture the merchant cannot explain.
    expect(isSafeImageUrl("http://cdn.example.com/photo.jpg")).toBe(false);
  });

  it("refuses schemes that are not a picture at all", () => {
    expect(isSafeImageUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeImageUrl("data:image/svg+xml,<svg onload=alert(1)>")).toBe(false);
    expect(isSafeImageUrl("not a url")).toBe(false);
  });

  it("refuses embedded credentials", () => {
    expect(isSafeImageUrl("https://user:pass@cdn.example.com/a.jpg")).toBe(false);
  });

  it("refuses private and loopback hosts", () => {
    // The shopper's browser does the fetching, so a private address turns every
    // storefront visitor into a probe of their own network.
    for (const host of [
      "http://localhost/a.jpg", "https://localhost/a.jpg", "https://127.0.0.1/a.jpg",
      "https://10.0.0.5/a.jpg", "https://192.168.1.1/a.jpg", "https://172.16.0.1/a.jpg",
      "https://169.254.169.254/latest/meta-data", "https://[::1]/a.jpg",
    ]) {
      expect(isSafeImageUrl(host)).toBe(false);
    }
  });

  it("allows public addresses that merely look similar", () => {
    // 172.32 is outside the private range, and 11.x is not private at all.
    expect(isSafeImageUrl("https://172.32.0.1/a.jpg")).toBe(true);
    expect(isSafeImageUrl("https://11.0.0.1/a.jpg")).toBe(true);
  });
});
