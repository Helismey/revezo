## 2024-05-19 - Combine Prisma Queries

**Learning:** When fetching adjacent/sequential data (like a 'first' record and a list of 'upcoming' records), making separate `findFirst` and `findMany` calls is an unnecessary database round-trip.

**Action:** Combine them into a single `findMany` query with an adjusted `take` limit, and slice the results in memory.
