# 0004 Postgres fixed-window rate limiter
**Decision.** Rate limits live in a `rate_limits` table (single atomic upsert) instead of adding Redis/Upstash.
**Consequences.** Zero extra services on the free tier; adequate for under 100 users. Revisit if limits are needed on hot paths.
