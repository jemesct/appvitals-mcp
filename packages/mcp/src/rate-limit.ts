export interface TokenBucketOptions {
  capacity: number;
  refillPerSecond: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(private readonly opts: TokenBucketOptions) {
    this.tokens = opts.capacity;
    this.updatedAt = this.now();
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  private refill(): void {
    const current = this.now();
    const elapsedSeconds = (current - this.updatedAt) / 1000;
    if (elapsedSeconds > 0) {
      this.tokens = Math.min(
        this.opts.capacity,
        this.tokens + elapsedSeconds * this.opts.refillPerSecond,
      );
      this.updatedAt = current;
    }
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = ((1 - this.tokens) / this.opts.refillPerSecond) * 1000;
    const sleep =
      this.opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    await sleep(waitMs);
    this.refill();
    if (this.tokens < 1) {
      this.tokens = 1;
    }
    this.tokens -= 1;
  }
}

let shared: TokenBucket | undefined;

/** One bucket for the process. Real Play calls share it. */
export function getProcessRateLimiter(): TokenBucket {
  if (!shared) {
    shared = new TokenBucket({ capacity: 30, refillPerSecond: 5 });
  }
  return shared;
}
