/** Run `worker` over `items` with at most `limit` in flight. Results keep input order. */
export async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await worker(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane),
  );
  return results;
}

/** Milliseconds to wait from a Retry-After header (seconds), capped at 60s. Falls back to 5s. */
export function retryAfterMs(header: string | null): number {
  const secs = Number(header);
  if (!header || !Number.isFinite(secs) || secs < 0) return 5000;
  return Math.min(secs, 60) * 1000;
}
