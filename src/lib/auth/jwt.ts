/**
 * JWT token generation, verification, and refresh for EstateFlow CRM.
 *
 * Uses HS256 with a secret stored in JWT_SECRET env var.
 * Tokens expire after 15 minutes.
 *
 * Uses the 'jose' library (Edge-compatible, no Node crypto dependency).
 */

import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'crypto';
import type { JwtPayload as JwtPayloadType, UserRole } from '@/types/auth';
import { isTokenRevoked } from './tokenBlacklist';

const DEFAULT_EXPIRY = '15m';
const REFRESH_EXPIRY_GRACE = 60; // 1 minute grace window for refresh (seconds)

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Generate a signed JWT for the given user.
 *
 * @param userId   - UUID of the user
 * @param role     - User's role
 * @param tenantId - Tenant UUID the user belongs to
 * @returns Signed JWT string
 */
export async function generateToken(
  userId: string,
  role: UserRole,
  tenantId: string,
): Promise<string> {
  const secret = getSecret();

  return new SignJWT({ userId, role, tenantId, jti: randomUUID() })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(DEFAULT_EXPIRY)
    .setIssuedAt()
    .sign(secret);
}

/**
 * Verify and decode a JWT.
 *
 * @param token - JWT string to verify
 * @returns Decoded JwtPayload if valid, null otherwise
 */
export async function verifyToken(token: string): Promise<JwtPayloadType | null> {
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    });

    const jti = payload.jti as string | undefined;
    if (jti && isTokenRevoked(jti)) {
      return null; // Token has been revoked
    }

    return {
      userId: payload.userId as string,
      role: payload.role as UserRole,
      tenantId: payload.tenantId as string,
      jti: (payload.jti as string) || '',
      iat: payload.iat as number,
      exp: payload.exp as number,
    };
  } catch {
    return null;
  }
}

/**
 * Refresh a JWT by issuing a new one from an existing (still-valid or recently-expired) token.
 *
 * To be conservative, this only works if the token has expired no more than
 * `REFRESH_EXPIRY_GRACE` seconds ago. Otherwise returns null.
 *
 * @param oldToken - The existing (possibly expired) JWT
 * @returns A new signed JWT string, or null if refresh is not allowed
 */
export async function refreshToken(oldToken: string): Promise<string | null> {
  // First try verifying with the normal check (still valid)
  const valid = await verifyToken(oldToken);
  if (valid) {
    return generateToken(valid.userId, valid.role, valid.tenantId);
  }

  // If expired, try verifying with clock tolerance to check the grace window
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(oldToken, secret, {
      algorithms: ['HS256'],
      clockTolerance: REFRESH_EXPIRY_GRACE,
    });

    if (!payload.userId || !payload.role || !payload.tenantId) {
      return null;
    }

    return generateToken(
      payload.userId as string,
      payload.role as UserRole,
      payload.tenantId as string,
    );
  } catch {
    return null;
  }
}

export type { JwtPayloadType };
