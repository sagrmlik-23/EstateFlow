// ============================================================================
// EstateFlow CRM — Task CRUD API
// GET  /api/tasks    — List tasks with filters & pagination
// POST /api/tasks    — Create a new task
// Phase 6 — Documents, Forms, Tasks v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { buildPaginationParams } from '@/lib/types';
import {
  getTasks,
  createTask,
  getMyTasks,
  getOverdueTasks,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/lib/tasks/queries';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logCreate } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().max(5000).nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional().default('medium'),
  status: z.enum(TASK_STATUSES).optional().default('pending'),
  relatedTo: z.string().uuid().nullable().optional(),
  relatedType: z.enum(['lead', 'deal']).nullable().optional(),
});

export type CreateTaskBody = z.infer<typeof createTaskSchema>;

// ---------------------------------------------------------------------------
// GET /api/tasks
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
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

    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const pagination = buildPaginationParams(page, limit);

    // Special endpoints
    const view = searchParams.get('view');

    if (view === 'my') {
      const result = await withTenantContext(
        tenantId,
        userId,
        userRole || 'agent',
        () => getMyTasks(userId, tenantId, undefined, pagination),
      );
      return NextResponse.json(
        { success: true, data: result.data, error: null, meta: result.meta },
        { status: 200, headers: { ...rateHeaders, 'X-Request-Id': requestId } },
      );
    }

    if (view === 'overdue') {
      const result = await withTenantContext(
        tenantId,
        userId,
        userRole || 'agent',
        () => getOverdueTasks(tenantId, pagination),
      );
      return NextResponse.json(
        { success: true, data: result.data, error: null, meta: result.meta },
        { status: 200, headers: { ...rateHeaders, 'X-Request-Id': requestId } },
      );
    }

    // Standard filters
    const filters: Record<string, string> = {};
    const status = searchParams.get('status');
    if (status && (TASK_STATUSES as readonly string[]).includes(status)) {
      filters.status = status;
    }
    const priority = searchParams.get('priority');
    if (priority && (TASK_PRIORITIES as readonly string[]).includes(priority)) {
      filters.priority = priority;
    }
    if (searchParams.get('assigned_to')) filters.assigned_to = searchParams.get('assigned_to')!;
    if (searchParams.get('lead_id')) filters.lead_id = searchParams.get('lead_id')!;
    if (searchParams.get('deal_id')) filters.deal_id = searchParams.get('deal_id')!;

    const result = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getTasks(tenantId, filters, pagination),
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
    console.error('[api/tasks] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/tasks
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
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

    const body = await request.json();
    const parsed = createTaskSchema.safeParse(body);

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

    const task = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => createTask({ ...parsed.data, tenantId }, userId),
    );

    await logCreate(
      'task',
      task.id,
      {
        title: task.title,
        priority: task.priority,
        assigned_to: task.assigned_to,
        due_date: task.due_date,
      },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: task,
        error: null,
        meta: null,
      },
      {
        status: 201,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/tasks] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
