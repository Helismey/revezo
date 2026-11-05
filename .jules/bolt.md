## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.
## 2026-11-05 - Cache Intl.DateTimeFormat
**Learning:** Instantiating `Intl.DateTimeFormat` is an expensive operation and can cause significant performance bottlenecks when done inside loops.
**Action:** Always cache and reuse `Intl.DateTimeFormat` instances (e.g., using a Map keyed by timeZone) when formatting dates frequently.
