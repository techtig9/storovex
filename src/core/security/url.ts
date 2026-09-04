
export function validateHttpUrl(value:string){
 const u=new URL(value);
 if(u.protocol!=="https:"&&u.protocol!=="http:")throw new Error("INVALID_URL_PROTOCOL");
 if(u.username||u.password)throw new Error("URL_CREDENTIALS_NOT_ALLOWED");
 return u.toString();
}

/**
 * Whether a URL is safe to put in an <img src> on a public storefront.
 *
 * Stricter than validateHttpUrl and boolean rather than throwing, because a bad
 * image URL is a validation message to a merchant, not an exception.
 *
 * https only: a storefront served over https that loads an http image gets the
 * image blocked as mixed content, so accepting one would only produce a broken
 * picture the merchant cannot explain.
 *
 * Private and loopback hosts are refused as well. The browser does the fetching, so
 * this is not server-side request forgery — but a product image pointing at
 * 192.168.x.x turns every shopper's browser into a probe of their own network, and
 * it can never be the URL a merchant actually meant.
 */
export function isSafeImageUrl(value: string): boolean {
  let u: URL;
  try { u = new URL(value); } catch { return false; }

  if (u.protocol !== "https:") return false;
  if (u.username || u.password) return false;

  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (host === "[::1]" || host === "::1") return false;

  // IPv4 literals in the private and link-local ranges.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
  }

  return value.length <= 2048;
}
