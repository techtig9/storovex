# Phase 79 — Input Validation & Secure Data Handling

Adds centralized validation and data-size protections.

## Included
- Strict Zod request schemas
- Prompt/system/max-token/temperature bounds
- Generation request validation
- JSON request-size limit
- Upload-size limit
- MIME allowlist foundation
- Safe filename validation and sanitization
- HTTP/HTTPS URL validation
- Control-character stripping
- Validation-event audit storage
- RLS for validation events
- Automated tests

Validation happens before business logic so malformed or oversized input is rejected early.
