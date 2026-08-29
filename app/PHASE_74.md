# Phase 74 — Production-Durable Worker Infrastructure

Adds durable worker lease/heartbeat/recovery support on the Postgres-backed job queue.

- Worker heartbeat
- Lease index
- Crash/stale-worker recovery
- Retry or dead-letter on recovery
- Durable queue remains outside application memory
- Safe concurrent recovery with SKIP LOCKED
