## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.
## 2025-02-13 - Intl.DateTimeFormat caching

**Learning:** Instantiating `Intl.DateTimeFormat` is an expensive operation that can cause severe performance bottlenecks, especially when used in loops or across large datasets (e.g., in scheduling engines and overload detectors).
**Action:** Always cache and reuse instances of `Intl.DateTimeFormat` (e.g., using a `Map` keyed by the timeZone or a global variable if only using one configuration) rather than creating a new instance on every format call.
