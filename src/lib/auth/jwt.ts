/**
 * JWT token generation, verification, and refresh for EstateFlow CRM.
 *
 * Uses HS256 with a secret stored in JWT_SECRET env var.
 * Tokens expire after 15 minutes.
 */

import * as jwt from 'jsonwebtoken';
import type { JwtPayload as JwtPayloadType, UserRole } from '@/types/auth';

const DEFAULT_EXPIRY = 15 * 60; // 15 minutes in seconds
const REFRESH_EXPIRY_GRACE = 60; // 1 minute grace window for refresh

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

/**
 * Generate a signed JWT for the given user.
 *
 * @param userId   - UUID of the user
 * @param role     - User's role
 * @param tenantId - Tenant UUID the user belongs to
 * @returns Signed JWT string
 */
export function generateToken(
  userId: string,
  role: UserRole,
  tenantId: string,
): string {
  const secret = getSecret();
  const payload: Omit<JwtPayloadType, 'exp' | 'iat'> = {
    userId,
    role,
    tenantId,
  };

  return jwt.sign(payload, secret, {
    expiresIn: DEFAULT_EXPIRY,
    algorithm: 'HS256',
  });
}

/**
 * Verify and decode a JWT.
 *
 * @param token - JWT string to verify
 * @returns Decoded JwtPayload if valid, null otherwise
 */
export function verifyToken(token: string): JwtPayloadType | null {
  try {
    const secret = getSecret();
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload & JwtPayloadType;

    return {
      userId: decoded.userId as string,
      role: decoded.role as UserRole,
      tenantId: decoded.tenantId as string,
      iat: decoded.iat as number,
      exp: decoded.exp as number,
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
export function refreshToken(oldToken: string): string | null {
  // First try verifying with the normal check (still valid)
  const valid = verifyToken(oldToken);
  if (valid) {
    return generateToken(valid.userId, valid.role, valid.tenantId);
  }

  // If expired, try decoding without verification to check the grace window
  try {
    const decoded = jwt.decode(oldToken) as jwt.JwtPayload & JwtPayloadType;
    if (!decoded || !decoded.exp || !decoded.userId || !decoded.role || !decoded.tenantId) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const expiryGraceEnd = decoded.exp + REFRESH_EXPIRY_GRACE;

    if (now > expiryGraceEnd) {
      return null; // Token expired too long ago
    }

    // Verify the signature still checks out
    const secret = getSecret();
    try {
      jwt.verify(oldToken, secret, {
        algorithms: ['HS256'],
        ignoreExpiration: true,
      });
    } catch {
      return null; // Invalid signature
    }

    return generateToken(decoded.userId, decoded.role, decoded.tenantId);
  } catch {
    return null;
  }
}

export type { JwtPayloadType };
