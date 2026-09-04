# Deploying Storovex to Vercel

The app is built to **boot without any credentials**. Every integration is read
lazily and reports its own absence, so a deployment with no environment variables
set will build, start, and serve every page — the marketing site, `/terms`,
`/privacy`, login and signup all render. Anything that needs the database or
Stripe will say so rather than crash.

That means you can deploy first and add variables afterwards, which is the point
of the list below.

---

## 1. Required before anything works

Without these, sign-in and every database-backed screen fail.

| Variable | Where to find it | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Public. Safe in the browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys | Public by design. RLS is what protects the data, not this key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys | **Secret. Bypasses every RLS policy.** Server-side only — never prefix it with `NEXT_PUBLIC_`. |

The project is `vjlarglyifnbpqcpxoxd`.

## 2. Required to take payment

Until these are set, orders can be placed and stock is reserved, but no card is
charged and the checkout tells the shopper so.

| Variable | Where to find it | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys | Secret. Use `sk_test_…` first. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Same page | Public. Mounts the card form. |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks | See step 4. |

## 3. Optional

| Variable | Default | What it does |
|---|---|---|
| `PLATFORM_FEE_BASIS_POINTS` | `500` | Your cut per sale, in basis points. 500 = 5%. |
| `STOCK_RESERVATION_TTL_MINUTES` | `20` | How long a basket holds stock during checkout. |
| `STOREFRONT_CURRENCY` | `usd` | Currency passed to Stripe. |
| `NEXT_PUBLIC_SITE_URL` | inferred | Set to your real domain so Stripe Connect returns to the right place. |
| `GEMINI_API_KEY` | — | AI video ads and the assistant. Without it those features report unavailable. |
| `RESEND_API_KEY` | — | Transactional email. Not yet wired to any flow. |

---

## 4. After the first successful deploy

**Point Stripe's webhook at the deployment.** In Stripe → Developers → Webhooks,
add an endpoint at `https://<your-domain>/api/payments/webhook` and subscribe to
`payment_intent.succeeded`, `payment_intent.payment_failed` and `charge.refunded`.
Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

This matters more than it looks: **the webhook is what marks an order paid.**
Without it a shopper can pay and the order stays "awaiting payment" forever.

**Connect a Stripe account for the store.** Sign in, go to Settings, and use
*Connect Stripe*. Until a store has a connected account, checkout will not ask
anyone to pay into it.

**Check `/api/health`.** It reports which integrations are configured, so it is
the fastest way to confirm the variables actually took effect.

---

## What is not configured by any of this

- **Email.** No transactional email is sent yet; there is no order-receipt flow.
- **Shipping and tax.** Both are currently always zero on every order.
- **File uploads.** Product images are added by https URL, not uploaded.
