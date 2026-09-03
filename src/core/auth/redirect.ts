/**
 * A `next` parameter comes from the URL, so it is attacker-controlled. Allowing an
 * absolute URL there turns the login page into an open redirect: a phishing link
 * could send a user through a genuine Storovex login and out to a lookalike site
 * carrying their trust. Only same-origin absolute paths are accepted.
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/dashboard") {
  if (!next) return fallback;
  // Reject anything that isn't a single-slash-rooted path: no "//host",
  // no "https://host", no "\\host" (which some browsers normalise to "//host").
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.includes("://")) return fallback;
  if (/[\x00-\x1f]/.test(next)) return fallback;
  return next;
}
