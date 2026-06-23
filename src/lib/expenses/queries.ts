// ============================================================================
// EstateFlow CRM — Expense Management Queries (Data Access Layer)
// Phase 6: Supporting Modules — Agent-6-2-Deals-Commissions
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import type { PaginationParams, PaginationMeta } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const EXPENSE_CATEGORIES = [
  'marketing',
  'travel',
  'utilities',
  'office_supplies',
  'salary',
  'commission',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpenseRow {
  id: string;
  tenant_id: string;
  user_id: string;
  category: string;
  amount: number;
  description: string | null;
  expense_date: string;
  paid_by: string | null;
  receipt_url: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseInput {
  user_id: string;
  category: string;
  amount: number;
  description?: string | null;
  expense_date?: string;
  paid_by?: string | null;
  receipt_url?: string | null;
  status?: string;
}

export interface ExpenseFilters {
  category?: string;
  user_id?: string;
  paid_by?: string;
  status?: string;
  amount_min?: number;
  amount_max?: number;
  expense_date_from?: string;
  expense_date_to?: string;
  created_after?: string;
  created_before?: string;
}

export interface ExpenseStats {
  total_expenses: number;
  total_amount: number;
  by_category: Record<string, number>;
  by_status: Record<string, number>;
  pending_count: number;
  pending_amount: number;
  approved_count: number;
  approved_amount: number;
}

// ---------------------------------------------------------------------------
// Supabase client (lazy init)
// ---------------------------------------------------------------------------

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.',
    );
  }

  supabaseClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return supabaseClient;
}

// ---------------------------------------------------------------------------
// 1. createExpense — Create a new expense record
// ---------------------------------------------------------------------------

/**
 * Create a new expense entry.
 */
export async function createExpense(
  data: CreateExpenseInput,
  tenantId: string,
): Promise<ExpenseRow> {
  const supabase = getSupabase();

  const insertData: Record<string, any> = {
    tenant_id: tenantId,
    category: data.category,
    amount: data.amount,
    description: data.description ?? null,
    expense_date: data.expense_date ?? new Date().toISOString().split('T')[0],
    paid_by: data.paid_by ?? data.user_id,
    receipt_url: data.receipt_url ?? null,
    status: data.status ?? 'pending',
  };

  const { data: result, error } = await (supabase.from('expenses') as any)
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[expenses/queries] createExpense error:', error);
    throw new Error(`Failed to create expense: ${error.message}`);
  }

  return result as ExpenseRow;
}

// ---------------------------------------------------------------------------
// 2. getExpenses — Paginated expense list with filters
// ---------------------------------------------------------------------------

/**
 * Retrieve paginated expenses for a tenant with optional filters.
 */
export async function getExpenses(
  tenantId: string,
  filters: ExpenseFilters = {},
  pagination: PaginationParams = { page: 1, limit: 20, offset: 0 },
): Promise<{ data: ExpenseRow[]; meta: PaginationMeta }> {
  const supabase = getSupabase();

  let query = supabase
    .from('expenses')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  // Apply filters
  if (filters.category) {
    query = query.eq('category', filters.category);
  }
  if (filters.user_id) {
    query = query.eq('user_id', filters.user_id);
  }
  if (filters.paid_by) {
    query = query.eq('paid_by', filters.paid_by);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.amount_min !== undefined) {
    query = query.gte('amount', filters.amount_min);
  }
  if (filters.amount_max !== undefined) {
    query = query.lte('amount', filters.amount_max);
  }
  if (filters.expense_date_from) {
    query = query.gte('expense_date', filters.expense_date_from);
  }
  if (filters.expense_date_to) {
    query = query.lte('expense_date', filters.expense_date_to);
  }
  if (filters.created_after) {
    query = query.gte('created_at', filters.created_after);
  }
  if (filters.created_before) {
    query = query.lte('created_at', filters.created_before);
  }

  // Sorting & pagination
  query = query
    .order('created_at', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[expenses/queries] getExpenses error:', error);
    throw new Error(`Failed to fetch expenses: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    data: (data as ExpenseRow[]) || [],
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      total_pages: Math.ceil(total / pagination.limit),
    },
  };
}

// ---------------------------------------------------------------------------
// 3. approveExpense — Approve or reject an expense
// ---------------------------------------------------------------------------

/**
 * Update the status of an expense (approve / reject).
 * Sets approved_by and approved_at when status is 'approved'.
 */
export async function approveExpense(
  expenseId: string,
  approvedBy: string,
  status: 'approved' | 'rejected' = 'approved',
): Promise<ExpenseRow> {
  const supabase = getSupabase();

  const now = new Date().toISOString();

  const updateData: Record<string, any> = {
    status,
    updated_at: now,
  };

  if (status === 'approved') {
    updateData.approved_by = approvedBy;
    updateData.approved_at = now;
  }

  const { data: result, error } = await (supabase.from('expenses') as any)
    .update(updateData)
    .eq('id', expenseId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error(`Expense not found: ${expenseId}`);
    }
    console.error('[expenses/queries] approveExpense error:', error);
    throw new Error(`Failed to ${status} expense: ${error.message}`);
  }

  return result as ExpenseRow;
}

// ---------------------------------------------------------------------------
// 4. getExpenseStats — Monthly expense totals by category
// ---------------------------------------------------------------------------

/**
 * Compute expense statistics for a tenant within a given month.
 *
 * @param tenantId - Tenant UUID
 * @param month    - ISO month string, e.g. "2026-06". Defaults to current month.
 */
export async function getExpenseStats(
  tenantId: string,
  month?: string,
): Promise<ExpenseStats> {
  const supabase = getSupabase();

  // Default to current month if not provided
  const targetMonth = month || new Date().toISOString().slice(0, 7);
  const [yearStr, monthStr] = targetMonth.split('-');
  const year = parseInt(yearStr!, 10);
  const m = parseInt(monthStr!, 10);
  const startDate = `${year}-${String(m).padStart(2, '0')}-01`;
  const endDate = new Date(year, m, 0).toISOString().split('T')[0];

  const { data, error } = await (supabase
    .from('expenses') as any)
    .select('category, amount, status')
    .eq('tenant_id', tenantId)
    .gte('expense_date', startDate)
    .lte('expense_date', endDate);

  if (error) {
    console.error('[expenses/queries] getExpenseStats error:', error);
    throw new Error(`Failed to fetch expense stats: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{ category: string; amount: number; status: string }>;

  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  let totalAmount = 0;
  let pendingCount = 0;
  let pendingAmount = 0;
  let approvedCount = 0;
  let approvedAmount = 0;

  for (const row of rows) {
    const cat = row.category || 'other';
    const amt = Number(row.amount) || 0;
    const st = row.status || 'pending';

    byCategory[cat] = (byCategory[cat] ?? 0) + amt;
    byStatus[st] = (byStatus[st] ?? 0) + 1;
    totalAmount += amt;

    if (st === 'pending') {
      pendingCount++;
      pendingAmount += amt;
    } else if (st === 'approved') {
      approvedCount++;
      approvedAmount += amt;
    }
  }

  return {
    total_expenses: rows.length,
    total_amount: totalAmount,
    by_category: byCategory,
    by_status: byStatus,
    pending_count: pendingCount,
    pending_amount: pendingAmount,
    approved_count: approvedCount,
    approved_amount: approvedAmount,
  };
}
