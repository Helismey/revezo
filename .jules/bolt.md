## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.

## 2023-11-20 - Intl.DateTimeFormat Instantiation Bottleneck
**Learning:** Instantiating `Intl.DateTimeFormat` on every call inside high-frequency utility functions (like `getWeekendKey` or `getMostRecentSaturday` in `overload-detector.ts`) creates a significant CPU bottleneck, especially when scaling scheduling algorithms over large member datasets.
**Action:** Always cache and reuse `Intl.DateTimeFormat` instances (e.g., using a `Map` keyed by `timeZone`) when they are used within loops or frequently called functions to prevent GC churn and CPU spikes.
