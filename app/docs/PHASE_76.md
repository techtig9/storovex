# Phase 76 — Abuse Prevention & API Rate Limiting

Adds a security boundary around public APIs and AI generation.

## Included
- Fixed-window rate limiting foundation
- Database-backed rate-limit buckets
- Rate-limit headers
- User/store/API bucket support
- Burst protection
- Abuse risk scoring
- Allow/challenge/block decision layer
- Security event logging
- Retry-abuse protection foundation
- Atomic database rate-limit checks
- Tests

Production deployments should use authenticated user/store identifiers for sensitive endpoints and should not rely on client-supplied identity or IP headers.
