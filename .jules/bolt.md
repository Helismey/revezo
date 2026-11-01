## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.

## 2025-02-12 - Intl.DateTimeFormat instantiation performance
**Learning:** Instantiating `Intl.DateTimeFormat` inside loop functions is an expensive operation in JavaScript, heavily impacting performance.
**Action:** Always cache and reuse `Intl.DateTimeFormat` instances, for example using a Map keyed by the `timeZone`, to avoid performance bottlenecks.
