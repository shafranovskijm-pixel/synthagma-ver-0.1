/**
 * Simple in-memory rate limiter for Edge Functions.
 * Uses a sliding window approach per user/IP.
 */

const requestLog = new Map<string, number[]>();

// Clean old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of requestLog.entries()) {
    const filtered = timestamps.filter(t => now - t < 60_000);
    if (filtered.length === 0) {
      requestLog.delete(key);
    } else {
      requestLog.set(key, filtered);
    }
  }
}, 300_000);

export interface RateLimitConfig {
  /** Max requests per window */
  maxRequests: number;
  /** Window size in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

/**
 * Check if a request is allowed under the rate limit.
 * @param key Unique identifier (e.g. userId, IP, or combined)
 * @param config Rate limit configuration
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  
  const timestamps = requestLog.get(key) || [];
  const windowStart = now - windowMs;
  const recentRequests = timestamps.filter(t => t >= windowStart);
  
  if (recentRequests.length >= config.maxRequests) {
    const oldestInWindow = Math.min(...recentRequests);
    const retryAfterSeconds = Math.ceil((oldestInWindow + windowMs - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }
  
  recentRequests.push(now);
  requestLog.set(key, recentRequests);
  
  return {
    allowed: true,
    remaining: config.maxRequests - recentRequests.length,
  };
}

/**
 * Create a 429 Too Many Requests response with CORS headers.
 */
export function rateLimitResponse(result: RateLimitResult, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please try again later.",
      retryAfterSeconds: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSeconds || 60),
      },
    }
  );
}
