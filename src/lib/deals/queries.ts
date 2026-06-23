// ============================================================================
// EstateFlow CRM — Deals Pipeline Queries (Data Access Layer)
// Phase 6: Supporting Modules — Agent-6-2-Deals-Commissions
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import type { PaginationParams, PaginationMeta } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Deal pipeline stages matching the deal table CHECK constraint. */
export const DEAL_STAGES = [
  'qualification',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DealRow {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  property_id: string | null;
  title: string;
  value: number;
  stage: string;
  probability: number | null;
  expected_close: string | null;
  assigned_to: string | null;
  notes: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDealInput {
  lead_id?: string | null;
  property_id?: string | null;
  title: string;
  value: number;
  stage?: string;
  probability?: number | null;
  expected_close?: string | null;
  assigned_to?: string | null;
  notes?: string | null;
}

export interface UpdateDealInput {
  title?: string;
  value?: number;
  stage?: string;
  probability?: number | null;
  expected_close?: string | null;
  assigned_to?: string | null;
  notes?: string | null;
}

export interface DealFilters {
  stage?: string;
  assigned_to?: string;
  lead_id?: string;
  property_id?: string;
  value_min?: number;
  value_max?: number;
  probability_min?: number;
  probability_max?: number;
  created_after?: string;
  created_before?: string;
  expected_close_before?: string;
  expected_close_after?: string;
}

export interface DealStats {
  pipeline_value: number;
  avg_deal_size: number;
  win_rate: number;
  total_deals: number;
  won_deals: number;
  lost_deals: number;
  by_stage: Record<string, number>;
  by_stage_value: Record<string, number>;
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
// 1. getDeals — Paginated deal pipeline with filters
// ---------------------------------------------------------------------------

/**
 * Retrieve paginated deals for a tenant, filtered by stage / agent / value.
 */
export async function getDeals(
  tenantId: string,
  filters: DealFilters = {},
  pagination: PaginationParams = { page: 1, limit: 20, offset: 0 },
): Promise<{ data: DealRow[]; meta: PaginationMeta }> {
  const supabase = getSupabase();

  let query = supabase
    .from('deals')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  // Apply filters
  if (filters.stage) {
    query = query.eq('stage', filters.stage);
  }
  if (filters.assigned_to) {
    query = query.eq('assigned_to', filters.assigned_to);
  }
  if (filters.lead_id) {
    query = query.eq('lead_id', filters.lead_id);
  }
  if (filters.property_id) {
    query = query.eq('property_id', filters.property_id);
  }
  if (filters.value_min !== undefined) {
    query = query.gte('value', filters.value_min);
  }
  if (filters.value_max !== undefined) {
    query = query.lte('value', filters.value_max);
  }
  if (filters.probability_min !== undefined) {
    query = query.gte('probability', filters.probability_min);
  }
  if (filters.probability_max !== undefined) {
    query = query.lte('probability', filters.probability_max);
  }
  if (filters.created_after) {
    query = query.gte('created_at', filters.created_after);
  }
  if (filters.created_before) {
    query = query.lte('created_at', filters.created_before);
  }
  if (filters.expected_close_before) {
    query = query.lte('expected_close', filters.expected_close_before);
  }
  if (filters.expected_close_after) {
    query = query.gte('expected_close', filters.expected_close_after);
  }

  // Sorting & pagination
  query = query
    .order('created_at', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[deals/queries] getDeals error:', error);
    throw new Error(`Failed to fetch deals: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    data: (data as DealRow[]) || [],
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      total_pages: Math.ceil(total / pagination.limit),
    },
  };
}

// ---------------------------------------------------------------------------
// 2. getDealById — Full deal details
// ---------------------------------------------------------------------------

/**
 * Get a single deal by ID, including lead and property info via join.
 */
export async function getDealById(dealId: string): Promise<DealRow | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('deals')
    .select(
      `
      *,
      lead:lead_id ( id, full_name, phone, email, status ),
      property:property_id ( id, title, price, property_type, location )
    `,
    )
    .eq('id', dealId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[deals/queries] getDealById error:', error);
    throw new Error(`Failed to fetch deal: ${error.message}`);
  }

  return data as unknown as DealRow;
}

// ---------------------------------------------------------------------------
// 3. createDeal — Create deal from qualified lead
// ---------------------------------------------------------------------------

/**
 * Create a new deal in the pipeline.
 */
export async function createDeal(
  data: CreateDealInput,
  tenantId: string,
  createdByUserId: string,
): Promise<DealRow> {
  const supabase = getSupabase();

  const insertData: Record<string, any> = {
    tenant_id: tenantId,
    title: data.title,
    value: data.value,
    stage: data.stage ?? 'qualification',
    probability: data.probability ?? null,
    expected_close: data.expected_close ?? null,
    assigned_to: data.assigned_to ?? null,
    lead_id: data.lead_id ?? null,
    property_id: data.property_id ?? null,
    notes: data.notes ?? null,
    created_by: createdByUserId,
  };

  const { data: result, error } = await (supabase.from('deals') as any)
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[deals/queries] createDeal error:', error);
    throw new Error(`Failed to create deal: ${error.message}`);
  }

  return result as DealRow;
}

// ---------------------------------------------------------------------------
// 4. updateDealStage — Move deal through pipeline
// ---------------------------------------------------------------------------

/**
 * Update just the stage of a deal (pipeline movement).
 * Automatically sets closed_at when stage is closed_won or closed_lost,
 * and clears it when moved back.
 */
export async function updateDealStage(
  dealId: string,
  stage: string,
  expectedUpdatedAt?: string,
): Promise<DealRow> {
  const supabase = getSupabase();

  // Use transactional RPC to read + update atomically
  try {
    const { data: result, error } = await (supabase as any).rpc('update_deal_stage_transactional', {
      p_deal_id: dealId,
      p_stage: stage,
    } as any);

    if (error) {
      console.error('[deals/queries] updateDealStage (rpc) error:', error);
      throw new Error(`Failed to update deal stage: ${error.message}`);
    }

    // If optimistic concurrency is requested but RPC was used, we can't check it here.
    // The route handler will re-verify by checking if result was actually returned.
    return result as unknown as DealRow;
  } catch (rpcErr: any) {
    // Fallback: if RPC function doesn't exist yet, do read + update manually
    if (rpcErr?.message?.includes('function') || rpcErr?.code === '42883') {
      console.warn('[deals/queries] updateDealStage: RPC function not found, falling back to manual');

      const now = new Date().toISOString();
      const isClosed = stage === 'closed_won' || stage === 'closed_lost';

      const { data: existing, error: fetchErr } = await (supabase
        .from('deals') as any)
        .select('stage, closed_at, updated_at')
        .eq('id', dealId)
        .single();

      if (fetchErr) {
        if (fetchErr.code === 'PGRST116') {
          throw new Error(`Deal not found: ${dealId}`);
        }
        console.error('[deals/queries] updateDealStage fetch error:', fetchErr);
        throw new Error(`Failed to fetch deal for stage update: ${fetchErr.message}`);
      }

      // Optimistic concurrency check
      if (expectedUpdatedAt && existing.updated_at !== expectedUpdatedAt) {
        throw new Error(`Deal not found or conflict: ${dealId}`);
      }

      const updateData: Record<string, any> = {
        stage,
        updated_at: now,
      };

      if (isClosed && !existing.closed_at) {
        updateData.closed_at = now;
      } else if (!isClosed && existing.closed_at) {
        updateData.closed_at = null;
      }

      const { data: result, error } = await (supabase.from('deals') as any)
        .update(updateData)
        .eq('id', dealId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error(`Deal not found or conflict: ${dealId}`);
        }
        console.error('[deals/queries] updateDealStage error:', error);
        throw new Error(`Failed to update deal stage: ${error.message}`);
      }

      return result as DealRow;
    }
    throw rpcErr;
  }
}

// ---------------------------------------------------------------------------
// 5. updateDeal — Update deal fields
// ---------------------------------------------------------------------------

/**
 * Update an existing deal. Only provided fields are changed.
 */
export async function updateDeal(
  dealId: string,
  data: UpdateDealInput,
  expectedUpdatedAt?: string,
): Promise<DealRow> {
  const supabase = getSupabase();

  const updateData: Record<string, any> = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.value !== undefined) updateData.value = data.value;
  if (data.stage !== undefined) updateData.stage = data.stage;
  if (data.probability !== undefined) updateData.probability = data.probability;
  if (data.expected_close !== undefined) updateData.expected_close = data.expected_close;
  if (data.assigned_to !== undefined) updateData.assigned_to = data.assigned_to;
  if (data.notes !== undefined) updateData.notes = data.notes;

  updateData.updated_at = new Date().toISOString();

  let query = (supabase.from('deals') as any)
    .update(updateData)
    .eq('id', dealId);

  if (expectedUpdatedAt) {
    query = query.eq('updated_at', expectedUpdatedAt);
  }

  const { data: result, error } = await query.select().single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error(`Deal not found or conflict: ${dealId}`);
    }
    console.error('[deals/queries] updateDeal error:', error);
    throw new Error(`Failed to update deal: ${error.message}`);
  }

  return result as DealRow;
}

// ---------------------------------------------------------------------------
// 6. deleteDeal — Archive (soft delete) a deal
// ---------------------------------------------------------------------------

/**
 * Archive a deal by setting stage to 'closed_lost' and noting archival.
 * The deal remains in the database for audit purposes.
 */
export async function deleteDeal(dealId: string): Promise<void> {
  const supabase = getSupabase();

  // Fetch current deal to preserve existing notes
  const { data: deal } = await (supabase.from('deals') as any)
    .select('notes')
    .eq('id', dealId)
    .single();

  const existingNotes: string = deal?.notes ?? '';
  const archiveNote = ` | Archived on ${new Date().toISOString()}`;
  const updatedNotes = existingNotes ? existingNotes + archiveNote : `Archived on ${new Date().toISOString()}`;

  const { error } = await (supabase.from('deals') as any)
    .update({
      stage: 'closed_lost',
      notes: updatedNotes,
      updated_at: new Date().toISOString(),
      closed_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq('id', dealId);

  if (error) {
    console.error('[deals/queries] deleteDeal error:', error);
    throw new Error(`Failed to archive deal: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 7. getDealStats — Pipeline value, avg deal size, win rate
// ---------------------------------------------------------------------------

/**
 * Compute pipeline statistics for a tenant.
 *
 * Returns:
 *   pipeline_value — Sum of all open deals (not closed_won/lost)
 *   avg_deal_size  — Average value of all deals
 *   win_rate       — Percentage of closed deals that were won
 *   by_stage       — Count of deals per stage
 *   by_stage_value — Total value per stage
 */
export async function getDealStats(tenantId: string): Promise<DealStats> {
  const supabase = getSupabase();

  // Fetch all deals for the tenant (id, stage, value)
  const { data, error } = await (supabase
    .from('deals') as any)
    .select('stage, value')
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('[deals/queries] getDealStats error:', error);
    throw new Error(`Failed to fetch deal stats: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{ stage: string; value: number }>;

  const byStage: Record<string, number> = {};
  const byStageValue: Record<string, number> = {};
  let totalDeals = 0;
  let wonDeals = 0;
  let lostDeals = 0;
  let pipelineValue = 0;
  let valueSum = 0;

  for (const row of rows) {
    const stage = row.stage || 'unknown';
    const val = Number(row.value) || 0;

    byStage[stage] = (byStage[stage] ?? 0) + 1;
    byStageValue[stage] = (byStageValue[stage] ?? 0) + val;

    totalDeals++;
    valueSum += val;

    if (stage === 'closed_won') {
      wonDeals++;
    } else if (stage === 'closed_lost') {
      lostDeals++;
    } else {
      pipelineValue += val;
    }
  }

  const closedTotal = wonDeals + lostDeals;
  const winRate = closedTotal > 0 ? wonDeals / closedTotal : 0;

  return {
    pipeline_value: pipelineValue,
    avg_deal_size: totalDeals > 0 ? valueSum / totalDeals : 0,
    win_rate: winRate,
    total_deals: totalDeals,
    won_deals: wonDeals,
    lost_deals: lostDeals,
    by_stage: byStage,
    by_stage_value: byStageValue,
  };
}
