# Phase 77 — Authentication, Authorization & Security Hardening

Adds a centralized authorization layer around authenticated users and stores.

## Included
- Server-side session verification
- Store membership verification
- Owner/admin/member RBAC
- Central permission matrix
- Resource store-ownership checks
- Protected store action helper
- Store membership table
- Membership RLS
- Cross-store access protection
- Security event storage
- Hardened generation/provider-event RLS
- Authorization tests

Never trust a store ID, role, or user ID supplied by the browser. Server-side session identity and database membership are authoritative.
