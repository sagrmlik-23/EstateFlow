/**
 * POST /api/auth/logout
 *
 * Revokes the current JWT by adding its JTI to the token blacklist.
 * Also clears the estateflow-jwt cookie.
 *
 * Headers: Authorization: Bearer <token>
 * Response: { success: true, data: { message: string } }
 */
import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { revokeToken } from '@/lib/auth/tokenBlacklist';

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid Authorization header' },
        { status: 401 },
      );
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is empty' },
        { status: 401 },
      );
    }

    // Extract JTI from the token (even if expired, we still want to blacklist it)
    try {
      const secret = getSecret();
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ['HS256'],
        clockTolerance: 300, // Allow 5 minutes of clock skew for revocation
      });

      const jti = payload.jti as string | undefined;
      if (jti) {
        revokeToken(jti);
      }
    } catch {
      // If the token is completely invalid, we still clear the cookie
      // but can't extract JTI — that's fine, the token is already unusable
    }

    // Clear the auth cookie
    const response = NextResponse.json(
      { success: true, data: { message: 'Logged out successfully' } },
      { status: 200 },
    );

    response.headers.set(
      'Set-Cookie',
      'estateflow-jwt=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    );

    return response;
  } catch (error) {
    console.error('[auth/logout]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
