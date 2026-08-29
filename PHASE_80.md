# Phase 80 — Secure File Upload & Storage Pipeline

Adds the security foundation for user/generated assets.

## Included
- Upload metadata validation
- 10 MB default per-file limit
- MIME allowlist
- Filename sanitization
- Store/user/file-isolated storage paths
- File metadata table
- File ownership RLS
- Pending/ready/failed/deleted lifecycle
- Secure server-side upload service
- Upload validation endpoint
- Automated tests

Storage buckets should remain private. Public access should not be granted to user assets; signed URLs should be used by a later delivery layer.
