/**
 * The anonymous shopper's basket key.
 *
 * A shopper has no account, so the basket is identified by a token held in their
 * browser. It is generated lazily — a visitor who never adds anything never causes a
 * cart row to exist — and it is the only authority over that basket, which is why
 * the server requires at least 32 characters and scopes every read to it.
 */
export const CART_TOKEN_KEY = "storovex-cart-token";

function generate(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Reads the token, creating one if needed. */
export function cartToken(): string {
  try {
    const existing = localStorage.getItem(CART_TOKEN_KEY);
    if (existing) return existing;
    const token = generate();
    localStorage.setItem(CART_TOKEN_KEY, token);
    return token;
  } catch {
    // Private browsing can refuse storage. A per-visit token still lets this session
    // work; it just will not survive a reload.
    return generate();
  }
}

/** Reads without creating, for pages that only want to know whether a basket exists. */
export function existingCartToken(): string | null {
  try { return localStorage.getItem(CART_TOKEN_KEY); } catch { return null; }
}

/** Forgets the basket once it has become an order. */
export function clearCartToken() {
  try { localStorage.removeItem(CART_TOKEN_KEY); } catch { /* nothing to clear */ }
}
