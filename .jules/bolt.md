## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.

## 2026-10-25 - Query Batching Optimization
**Learning:** Sequential Prisma queries (e.g., `findFirst` followed by `findMany` for the same entity and conditions) result in unnecessary database round-trips which increase latency.
**Action:** Combine sequential queries into a single `findMany` query with an adjusted `take` limit, and slice the results in memory to separate the first item from the remaining items.
