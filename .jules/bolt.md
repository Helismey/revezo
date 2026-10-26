## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.

## 2025-02-28 - Prisma Sequential Find Query Optimization
**Learning:** Performing multiple sequential database queries to fetch partitioned lists (like a 'first' record and then a list of 'remaining/upcoming' records using the same filter conditions) creates unnecessary latency by duplicating round-trips to the database.
**Action:** Combine adjacent `findFirst` and `findMany` calls into a single `findMany` query with a combined `take` limit, and handle the data partitioning (slicing) in memory to eliminate extraneous database connections.
