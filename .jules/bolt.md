## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.

## 2023-10-29 - Cache Intl.DateTimeFormat in Loops
**Learning:** Instantiating `Intl.DateTimeFormat` is an expensive operation and can cause performance bottlenecks when executed in loops (e.g. iterating over arrays of objects to format or parse dates).
**Action:** Always cache and reuse `Intl.DateTimeFormat` instances, particularly when they are used within loops or frequently called utility functions.
