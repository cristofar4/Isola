import "server-only";

/**
 * Usage limiting for server-side processing.
 *
 * This in-memory fixed-window limiter is per server instance and resets on
 * restart. It exists so a public deployment with a provider key cannot be
 * drained by a single client. Replace `limiter` with a shared store (Redis,
 * a database, or your billing system's quota API) once accounts exist; the
 * route only depends on the `UsageLimiter` interface.
 */

export interface UsageDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface UsageLimiter {
  consume(subject: string): Promise<UsageDecision>;
}

class MemoryLimiter implements UsageLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  async consume(subject: string): Promise<UsageDecision> {
    const now = Date.now();
    let window = this.windows.get(subject);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(subject, window);
    }
    if (this.windows.size > 10_000) {
      for (const [key, value] of this.windows) if (value.resetAt <= now) this.windows.delete(key);
    }
    if (window.count >= this.limit) return { allowed: false, remaining: 0, resetAt: window.resetAt };
    window.count++;
    return { allowed: true, remaining: this.limit - window.count, resetAt: window.resetAt };
  }
}

const perHour = Number(process.env.ISOLA_REMOTE_RATE_LIMIT_PER_HOUR || 30);
export const limiter: UsageLimiter = new MemoryLimiter(
  Number.isFinite(perHour) && perHour > 0 ? perHour : 30,
  60 * 60 * 1000,
);

/**
 * Identify the caller. Today that's the client address; when authentication
 * is added, return the account id instead so limits follow the user.
 */
export function usageSubject(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous";
}
