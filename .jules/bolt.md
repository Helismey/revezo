## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.

## 2026-11-04 - Expensive Intl.DateTimeFormat Instantiations
**Learning:** Instantiating `Intl.DateTimeFormat` repeatedly inside loops is an expensive operation and can cause performance bottlenecks in domain logic.
**Action:** Always cache and reuse instances of `Intl.DateTimeFormat` (e.g., using a Map keyed by `timeZone`) when formatting dates to avoid redundant instantiations.
