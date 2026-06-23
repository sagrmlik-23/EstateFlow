import { NextResponse, type NextRequest } from 'next/server';
import * as bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { generateToken } from '@/lib/auth/jwt';
import type { RegisterRequest, RegisterResponse } from '@/types/auth';

/**
 * POST /api/auth/register
 *
 * Creates a new tenant with an initial admin user.
 * The first user is always created with the 'tenant_admin' role.
 *
 * Body: {
 *   tenantName: string,
 *   tenantSlug: string,
 *   adminEmail: string,
 *   adminPassword: string,
 *   adminName: string
 * }
 *
 * Response: { token: string, tenantId: string, user: UserInfo }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as RegisterRequest;

    // ── Validation ───────────────────────────────────────────────────────
    const validationError = validateRegistration(body);
    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 },
      );
    }

    const email = body.adminEmail.toLowerCase().trim();
    const slug = body.tenantSlug.toLowerCase().trim();

    // ── Check for existing tenant slug ────────────────────────────────────
    const existingTenant = await findTenantBySlug(slug);
    if (existingTenant) {
      return NextResponse.json(
        { success: false, error: 'A tenant with this slug already exists' },
        { status: 409 },
      );
    }

    // ── Check for existing email across tenants ──────────────────────────
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'A user with this email already exists' },
        { status: 409 },
      );
    }

    // ── Hash password ────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(body.adminPassword, 12);

    // ── Create tenant ────────────────────────────────────────────────────
    const tenantId = crypto.randomUUID();
    const now = new Date().toISOString();

    const tenantCreated = await createTenant({
      id: tenantId,
      name: body.tenantName,
      slug: slug,
      created_at: now,
      updated_at: now,
    });

    if (!tenantCreated) {
      return NextResponse.json(
        { success: false, error: 'Failed to create tenant' },
        { status: 500 },
      );
    }

    // ── Create admin user ────────────────────────────────────────────────
    const userId = crypto.randomUUID();

    const userCreated = await createUser({
      id: userId,
      tenant_id: tenantId,
      email: email,
      password_hash: passwordHash,
      full_name: body.adminName,
      role: 'tenant_admin',
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    if (!userCreated) {
      // Attempt rollback of tenant creation (best-effort)
      await deleteTenant(tenantId).catch(() => {});
      return NextResponse.json(
        { success: false, error: 'Failed to create admin user' },
        { status: 500 },
      );
    }

    // ── Generate JWT ─────────────────────────────────────────────────────
    const token = await generateToken(userId, 'tenant_admin', tenantId);

    const responseData: RegisterResponse = {
      token,
      tenantId,
      user: {
        id: userId,
        email: email,
        fullName: body.adminName,
        role: 'tenant_admin',
        tenantId,
      },
    };

    const response = NextResponse.json(
      { success: true, data: responseData },
      { status: 201 },
    );

    // Set JWT as HttpOnly Secure SameSite=Strict cookie
    const cookieName = 'estateflow-jwt';
    const cookieMaxAge = 15 * 60; // 15 minutes
    response.headers.set(
      'Set-Cookie',
      `${cookieName}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${cookieMaxAge}`,
    );

    return response;
  } catch (error) {
    console.error('[auth/register]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ─── Validation ────────────────────────────────────────────────────────────

function validateRegistration(body: Partial<RegisterRequest>): string | null {
  if (!body.tenantName || typeof body.tenantName !== 'string' || body.tenantName.trim().length < 2) {
    return 'Tenant name must be at least 2 characters';
  }
  if (!body.tenantSlug || typeof body.tenantSlug !== 'string') {
    return 'Tenant slug is required';
  }
  if (!/^[a-z0-9-]{2,50}$/.test(body.tenantSlug)) {
    return 'Tenant slug must be 2-50 characters, lowercase alphanumeric with hyphens';
  }
  if (!body.adminEmail || typeof body.adminEmail !== 'string') {
    return 'Admin email is required';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.adminEmail)) {
    return 'Invalid email format';
  }
  if (!body.adminPassword || typeof body.adminPassword !== 'string') {
    return 'Admin password is required';
  }
  // Minimum complexity: 8+ chars, at least 1 uppercase, 1 number, 1 special
  if (body.adminPassword.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!/[A-Z]/.test(body.adminPassword)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[0-9]/.test(body.adminPassword)) {
    return 'Password must contain at least one number';
  }
  if (!/[^A-Za-z0-9]/.test(body.adminPassword)) {
    return 'Password must contain at least one special character';
  }
  // Cap password length to 128 bytes for bcrypt
  const passwordBytes = new TextEncoder().encode(body.adminPassword);
  if (passwordBytes.length > 128) {
    return 'Password must be at most 128 bytes';
  }
  if (!body.adminName || typeof body.adminName !== 'string' || body.adminName.trim().length < 2) {
    return 'Admin name must be at least 2 characters';
  }
  return null;
}

// ─── Database helpers ────────────────────────────────────────────────────

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
 * Find a tenant by slug. Returns { id } if found, null otherwise.
 */
async function findTenantBySlug(slug: string): Promise<{ id: string } | null> {
  const supabase = getDb();
  const { data, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (error || !data) return null;
  return data as { id: string };
}

/**
 * Find a user by email. Returns { id } if found, null otherwise.
 */
async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  const supabase = getDb();
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (error || !data) return null;
  return data as { id: string };
}

/**
 * Create a new tenant. Returns true on success.
 */
async function createTenant(tenant: TenantRow): Promise<boolean> {
  const supabase = getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from('tenants')
    .insert(tenant as any);

  return !error;
}

/**
 * Create a new user. Returns true on success.
 */
async function createUser(user: UserRow): Promise<boolean> {
  const supabase = getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from('users')
    .insert(user as any);

  return !error;
}

/**
 * Delete a tenant by ID (best-effort rollback).
 */
async function deleteTenant(tenantId: string): Promise<void> {
  const supabase = getDb();
  await supabase
    .from('tenants')
    .delete()
    .eq('id', tenantId);
}
