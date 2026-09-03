# Database tests

`rls_isolation.sql` proves tenant isolation actually holds: cross-store reads return
zero rows, server-only tables are invisible to authenticated users, and privileged
writes are refused. It also exercises the rate limiter, worker slots, job claiming
and stale-lease recovery.

## Running against a local PostgreSQL

`local_harness.sql` is a minimal stand-in for the Supabase-managed objects the
migrations depend on — `auth.users`, `auth.uid()`, and the `authenticated` / `anon` /
`service_role` roles. It exists so the migrations can be validated without consuming
a Supabase project slot.

```sh
createdb storovex_test
psql -d storovex_test -f supabase/tests/local_harness.sql
for f in supabase/migrations/*.sql; do psql -d storovex_test -v ON_ERROR_STOP=1 -f "$f"; done
psql -d storovex_test -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql
```

A non-zero exit from the last command means isolation is broken. Every assertion
raises on failure; none of them merely print.

## Running against Supabase

The same `rls_isolation.sql` runs unmodified against a real Supabase project — skip
the harness, since `auth.users` and `auth.uid()` are already provided there. Use a
scratch project, never one holding real data: the script inserts fixture users and
stores and does not clean up after itself.
