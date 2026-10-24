## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.

## 2025-01-20 - LLM DB Over-Fetching Hallucinations
**Learning:** In Prisma queries that use map() on results, changing `include` to `select` just by observing the map() body can be incorrect, as other nested queries or the types themselves rely on the default behavior of `include` mapping. The test suites caught an unexpected behavior even though we passed linting, demonstrating the critical importance of evaluating usages of data fields instead of just the immediate function return type.
**Action:** Before optimizing over-fetched properties, deeply inspect how the object is utilized downstream in the actual API and types before dropping related fields. Run unit tests thoroughly.
