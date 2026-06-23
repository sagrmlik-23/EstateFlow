import { NextResponse, type NextRequest } from 'next/server';
import { refreshToken } from '@/lib/auth/jwt';

/**
 * POST /api/auth/refresh
 *
 * Refreshes an existing JWT token (still-valid or recently-expired).
 * Returns a new token with a fresh 15-minute expiry.
 *
 * Headers: Authorization: Bearer <token>
 * Response: { token: string, user: { id, email, fullName, role, tenantId } }
 */
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

    const newToken = await refreshToken(token);

    if (!newToken) {
      return NextResponse.json(
        { success: false, error: 'Token expired or invalid — please log in again' },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { success: true, data: { token: newToken } },
      { status: 200 },
    );
  } catch (error) {
    console.error('[auth/refresh]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
