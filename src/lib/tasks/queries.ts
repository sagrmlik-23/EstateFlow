// ============================================================================
// EstateFlow CRM — Task Management Queries
// Phase 6 — Documents, Forms, Tasks v1.0.0
// ============================================================================
//
// Manages tasks for agents and teams. Each task is tenant-scoped and can
// be related to a lead, deal, or property.
//
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import type { PaginationParams, PaginationMeta } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type RelatedType = 'lead' | 'deal' | 'property' | null;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskRow {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  deal_id: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  tenantId: string;
  title: string;
  description?: string | null;
  assignedTo?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  relatedTo?: string | null;   // lead_id or deal_id
  relatedType?: RelatedType;   // 'lead' | 'deal' | null
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  assigned_to?: string | null;
  due_date?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
}

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigned_to?: string;
  lead_id?: string;
  deal_id?: string;
  due_before?: string;
  due_after?: string;
  created_after?: string;
  created_before?: string;
}

// ---------------------------------------------------------------------------
// Supabase client (lazy init)
// ---------------------------------------------------------------------------

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

  _supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _supabase;
}

// ---------------------------------------------------------------------------
// 1. createTask — Create a new task
// ---------------------------------------------------------------------------

export async function createTask(
  data: CreateTaskInput,
  createdByUserId: string,
): Promise<TaskRow> {
  const supabase = getDb();

  // Map relatedType/relatedTo to the appropriate DB columns
  let leadId: string | null = null;
  let dealId: string | null = null;

  if (data.relatedTo && data.relatedType === 'lead') {
    leadId = data.relatedTo;
  } else if (data.relatedTo && data.relatedType === 'deal') {
    dealId = data.relatedTo;
  } else if (data.relatedTo) {
    // If relatedTo is provided but no type, try to determine from context
    // Default to lead_id
    leadId = data.relatedTo;
  }

  const insertData: Record<string, any> = {
    tenant_id: data.tenantId,
    title: data.title,
    description: data.description ?? null,
    assigned_to: data.assignedTo ?? null,
    due_date: data.dueDate ?? null,
    priority: data.priority ?? 'medium',
    status: data.status ?? 'pending',
    lead_id: leadId,
    deal_id: dealId,
    created_by: createdByUserId,
  };

  const { data: result, error } = await (supabase.from('tasks') as any)
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[tasks/queries] createTask error:', error);
    throw new Error(`Failed to create task: ${error.message}`);
  }

  return result as TaskRow;
}

// ---------------------------------------------------------------------------
// 2. getTasks — Paginated task list with filters
// ---------------------------------------------------------------------------

export async function getTasks(
  tenantId: string,
  filters: TaskFilters = {},
  pagination: PaginationParams = { page: 1, limit: 20, offset: 0 },
  sortBy: string = 'created_at',
  sortDir: 'asc' | 'desc' = 'desc',
): Promise<{ data: TaskRow[]; meta: PaginationMeta }> {
  const supabase = getDb();

  let query = supabase
    .from('tasks')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  // Apply filters
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.priority) query = query.eq('priority', filters.priority);
  if (filters.assigned_to) query = query.eq('assigned_to', filters.assigned_to);
  if (filters.lead_id) query = query.eq('lead_id', filters.lead_id);
  if (filters.deal_id) query = query.eq('deal_id', filters.deal_id);
  if (filters.due_before) query = query.lte('due_date', filters.due_before);
  if (filters.due_after) query = query.gte('due_date', filters.due_after);
  if (filters.created_after) query = query.gte('created_at', filters.created_after);
  if (filters.created_before) query = query.lte('created_at', filters.created_before);

  query = query
    .order(sortBy, { ascending: sortDir === 'asc' })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[tasks/queries] getTasks error:', error);
    throw new Error(`Failed to fetch tasks: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    data: (data as TaskRow[]) || [],
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      total_pages: Math.ceil(total / pagination.limit),
    },
  };
}

// ---------------------------------------------------------------------------
// 3. getTaskById — Single task
// ---------------------------------------------------------------------------

export async function getTaskById(taskId: string): Promise<TaskRow | null> {
  const supabase = getDb();

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[tasks/queries] getTaskById error:', error);
    throw new Error(`Failed to fetch task: ${error.message}`);
  }

  return data as unknown as TaskRow;
}

// ---------------------------------------------------------------------------
// 4. updateTask — Update task fields
// ---------------------------------------------------------------------------

export async function updateTask(taskId: string, data: UpdateTaskInput, expectedUpdatedAt?: string): Promise<TaskRow> {
  const supabase = getDb();

  const updateData: Record<string, any> = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.assigned_to !== undefined) updateData.assigned_to = data.assigned_to;
  if (data.due_date !== undefined) updateData.due_date = data.due_date;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.status !== undefined) updateData.status = data.status;

  // If status changes to completed, set completed_at
  const newStatus = data.status as string | undefined;
  if (newStatus === 'completed') {
    updateData.completed_at = new Date().toISOString();
  } else if (newStatus !== undefined && newStatus !== 'completed') {
    updateData.completed_at = null;
  }

  updateData.updated_at = new Date().toISOString();

  let query = (supabase.from('tasks') as any)
    .update(updateData)
    .eq('id', taskId);

  if (expectedUpdatedAt) {
    query = query.eq('updated_at', expectedUpdatedAt);
  }

  const { data: result, error } = await query.select().single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error(`Task not found or conflict: ${taskId}`);
    }
    console.error('[tasks/queries] updateTask error:', error);
    throw new Error(`Failed to update task: ${error.message}`);
  }

  return result as TaskRow;
}

// ---------------------------------------------------------------------------
// 5. updateTaskStatus — Quick status update
// ---------------------------------------------------------------------------

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
): Promise<TaskRow> {
  return updateTask(taskId, { status });
}

// ---------------------------------------------------------------------------
// 6. deleteTask — Delete a task
// ---------------------------------------------------------------------------

export async function deleteTask(taskId: string): Promise<void> {
  const supabase = getDb();

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (error) {
    console.error('[tasks/queries] deleteTask error:', error);
    throw new Error(`Failed to delete task: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 7. getMyTasks — Current user's active tasks
// ---------------------------------------------------------------------------

export async function getMyTasks(
  userId: string,
  tenantId: string,
  status?: TaskStatus,
  pagination: PaginationParams = { page: 1, limit: 20, offset: 0 },
): Promise<{ data: TaskRow[]; meta: PaginationMeta }> {
  const supabase = getDb();

  let query = supabase
    .from('tasks')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('assigned_to', userId);

  if (status) {
    query = query.eq('status', status);
  } else {
    // Default: show pending and in_progress tasks
    query = query.in('status', ['pending', 'in_progress']);
  }

  query = query
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('priority', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[tasks/queries] getMyTasks error:', error);
    throw new Error(`Failed to fetch my tasks: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    data: (data as TaskRow[]) || [],
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      total_pages: Math.ceil(total / pagination.limit),
    },
  };
}

// ---------------------------------------------------------------------------
// 8. getOverdueTasks — Tasks past their due date and not completed/cancelled
// ---------------------------------------------------------------------------

export async function getOverdueTasks(
  tenantId: string,
  pagination: PaginationParams = { page: 1, limit: 50, offset: 0 },
): Promise<{ data: TaskRow[]; meta: PaginationMeta }> {
  const supabase = getDb();
  const now = new Date().toISOString();

  let query = supabase
    .from('tasks')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .lt('due_date', now)
    .not('status', 'in', '("completed","cancelled")');

  query = query
    .order('due_date', { ascending: true })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[tasks/queries] getOverdueTasks error:', error);
    throw new Error(`Failed to fetch overdue tasks: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    data: (data as TaskRow[]) || [],
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      total_pages: Math.ceil(total / pagination.limit),
    },
  };
}
