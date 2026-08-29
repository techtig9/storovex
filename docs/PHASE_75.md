# Phase 75 — Worker Concurrency, Rate Limits & Resource Control

Adds production resource controls around the durable worker queue.

## Included
- Plan-based global/store/user/provider concurrency limits
- Worker slot accounting
- Atomic worker-slot acquisition/release
- Queue priority + fair FIFO ordering
- Rate-limit bucket foundation
- Capacity status endpoint
- Protection against worker capacity overflow
- Tests

The limits are centralized so they can later be driven by subscription configuration instead of hard-coded defaults.
