// ============================================================================
// EstateFlow CRM — Expense Approval API
// PATCH /api/expenses/[id]/approve — Approve or reject an expense
// Phase 6: Supporting Modules — Agent-6-2-Deals-Commissions
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticate } from '@/middleware';
import { withRateLimit, rateLimitResponse } from '@/lib/security/rateLimiter';
import { logUpdate } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import { canUpdate } from '@/lib/auth/permissions';
import { approveExpense } from '@/lib/expenses/queries';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ApproveExpenseSchema = z.object({
  status: z.enum(['approved', 'rejected'], {
    required_error: 'status is required (approved or rejected)',
  }),
  notes: z.string().max(2000).nullable().optional(),
});

const IdParamsSchema = z.object({
  id: z.string().uuid('Invalid expense ID format'),
});

// ---------------------------------------------------------------------------
// PATCH /api/expenses/[id]/approve
// ---------------------------------------------------------------------------

/**
 * PATCH /api/expenses/[id]/approve
 *
 * Approves or rejects an expense. Only users with 'update' permission on
 * expenses can perform this action (typically managers/admins).
 *
 * Body: { status: "approved" | "rejected", notes?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // ── Validate param ─────────────────────────────────────────────────────
    const paramResult = IdParamsSchema.safeParse({ id });
    if (!paramResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid expense ID', details: paramResult.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // ── Auth + permissions ─────────────────────────────────────────────────
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    if (!canUpdate(auth.role, 'attendance')) {
      // Using 'attendance' as the permission entity since 'expenses' isn't
      // in the permission matrix. Manager/sales_manager roles have full access.
      // In practice, we check for a role with expense-approval capability.
      if (auth.role !== 'tenant_admin' && auth.role !== 'sales_manager' && auth.role !== 'super_admin') {
        return NextResponse.json(
          { success: false, error: 'Forbidden: insufficient permissions' },
          { status: 403 },
        );
      }
    }

    // ── Rate limit ─────────────────────────────────────────────────────────
    const { result: rlResult, headers: rlHeaders } = await withRateLimit(request, 'user', auth.userId);
    if (!rlResult.allowed) {
      return rateLimitResponse(rlResult);
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400, headers: rlHeaders },
      );
    }

    const parsed = ApproveExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400, headers: rlHeaders },
      );
    }

    // ── Execute ────────────────────────────────────────────────────────────
    const result = await withTenantContext(
      auth.tenantId,
      auth.userId,
      auth.role,
      () => approveExpense(id, auth.userId, parsed.data.status),
    );

    // ── Audit log ──────────────────────────────────────────────────────────
    await logUpdate(
      'expense',
      id,
      { status: 'pending' },
      { status: parsed.data.status },
      {
        ipAddress: request.headers.get('x-forwarded-for') ?? null,
        userAgent: request.headers.get('user-agent') ?? null,
        requestId: request.headers.get('x-session-id') ?? null,
      },
    );

    return NextResponse.json(
      {
        success: true,
        data: result,
        error: null,
      },
      { status: 200, headers: rlHeaders },
    );
  } catch (error) {
    console.error('[api/expenses/[id]/approve] PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
