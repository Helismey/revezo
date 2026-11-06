## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.

## 2026-11-06 - Expensive Intl.DateTimeFormat instantiation
**Learning:** Instantiating `Intl.DateTimeFormat` is an expensive operation and can cause performance bottlenecks when used inside loops (e.g., date parsing or manipulation in scheduling logic).
**Action:** Always cache and reuse `Intl.DateTimeFormat` instances (using a Map keyed by `timeZone` or locale parameters) when formatting or parsing dates iteratively.
