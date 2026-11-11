## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.
\n## 2025-02-12 - Intl.DateTimeFormat Caching\n**Learning:** Instantiating `Intl.DateTimeFormat` is expensive, especially in tight loops like processing volunteer assignments.\n**Action:** Extract instantiation into caching functions using `Map<string, Intl.DateTimeFormat>` keyed by `timeZone` to reuse formatters and improve performance.
