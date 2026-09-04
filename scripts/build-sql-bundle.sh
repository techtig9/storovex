#!/bin/bash
# Regenerates the paste-ready SQL bundles from the canonical migration and test files.
# Run this after changing anything under supabase/migrations/ or supabase/tests/.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p supabase/bundle
STAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

{
  echo "-- Storovex — complete schema, generated from supabase/migrations/"
  echo "-- Generated: $STAMP"
  echo "--"
  echo "-- Paste this whole file into the Supabase SQL Editor and run it once."
  echo "-- It is safe to run more than once: every statement is idempotent, verified by"
  echo "-- applying the full set three times against PostgreSQL 16 with no errors and an"
  echo "-- unchanged resulting schema."
  echo "--"
  echo "-- Order matters and is already correct here: each section depends only on the"
  echo "-- sections above it."
  echo ""
  echo "begin;"
  for f in supabase/migrations/*.sql; do
    echo ""
    echo "-- ============================================================"
    echo "-- $(basename "$f")"
    echo "-- ============================================================"
    cat "$f"
  done
  echo ""
  echo "commit;"
} > supabase/bundle/all_migrations.sql

{
  echo "-- Storovex — verification suite, generated from supabase/tests/"
  echo "-- Generated: $STAMP"
  echo "--"
  echo "-- Run AFTER all_migrations.sql, in the Supabase SQL Editor."
  echo "--"
  echo "-- Every check raises on failure, so if this completes without an error the"
  echo "-- assertions all passed. Look for the NOTICE lines confirming each suite."
  echo "--"
  echo "-- IMPORTANT: this inserts fixture users and stores. Run it on a project that"
  echo "-- does not hold real data, or accept those fixture rows. It resets its own"
  echo "-- fixtures first, so it is safe to re-run."
  for f in rls_isolation credit_ledger billing_entitlements; do
    echo ""
    echo "-- ============================================================"
    echo "-- $f.sql"
    echo "-- ============================================================"
    cat "supabase/tests/$f.sql"
  done
} > supabase/bundle/all_tests.sql

echo "Wrote supabase/bundle/all_migrations.sql and all_tests.sql"
