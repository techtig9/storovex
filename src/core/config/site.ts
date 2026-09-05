/**
 * Absolute origin for links that leave the app (auth redirects, email links).
 * Deriving this from a request header would let an attacker set Host and poison a
 * password-reset link, so it comes from configuration only.
 */
export function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
