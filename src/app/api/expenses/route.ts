// ============================================================================
// EstateFlow CRM — Expenses List & Create API
// GET  /api/expenses      — List expenses with pagination, filters
// POST /api/expenses      — Create a new expense
// Phase 6: Supporting Modules — Agent-6-2-Deals-Commissions
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { buildPaginationParams } from '@/lib/types';
import {
  getExpenses,
  createExpense,
  getExpenseStats,
  type ExpenseFilters,
  EXPENSE_CATEGORIES,
} from '@/lib/expenses/queries';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logCreate } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const expenseCategoryValues = EXPENSE_CATEGORIES as unknown as [string, ...string[]];

const createExpenseSchema = z.object({
  category: z.enum(expenseCategoryValues, { errorMap: () => ({ message: `Invalid category. Allowed: ${EXPENSE_CATEGORIES.join(', ')}` }) }),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().max(2000).nullable().optional(),
  expense_date: z.string().optional(),
  paid_by: z.string().uuid().nullable().optional(),
  receipt_url: z.string().url().nullable().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional().default('pending'),
});

export type CreateExpenseBody = z.infer<typeof createExpenseSchema>;

// ---------------------------------------------------------------------------
// GET /api/expenses
// ---------------------------------------------------------------------------

/**
 * GET /api/expenses
 *
 * Query parameters:
 *   page, limit              — Pagination
 *   category                 — Filter by category
 *   user_id                  — Filter by user
 *   paid_by                  — Filter by payer
 *   status                   — Filter by status (pending/approved/rejected)
 *   amount_min, amount_max   — Amount range
 *   expense_date_from/to     — Expense date range
 *   created_after/before     — Creation date range
 *   stats                    — Set to 'true' to get monthly stats
 *   month                    — Month string "YYYY-MM" for stats
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth headers ───────────────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
    const userRole = request.headers.get('x-user-role') as UserRole | null;
    const requestId = request.headers.get('x-session-id') || crypto.randomUUID();

    if (!userId || !tenantId) {
      return NextResponse.json(
        { success: false, data: null, error: 'Unauthorized — missing auth headers', meta: null },
        { status: 401 },
      );
    }

    // ── Rate limit ─────────────────────────────────────────────────────────
    const { result: rateResult, headers: rateHeaders } = await withRateLimit(
      request,
      'user',
      userId,
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        { success: false, data: null, error: 'Too many requests', meta: null },
        { status: 429, headers: rateHeaders },
      );
    }

    // ── Parse query params ──────────────────────────────────────────────────
    const { searchParams } = request.nextUrl;
    const stats = searchParams.get('stats') === 'true';

    // If stats mode, return expense statistics
    if (stats) {
      const month = searchParams.get('month') || undefined;
      const expenseStats = await withTenantContext(
        tenantId, userId, userRole || 'agent',
        () => getExpenseStats(tenantId, month),
      );

      return NextResponse.json(
        { success: true, data: expenseStats, error: null, meta: null },
        { status: 200, headers: { ...rateHeaders, 'X-Request-Id': requestId } },
      );
    }

    // Normal list mode
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const pagination = buildPaginationParams(page, limit);

    const filters: ExpenseFilters = {};

    if (searchParams.get('category')) filters.category = searchParams.get('category')!;
    if (searchParams.get('user_id')) filters.user_id = searchParams.get('user_id')!;
    if (searchParams.get('paid_by')) filters.paid_by = searchParams.get('paid_by')!;
    if (searchParams.get('status')) filters.status = searchParams.get('status')!;
    if (searchParams.get('amount_min')) filters.amount_min = parseFloat(searchParams.get('amount_min')!);
    if (searchParams.get('amount_max')) filters.amount_max = parseFloat(searchParams.get('amount_max')!);
    if (searchParams.get('expense_date_from')) filters.expense_date_from = searchParams.get('expense_date_from')!;
    if (searchParams.get('expense_date_to')) filters.expense_date_to = searchParams.get('expense_date_to')!;
    if (searchParams.get('created_after')) filters.created_after = searchParams.get('created_after')!;
    if (searchParams.get('created_before')) filters.created_before = searchParams.get('created_before')!;

    // Validate status value if provided
    if (filters.status && !['pending', 'approved', 'rejected'].includes(filters.status)) {
      return NextResponse.json(
        { success: false, data: null, error: 'Invalid status. Allowed: pending, approved, rejected', meta: null },
        { status: 400 },
      );
    }

    // ── Execute ───────────────────────────────────────────────────────────
    const result = await withTenantContext(
      tenantId, userId, userRole || 'agent',
      () => getExpenses(tenantId, filters, pagination),
    );

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        error: null,
        meta: result.meta,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/expenses] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/expenses
// ---------------------------------------------------------------------------

/**
 * POST /api/expenses
 *
 * Creates a new expense record.
 *
 * Body: CreateExpenseBody (see Zod schema above)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth headers ───────────────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
    const userRole = request.headers.get('x-user-role') as UserRole | null;
    const requestId = request.headers.get('x-session-id') || crypto.randomUUID();
    const clientIp = extractClientIp(request);
    const userAgent = request.headers.get('user-agent') || null;

    if (!userId || !tenantId) {
      return NextResponse.json(
        { success: false, data: null, error: 'Unauthorized — missing auth headers', meta: null },
        { status: 401 },
      );
    }

    // ── Rate limit ─────────────────────────────────────────────────────────
    const { result: rateResult, headers: rateHeaders } = await withRateLimit(
      request,
      'user',
      userId,
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        { success: false, data: null, error: 'Too many requests', meta: null },
        { status: 429, headers: rateHeaders },
      );
    }

    // ── Parse & validate body ──────────────────────────────────────────────
    const body = await request.json();
    const parsed = createExpenseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
          meta: null,
        },
        { status: 400 },
      );
    }

    // ── Execute ────────────────────────────────────────────────────────────
    const expense = await withTenantContext(
      tenantId, userId, userRole || 'agent',
      () => createExpense({ ...parsed.data, user_id: userId }, tenantId),
    );

    // ── Audit log ─────────────────────────────────────────────────────────
    await logCreate(
      'expense',
      expense.id,
      {
        category: expense.category,
        amount: expense.amount,
        status: expense.status,
      },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: expense,
        error: null,
        meta: null,
      },
      {
        status: 201,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/expenses] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
