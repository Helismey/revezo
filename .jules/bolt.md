## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.
## 2025-02-18 - Caching Intl.DateTimeFormat prevents expensive re-instantiations
**Learning:** `Intl.DateTimeFormat` instantiation is an extremely slow operation. In performance-critical areas (like overload detection or loops checking time overlaps), creating this format on each loop iteration can severely degrade throughput.
**Action:** Always cache and reuse `Intl.DateTimeFormat` instances (e.g., using a Map keyed by `timeZone`) when formatting dates multiple times or inside loops.
