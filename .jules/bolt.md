## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.
## 2025-02-28 - Intl.DateTimeFormat caching bottleneck
**Learning:** Re-instantiating `Intl.DateTimeFormat` in loops (such as inside `getWeekendKey` in `overload-detector.ts`) causes massive performance bottlenecks (measurable in >50ms runs for 60 members x 50 slots vs >200ms before cache, for instance) because formatting instances are very expensive to create in V8/JS engines.
**Action:** Always cache `Intl.DateTimeFormat` instances when formatting dates inside loops, typically using a Map keyed by `timeZone` (and optionally format options if they vary).
