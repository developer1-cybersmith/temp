/**
 * Per-session rate limiter to prevent WhatsApp bans.
 * Token bucket: 1 message per INTERVAL_MS per session.
 */
export class RateLimiter {
  private lastSent = new Map<string, number>();
  private queues = new Map<string, Array<() => void>>();
  private readonly intervalMs: number;

  constructor(intervalMs = 3000) {
    this.intervalMs = intervalMs;
  }

  /** Wait until it's safe to send a message for this session */
  async waitForSlot(sessionId: string): Promise<void> {
    const now = Date.now();
    const last = this.lastSent.get(sessionId) || 0;
    const elapsed = now - last;

    if (elapsed >= this.intervalMs) {
      this.lastSent.set(sessionId, now);
      return;
    }

    const waitTime = this.intervalMs - elapsed;
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        this.lastSent.set(sessionId, Date.now());
        resolve();
      }, waitTime);
    });
  }

  /** Check if sending is allowed right now (non-blocking) */
  canSend(sessionId: string): boolean {
    const last = this.lastSent.get(sessionId) || 0;
    return Date.now() - last >= this.intervalMs;
  }

  /** Remove a session's rate limit state */
  clearSession(sessionId: string): void {
    this.lastSent.delete(sessionId);
    this.queues.delete(sessionId);
  }
}

export const rateLimiter = new RateLimiter(3000);
