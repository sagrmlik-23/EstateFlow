// ============================================================================
// EstateFlow CRM — Single Task CRUD API
// GET    /api/tasks/[id]  — Get task details
// PATCH  /api/tasks/[id]  — Update task fields / status
// DELETE /api/tasks/[id]  — Delete a task
// Phase 6 — Documents, Forms, Tasks v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getTaskById,
  updateTask,
  deleteTask,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/lib/tasks/queries';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logUpdate, logDelete } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const IdParamsSchema = z.object({
  id: z.string().uuid('Invalid task ID format'),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
});

export type UpdateTaskBody = z.infer<typeof updateTaskSchema>;

// ---------------------------------------------------------------------------
// GET /api/tasks/[id]
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // ── Validate param ─────────────────────────────────────────────────────
    const paramResult = IdParamsSchema.safeParse({ id });
    if (!paramResult.success) {
      return NextResponse.json(
        { success: false, data: null, error: 'Invalid task ID', meta: null },
        { status: 400 },
      );
    }

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

    const task = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getTaskById(id),
    );

    if (!task) {
      return NextResponse.json(
        { success: false, data: null, error: 'Task not found', meta: null },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: task,
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/tasks/:id] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/tasks/[id]
// ---------------------------------------------------------------------------

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
        { success: false, data: null, error: 'Invalid task ID', meta: null },
        { status: 400 },
      );
    }

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
    const parsed = updateTaskSchema.safeParse(body);

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

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { success: false, data: null, error: 'No fields provided to update', meta: null },
        { status: 400 },
      );
    }

    const oldTask = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getTaskById(id),
    );

    if (!oldTask) {
      return NextResponse.json(
        { success: false, data: null, error: 'Task not found', meta: null },
        { status: 404 },
      );
    }

    let updatedTask;
    try {
      updatedTask = await withTenantContext(
        tenantId,
        userId,
        userRole || 'agent',
        () => updateTask(id, parsed.data, oldTask.updated_at),
      );
    } catch (updateErr: any) {
      if (updateErr?.message?.includes('not found or conflict')) {
        return NextResponse.json(
          { success: false, data: null, error: 'Conflict — resource was modified by another request. Please reload and try again.', meta: null },
          { status: 409 },
        );
      }
      throw updateErr;
    }

    const changedFields: Record<string, unknown> = {};
    for (const key of Object.keys(parsed.data)) {
      const oldVal = (oldTask as unknown as Record<string, unknown>)[key];
      const newVal = (parsed.data as Record<string, unknown>)[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changedFields[key] = { from: oldVal, to: newVal };
      }
    }

    await logUpdate(
      'task',
      id,
      { ...changedFields },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: updatedTask,
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/tasks/:id] PATCH error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/tasks/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // ── Validate param ─────────────────────────────────────────────────────
    const paramResult = IdParamsSchema.safeParse({ id });
    if (!paramResult.success) {
      return NextResponse.json(
        { success: false, data: null, error: 'Invalid task ID', meta: null },
        { status: 400 },
      );
    }

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

    const task = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getTaskById(id),
    );

    if (!task) {
      return NextResponse.json(
        { success: false, data: null, error: 'Task not found', meta: null },
        { status: 404 },
      );
    }

    await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => deleteTask(id),
    );

    await logDelete(
      'task',
      id,
      { title: task.title, status: task.status, priority: task.priority },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: { id, deleted: true },
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/tasks/:id] DELETE error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
