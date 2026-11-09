## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.
## 2026-11-09 - Cached Intl.DateTimeFormat in overload-detector
**Learning:** Instantiating Intl.DateTimeFormat inside frequently called functions (like loops) is an expensive operation that can cause performance bottlenecks.
**Action:** Always cache and reuse Intl.DateTimeFormat instances, using a Map keyed by the required parameters like timeZone, to avoid unnecessary object creation.
