/**
 * Per-IP rate limit for contact form submissions.
 * 5 submissions per 10 minutes.
 * Uses KV for state; if KV is not configured, allows (degraded mode for local dev).
 */

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PER_WINDOW = 5;

export async function checkContactRateLimit(
  kv: KVNamespace | undefined,
  ip: string
): Promise<{ allowed: boolean }> {
  if (!kv) return { allowed: true };

  const key = `contact:${ip}`;
  const raw = await kv.get(key);
  const now = Date.now();
  let timestamps: number[] = raw ? (JSON.parse(raw) as number[]) : [];
  timestamps = timestamps.filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_PER_WINDOW) {
    return { allowed: false };
  }

  timestamps.push(now);
  await kv.put(key, JSON.stringify(timestamps), {
    expirationTtl: Math.ceil(WINDOW_MS / 1000) + 60, // 11 min to be safe
  });
  return { allowed: true };
}
