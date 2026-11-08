## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.

## 2025-02-12 - Intl.DateTimeFormat Instantiation Bottleneck
**Learning:** Instantiating `Intl.DateTimeFormat` inside utility functions that are repeatedly called within loops (e.g., date processing over a list of items) creates a measurable performance bottleneck.
**Action:** Always cache and reuse `Intl.DateTimeFormat` instances (e.g., using a Map keyed by locale/timezone) when the same formatting rules are applied repeatedly.
