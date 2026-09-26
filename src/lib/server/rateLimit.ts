import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createHash } from "node:crypto";
import { ApiError } from "./http";
const buckets = new Map<string, { count: number; until: number }>();
export async function rateLimit(req: Request, scope: string, identity?: string, limit = 10) {
  // Vercel overwrites x-vercel-forwarded-for; never trust arbitrary forwarded IPs.
  const ip = process.env.VERCEL ? req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "unknown" : "development";
  const key = createHash("sha256").update(`${scope}:${identity ?? ip}`).digest("hex");
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const limiter = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(limit, "10 m"), prefix: "ttg:limit", analytics: false });
    const { success } = await limiter.limit(key);
    if (!success) throw new ApiError(429, "Too many attempts. Try again in ten minutes.");
  } else {
    if (process.env.NODE_ENV === "production") throw new ApiError(503, "Rate limiting must be configured before launch.");
    const now = Date.now();
    for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
    const bucket = buckets.get(key) ?? { count: 0, until: now + 600_000 };
    buckets.set(key, bucket);
    if (++bucket.count > limit) throw new ApiError(429, "Too many attempts. Try again in ten minutes.");
  }
}
