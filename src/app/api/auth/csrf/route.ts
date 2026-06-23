/**
 * GET /api/auth/csrf
 *
 * Returns a CSRF token for the double-submit cookie pattern.
 * Sets a non-HttpOnly cookie `csrf-token` and returns the same token in the response body.
 * The client must include this token in the `X-CSRF-Token` header for all
 * state-changing requests (POST, PATCH, PUT, DELETE).
 */

import { NextResponse } from 'next/server';
import { generateCsrfCookie } from '@/lib/security/csrf';

export async function GET(): Promise<NextResponse> {
  try {
    const { token, cookieHeader } = generateCsrfCookie();

    const response = NextResponse.json(
      { success: true, data: { csrfToken: token } },
      { status: 200 },
    );

    response.headers.set('Set-Cookie', cookieHeader);

    return response;
  } catch (error) {
    console.error('[auth/csrf]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
