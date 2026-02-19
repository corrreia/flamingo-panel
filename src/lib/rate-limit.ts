const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const kvKey = `ratelimit:${key}`;
  const data = await kv.get(kvKey);

  const now = Date.now();
  let attempts: number[] = data ? JSON.parse(data) : [];

  // Remove expired attempts
  attempts = attempts.filter(t => now - t < WINDOW_MS);

  if (attempts.length >= MAX_ATTEMPTS) {
    const oldestInWindow = Math.min(...attempts);
    return { allowed: false, remaining: 0, resetAt: oldestInWindow + WINDOW_MS };
  }

  attempts.push(now);
  await kv.put(kvKey, JSON.stringify(attempts), {
    expirationTtl: Math.ceil(WINDOW_MS / 1000),
  });

  return { allowed: true, remaining: MAX_ATTEMPTS - attempts.length, resetAt: now + WINDOW_MS };
}
