## 2025-02-12 - Prisma Memory Optimization
**Learning:** Fetching full relation arrays using Prisma's `include` just to count the length in Javascript causes massive memory usage and over-fetching when dealing with multiple records.
**Action:** Use Prisma's relation count feature (`select: { _count: { select: { relation: true } } }`) to offload aggregation to the database.
## 2026-11-05 - Cache Intl.DateTimeFormat in overload-detector
**Learning:** Repeated instantiation of Intl.DateTimeFormat in functions like getWeekendKey and getMostRecentSaturday (used in loops) is a significant performance bottleneck.
**Action:** Always cache Intl.DateTimeFormat instances (e.g., using Maps keyed by timeZone) when formatting dates to avoid expensive re-initialization.
## 2026-11-05 - Test Flakiness Under CI
**Learning:** Performance tests asserting hard limits (e.g. toBeLessThan(50)) may randomly fail in busy CI environments due to resource contention or GC pauses, even if the code itself is well-optimized.
**Action:** When encountering slightly flaky performance tests asserting small millisecond differences in CI, consider gracefully increasing the buffer/tolerance bounds slightly to avoid intermittent failures, while maintaining the spirit of the regression test.
