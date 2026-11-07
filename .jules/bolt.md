## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.
## 2024-05-18 - Cache Intl.DateTimeFormat in overlap detector

**Learning:** Instantiating `Intl.DateTimeFormat` on every function call (e.g. `getWeekendKey` or `getMostRecentSaturday`) in loops causes massive performance bottlenecks.
**Action:** Always cache `Intl.DateTimeFormat` instances (e.g. using a Map keyed by timezone) when used in utility functions that are repeatedly called.
