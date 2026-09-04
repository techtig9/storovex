/** Minimal class joiner. Keeps a dependency out of the bundle for what is six lines. */
export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
