import { NextResponse, type NextRequest } from 'next/server';
import * as bcrypt from 'bcryptjs';
import { generateToken } from '@/lib/auth/jwt';
import type { LoginRequest, LoginResponse } from '@/types/auth';
import type { UserRole } from '@/types/auth';

/**
 * POST /api/auth/login
 *
 * Authenticates a user with email and password.
 * Returns a JWT token and basic user info.
 *
 * Body: { email: string, password: string }
 * Response: { token: string, user: { id, email, fullName, role, tenantId } }
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

    // Query user from the database
    // NOTE: In production, use supabase-js or Prisma client.
    // For the MVP we use a direct fetch-based approach.
    const user = await findUserByEmail(email);

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

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 },
      );
    }

    // Update last_login timestamp
    await updateLastLogin(user.id);

    // Generate JWT
    const token = generateToken(user.id, user.role as UserRole, user.tenant_id);

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

    return NextResponse.json(
      { success: true, data: responseData },
      { status: 200 },
    );
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
}

/**
 * Find a user by email.
 *
 * In production, replace with your ORM/DB client (Prisma, supabase-js, Drizzle).
 */
async function findUserByEmail(email: string): Promise<UserRow | null> {
  // This function should query the users table.
  // For now it's a stub that returns null — the actual DB integration
  // will be wired in when the DB client is set up.
  //
  // Example Prisma implementation:
  //   const user = await prisma.users.findUnique({ where: { email } });
  //   if (!user) return null;
  //   return user;
  //
  // Example supabase-js implementation:
  //   const { data, error } = await supabase
  //     .from('users')
  //     .select('*')
  //     .eq('email', email)
  //     .single();
  //   if (error || !data) return null;
  //   return data;

  void email; // Prevent unused var warning — remove when implementing DB client
  return null;
}

/**
 * Update the last_login timestamp for a user.
 */
async function updateLastLogin(userId: string): Promise<void> {
  // Example Prisma:
  //   await prisma.users.update({
  //     where: { id: userId },
  //     data: { last_login: new Date() },
  //   });
  void userId; // Prevent unused var warning — remove when implementing DB client
}
