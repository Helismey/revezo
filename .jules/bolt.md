## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.

## 2025-02-12 - Intl.DateTimeFormat CPU Bottleneck
**Learning:** Instantiating `Intl.DateTimeFormat` inside loop evaluations (e.g. for dynamic scheduling rules) is CPU-expensive and causes significant latency overhead in Javascript engines.
**Action:** Use a `Map` keyed by `timeZone` to cache and reuse `Intl.DateTimeFormat` instances to offload repeated allocations.
