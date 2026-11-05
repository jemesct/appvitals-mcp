import { PlayApiError } from "./errors.js";

export interface RetryOptions {
  /** Total attempts, including the first. Default is 4 (1 try + 3 retries). */
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function isRetryable(err: unknown): err is PlayApiError {
  return err instanceof PlayApiError && (err.status === 429 || err.status >= 500);
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  let last: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isRetryable(err) || attempt === maxAttempts - 1) {
        throw err;
      }
      const backoff = 200 * 2 ** attempt;
      const jitter = random() * backoff * 0.25;
      const delay = err.retryAfterMs != null ? err.retryAfterMs : backoff + jitter;
      await sleep(delay);
    }
  }
  throw last;
}
