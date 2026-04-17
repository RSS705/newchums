/**
 * Generic sliding-window rate limiter backed by Cloudflare KV.
 *
 * Originally written for the contact form; also reused by the lightweight
 * plan-signup endpoint (per-IP and per-email). If KV is not configured,
 * permits the request (degraded mode for local dev).
 */

export async function checkRateLimit(
  kv: KVNamespace | undefined,
  bucketKey: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean }> {
  if (!kv) return { allowed: true };

  const raw = await kv.get(bucketKey);
  const now = Date.now();
  let timestamps: number[] = raw ? (JSON.parse(raw) as number[]) : [];
  timestamps = timestamps.filter((t) => now - t < windowMs);

  if (timestamps.length >= limit) {
    return { allowed: false };
  }

  timestamps.push(now);
  await kv.put(bucketKey, JSON.stringify(timestamps), {
    expirationTtl: Math.ceil(windowMs / 1000) + 60,
  });
  return { allowed: true };
}

/** Contact form: 5 submissions per 10 minutes per IP. */
export async function checkContactRateLimit(
  kv: KVNamespace | undefined,
  ip: string,
): Promise<{ allowed: boolean }> {
  return checkRateLimit(kv, `contact:${ip}`, 5, 10 * 60 * 1000);
}
