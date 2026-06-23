import { NextResponse, type NextRequest } from 'next/server';
import * as bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { generateToken } from '@/lib/auth/jwt';
import type { LoginRequest, LoginResponse } from '@/types/auth';
import type { UserRole } from '@/types/auth';

const COOKIE_NAME = 'estateflow-jwt';
const COOKIE_MAX_AGE = 15 * 60; // 15 minutes in seconds

/**
 * POST /api/auth/login
 *
 * Authenticates a user with email and password.
 * Returns user info and sets JWT as HttpOnly Secure SameSite=Strict cookie.
 *
 * Body: { email: string, password: string }
 * Response: { user: { id, email, fullName, role, tenantId } }
 *   + Set-Cookie: estateflow-jwt=<token>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=900
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as LoginRequest;

    if (!body.email || !body.password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 },
      );
    }

    const email = body.email.toLowerCase().trim();
    const password = body.password;

    // Cap password length to 128 bytes to prevent bcrypt truncation DoS
    const passwordBytes = new TextEncoder().encode(password);
    if (passwordBytes.length > 128) {
      return NextResponse.json(
        { success: false, error: 'Password must be at most 128 bytes' },
        { status: 400 },
      );
    }

    // Query user from the database (includes lockout tracking fields)
    const user = await findUserByEmail(email);

    // ── Timing-attack resistant password verification ──────────────────────
    // Always run bcrypt.compare so response time doesn't leak whether the
    // account exists. Use a dummy hash when the user isn't found.
    const DUMMY_HASH = '$2a$12$LJ3m4ys3Wk0mQKMFDlVpXOm1xqVzPqWmNkJs3h4Yz5Xz5Xz5Xz5Xz';
    const hashToCheck = user ? user.password_hash : DUMMY_HASH;
    const passwordValid = await bcrypt.compare(password, hashToCheck);

    // ── Check lockout ─────────────────────────────────────────────────────
    if (user) {
      // Check if account is temporarily locked
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        return NextResponse.json(
          { success: false, error: 'Account is temporarily locked. Try again later.' },
          { status: 423 },
        );
      }
    }

    // ── Validate user existence and status ─────────────────────────────────
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 },
      );
    }

    if (!user.is_active) {
      return NextResponse.json(
        { success: false, error: 'Account is deactivated' },
        { status: 403 },
      );
    }

    // ── Handle failed login ───────────────────────────────────────────────
    if (!passwordValid) {
      const attempts = (user.failed_login_attempts ?? 0) + 1;
      const LOCKOUT_THRESHOLD = 5;
      const LOCKOUT_DURATION_MINUTES = 15;

      if (attempts >= LOCKOUT_THRESHOLD) {
        await updateFailedLoginAttempts(user.id, attempts, LOCKOUT_DURATION_MINUTES);
        return NextResponse.json(
          { success: false, error: 'Account locked after too many failed attempts. Try again in 15 minutes.' },
          { status: 423 },
        );
      }

      await updateFailedLoginAttempts(user.id, attempts);
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 },
      );
    }

    // ── Successful login — reset failed attempts, update last_login ────────
    await onSuccessfulLogin(user.id);

    // ── Generate JWT ──────────────────────────────────────────────────────
    const token = await generateToken(user.id, user.role as UserRole, user.tenant_id);

    const responseData: LoginResponse = {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role as UserRole,
        tenantId: user.tenant_id,
      },
    };

    const response = NextResponse.json(
      { success: true, data: responseData },
      { status: 200 },
    );

    // Set JWT as HttpOnly Secure SameSite=Strict cookie
    response.headers.set(
      'Set-Cookie',
      `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE}`,
    );

    return response;
  } catch (error) {
    console.error('[auth/login]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ─── Database helpers ──────────────────────────────────────────────────────

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: string;
  tenant_id: string;
  is_active: boolean;
  failed_login_attempts?: number;
  locked_until?: string;
}

// ── Supabase client singleton ─────────────────────────────────────────────

let _supabase: ReturnType<typeof createClient> | null = null;

function getDb() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.',
    );
  }

  _supabase = createClient(url, key);
  return _supabase;
}

/**
 * Find a user by email. Returns null if not found.
 * Also fetches lockout tracking fields.
 */
async function findUserByEmail(email: string): Promise<UserRow | null> {
  const supabase = getDb();
  const { data, error } = await supabase
    .from('users')
    .select('id, email, password_hash, full_name, role, tenant_id, is_active, failed_login_attempts, locked_until')
    .eq('email', email)
    .single();

  if (error || !data) return null;
  return data as UserRow;
}

/**
 * Update failed login attempts counter and optionally lock the account.
 */
async function updateFailedLoginAttempts(
  userId: string,
  attempts: number,
  lockoutDurationMinutes?: number,
): Promise<void> {
  const supabase = getDb();
  const updateData: Record<string, unknown> = {
    failed_login_attempts: attempts,
  };

  if (lockoutDurationMinutes !== undefined) {
    const lockedUntil = new Date(Date.now() + lockoutDurationMinutes * 60 * 1000).toISOString();
    updateData.locked_until = lockedUntil;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('users')
    .update(updateData)
    .eq('id', userId);
}

/**
 * Reset failed login attempts and update last_login timestamp on successful login.
 */
async function onSuccessfulLogin(userId: string): Promise<void> {
  const supabase = getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('users')
    .update({
      failed_login_attempts: 0,
      locked_until: null,
      last_login: new Date().toISOString(),
    })
    .eq('id', userId);
}
