## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.
## 2026-11-05 - Cache Intl.DateTimeFormat in overload-detector
**Learning:** Repeated instantiation of Intl.DateTimeFormat in functions like getWeekendKey and getMostRecentSaturday (used in loops) is a significant performance bottleneck.
**Action:** Always cache Intl.DateTimeFormat instances (e.g., using Maps keyed by timeZone) when formatting dates to avoid expensive re-initialization.
