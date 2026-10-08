/**
 * Inbound rate limiter — prevents message flood abuse.
 * Limits: 5 messages per 30 seconds per customer JID.
 */
export class InboundRateLimiter {
  private windows = new Map<string, number[]>();

  shouldProcess(customerJid: string): boolean {
    const now = Date.now();
    let timestamps = this.windows.get(customerJid) || [];

    // Clean timestamps older than 30 seconds
    timestamps = timestamps.filter(t => now - t < 30_000);

    if (timestamps.length >= 5) {
      this.windows.set(customerJid, timestamps);
      return false;
    }

    timestamps.push(now);
    this.windows.set(customerJid, timestamps);
    return true;
  }

  // Periodic cleanup of stale entries (call every 5 minutes)
  cleanup(): void {
    const now = Date.now();
    for (const [jid, timestamps] of this.windows.entries()) {
      const recent = timestamps.filter(t => now - t < 30_000);
      if (recent.length === 0) {
        this.windows.delete(jid);
      } else {
        this.windows.set(jid, recent);
      }
    }
  }
}

export const inboundRateLimiter = new InboundRateLimiter();

// Auto-cleanup every 5 minutes
setInterval(() => inboundRateLimiter.cleanup(), 5 * 60 * 1000);
