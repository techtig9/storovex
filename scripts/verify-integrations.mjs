#!/usr/bin/env node
/**
 * Verifies every configured integration against its live API, via a running
 * deployment's /api/health/verify endpoint.
 *
 *   node scripts/verify-integrations.mjs                    # uses NEXT_PUBLIC_SITE_URL
 *   node scripts/verify-integrations.mjs https://your.app   # or an explicit origin
 *
 * Reads .env.local / .env for CRON_SECRET and the site URL. Every check the endpoint
 * runs is a read: no email is sent, no charge is started, no image is generated.
 *
 * Exit code 0 means every configured integration passed.
 */
import {readFileSync, existsSync} from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const base = (process.argv[2] ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")
  .replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("CRON_SECRET is not set. It guards the verification endpoint.");
  process.exit(2);
}

let body;
try {
  const res = await fetch(`${base}/api/health/verify`, {
    headers: {Authorization: `Bearer ${secret}`},
  });
  body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    console.error(`\nVerification failed: HTTP ${res.status}`);
    if (body?.error) console.error(`  ${body.error.code}: ${body.error.message}`);
    process.exit(2);
  }
} catch (e) {
  console.error(`\nCould not reach ${base}: ${e.message}`);
  process.exit(2);
}

let failures = 0;
console.log(`\n${body.data.summary}\n`);
for (const c of body.data.checks) {
  const mark = c.ok ? "PASS" : c.configured ? "FAIL" : "SKIP";
  if (c.configured && !c.ok) failures++;
  console.log(`  [${mark}] ${c.label.padEnd(12)} ${c.detail}`);
  if (c.remedy) console.log(`         -> ${c.remedy}`);
}
console.log(failures > 0 ? `\n${failures} integration(s) need attention.\n` : "\nAll configured integrations verified.\n");
process.exit(failures > 0 ? 1 : 0);
