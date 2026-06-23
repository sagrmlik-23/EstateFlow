/**
 * Token Blacklist (in-memory) for JWT revocation.
 *
 * When a user logs out, we add the token's JTI (JWT ID) to this Set.
 * The middleware checks incoming tokens against this blacklist.
 *
 * MVP: In-memory Set (lost on server restart).
 * Production: Use a Redis SET with TTL matching token expiry.
 */

// ---------------------------------------------------------------------------
// In-memory blacklist store
// ---------------------------------------------------------------------------

/** Set of revoked JWT IDs (jti claims). */
const revokedTokens = new Set<string>();

/** TTL: automatically clean entries older than 30 minutes (15 min token expiry x2) */
const CLEANUP_INTERVAL_MS = 300000; // 5 minutes
const MAX_AGE_MS = 900000; // 15 minutes

// Map jti -> revokedAt timestamp for TTL-based cleanup
const revokedWithTimestamp = new Map<string, number>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [jti, revokedAt] of revokedWithTimestamp) {
      if (now - revokedAt > MAX_AGE_MS) {
        revokedTokens.delete(jti);
        revokedWithTimestamp.delete(jti);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  if (cleanupTimer && typeof (cleanupTimer as unknown as { unref?: () => void }).unref === 'function') {
    (cleanupTimer as unknown as { unref: () => void }).unref();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Revoke a JWT by its JTI (JWT ID).
 *
 * @param jti - The JWT ID claim value
 */
export function revokeToken(jti: string): void {
  ensureCleanup();
  revokedTokens.add(jti);
  revokedWithTimestamp.set(jti, Date.now());
}

/**
 * Check if a JWT is revoked.
 *
 * @param jti - The JWT ID claim value
 * @returns `true` if the token has been revoked
 */
export function isTokenRevoked(jti: string): boolean {
  return revokedTokens.has(jti);
}

/**
 * Get the number of revoked tokens currently tracked.
 */
export function getRevokedCount(): number {
  return revokedTokens.size;
}

/**
 * Clear all revoked tokens (useful for testing).
 */
export function clearBlacklist(): void {
  revokedTokens.clear();
  revokedWithTimestamp.clear();
}
