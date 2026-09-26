// Retries for snapshot requests. Exponential backoff with "equal jitter": half the delay is fixed,
// half random, so many phones that failed together don't retry together.

export function backoffMs(attempt: number, baseMs = 500, capMs = 8_000): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** attempt);
  return ceiling / 2 + Math.random() * (ceiling / 2);
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, backoffMs(i)));
    }
  }
  throw lastError;
}
