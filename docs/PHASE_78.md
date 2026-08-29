# Phase 78 — Secure API Gateway & Route Protection

Adds reusable API security primitives.

## Included
- Central method/content-type protection
- Consistent JSON API responses
- Security headers
- Zod request validation helper
- Sensitive-data redaction
- API audit event storage
- RLS for audit events
- Security regression test

The helpers are designed to be applied to each API route without trusting browser-supplied identity or secrets.
