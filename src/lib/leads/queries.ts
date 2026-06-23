// ============================================================================
// EstateFlow CRM — Lead Database Queries
// Agent-2-1-API-Leads v1.0.0
// ============================================================================
//
// All queries operate within a tenant context. Callers are expected to have
// set RLS session variables (via withTenantContext) before invoking these.
//
// Phone numbers are encrypted at rest via encryptPhone() before INSERT/UPDATE
// and decrypted on read when a full lead detail is requested.
//
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { encryptPhone, decryptPhone } from '@/lib/security/encryption';
import { normalizePhone } from '@/lib/leads/intakeWebhook';
import type { PaginationParams, PaginationMeta } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeadRow {
  id: string;
  tenant_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: string;
  ai_score: number | null;
  budget_min: number | null;
  budget_max: number | null;
  preferred_location: string | null;
  property_type: string | null;
  notes: string | null;
  assigned_agent_id: string | null;
  is_duplicate: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateLeadInput {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  status?: string;
  ai_score?: number | null;
  budget_min?: number | null;
  budget_max?: number | null;
  preferred_location?: string | null;
  property_type?: string | null;
  notes?: string | null;
  assigned_agent_id?: string | null;
}

export interface UpdateLeadInput {
  full_name?: string;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  status?: string;
  ai_score?: number | null;
  budget_min?: number | null;
  budget_max?: number | null;
  preferred_location?: string | null;
  property_type?: string | null;
  notes?: string | null;
  assigned_agent_id?: string | null;
}

export interface LeadFilters {
  status?: string;
  source?: string;
  assigned_agent_id?: string;
  ai_score_min?: number;
  ai_score_max?: number;
  budget_min?: number;
  budget_max?: number;
  property_type?: string;
  is_duplicate?: boolean;
  created_after?: string;
  created_before?: string;
}

export interface LeadActivityItem {
  id: string;
  type: 'call' | 'message' | 'site_visit' | 'note';
  description: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface LeadStats {
  total: number;
  by_status: Record<string, number>;
  by_source: Record<string, number>;
  by_score_range: {
    low: number;    // 0-33
    medium: number; // 34-66
    high: number;   // 67-100
    unassigned: number;
  };
}

// ---------------------------------------------------------------------------
// Supabase client helper
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
// 1. getLeads — Paginated lead list with filters & sorting
// ---------------------------------------------------------------------------

export async function getLeads(
  tenantId: string,
  filters: LeadFilters = {},
  pagination: PaginationParams = { page: 1, limit: 20, offset: 0 },
  sortBy: string = 'created_at',
  sortDir: 'asc' | 'desc' = 'desc',
): Promise<{ data: LeadRow[]; meta: PaginationMeta }> {
  const supabase = getDb();

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  // Apply filters
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.source) {
    query = query.eq('source', filters.source);
  }
  if (filters.assigned_agent_id) {
    query = query.eq('assigned_agent_id', filters.assigned_agent_id);
  }
  if (filters.property_type) {
    query = query.eq('property_type', filters.property_type);
  }
  if (filters.is_duplicate !== undefined) {
    query = query.eq('is_duplicate', filters.is_duplicate);
  }
  if (filters.ai_score_min !== undefined) {
    query = query.gte('ai_score', filters.ai_score_min);
  }
  if (filters.ai_score_max !== undefined) {
    query = query.lte('ai_score', filters.ai_score_max);
  }
  if (filters.budget_min !== undefined) {
    query = query.gte('budget_min', filters.budget_min);
  }
  if (filters.budget_max !== undefined) {
    query = query.lte('budget_max', filters.budget_max);
  }
  if (filters.created_after) {
    query = query.gte('created_at', filters.created_after);
  }
  if (filters.created_before) {
    query = query.lte('created_at', filters.created_before);
  }

  // Sorting & pagination
  query = query
    .order(sortBy, { ascending: sortDir === 'asc' })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[leads/queries] getLeads error:', error);
    throw new Error(`Failed to fetch leads: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    data: (data as LeadRow[]) || [],
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      total_pages: Math.ceil(total / pagination.limit),
    },
  };
}

// ---------------------------------------------------------------------------
// 2. getLeadById — Single lead with full details (decrypts phone)
// ---------------------------------------------------------------------------

export async function getLeadById(leadId: string): Promise<LeadRow | null> {
  const supabase = getDb();

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('[leads/queries] getLeadById error:', error);
    throw new Error(`Failed to fetch lead: ${error.message}`);
  }

  const lead = data as unknown as LeadRow;

  // Decrypt phone for full detail view
  if (lead.phone) {
    try {
      lead.phone = decryptPhone(lead.phone);
    } catch {
      // If decryption fails, leave as-is (might be plaintext in dev)
    }
  }

  return lead;
}

// ---------------------------------------------------------------------------
// 3. createLead — INSERT with duplicate detection & phone encryption
// ---------------------------------------------------------------------------

export async function createLead(
  data: CreateLeadInput,
  tenantId: string,
  createdByUserId: string,
): Promise<LeadRow> {
  const supabase = getDb();

  // --- Duplicate detection ---
  let isDuplicate = false;
  if (data.phone) {
    const duplicates = await findLeadsByPhone(data.phone, tenantId);
    if (duplicates.length > 0) {
      isDuplicate = true;
    }
  }

  // --- Encrypt phone ---
  let encryptedPhone: string | null = null;
  if (data.phone) {
    try {
      encryptedPhone = encryptPhone(data.phone);
    } catch {
      // If encryption key not set, store as-is (dev mode)
      encryptedPhone = data.phone;
    }
  }

  // Use transactional RPC — duplicate check (done above) + insert via PG function
  // to ensure atomicity of the insert in case of concurrent calls.
  try {
    const { data: result, error } = await (supabase as any).rpc('create_lead_transactional', {
      p_tenant_id: tenantId,
      p_created_by: createdByUserId,
      p_full_name: data.full_name,
      p_phone: encryptedPhone,
      p_email: data.email ?? null,
      p_source: data.source ?? null,
      p_status: data.status ?? 'new',
      p_ai_score: data.ai_score ?? 0,
      p_budget_min: data.budget_min ?? null,
      p_budget_max: data.budget_max ?? null,
      p_preferred_location: data.preferred_location ?? null,
      p_property_type: data.property_type ?? null,
      p_notes: data.notes ?? null,
      p_assigned_agent_id: data.assigned_agent_id ?? null,
      p_is_duplicate: isDuplicate,
    } as any);

    if (error) {
      console.error('[leads/queries] createLead (rpc) error:', error);
      throw new Error(`Failed to create lead: ${error.message}`);
    }

    return result as unknown as LeadRow;
  } catch (rpcErr: any) {
    // Fallback: if RPC function doesn't exist yet, use direct insert
    if (rpcErr?.message?.includes('function') || rpcErr?.code === '42883') {
      console.warn('[leads/queries] createLead: RPC function not found, falling back to direct insert');

      const insertData: Record<string, any> = {
        tenant_id: tenantId,
        full_name: data.full_name,
        phone: encryptedPhone,
        email: data.email ?? null,
        source: data.source ?? null,
        status: data.status ?? 'new',
        ai_score: data.ai_score ?? 0,
        budget_min: data.budget_min ?? null,
        budget_max: data.budget_max ?? null,
        preferred_location: data.preferred_location ?? null,
        property_type: data.property_type ?? null,
        notes: data.notes ?? null,
        assigned_agent_id: data.assigned_agent_id ?? null,
        is_duplicate: isDuplicate,
        created_by: createdByUserId,
      };

      const { data: result, error } = await (supabase.from('leads') as any)
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('[leads/queries] createLead error:', error);
        throw new Error(`Failed to create lead: ${error.message}`);
      }

      return result as LeadRow;
    }
    throw rpcErr;
  }
}

// ---------------------------------------------------------------------------
// 4. updateLead — UPDATE with audit logging support
// ---------------------------------------------------------------------------

export async function updateLead(
  leadId: string,
  data: UpdateLeadInput,
  expectedUpdatedAt?: string,
): Promise<LeadRow> {
  const supabase = getDb();

  const updateData: Record<string, any> = {};

  if (data.full_name !== undefined) updateData.full_name = data.full_name;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.source !== undefined) updateData.source = data.source;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.ai_score !== undefined) updateData.ai_score = data.ai_score;
  if (data.budget_min !== undefined) updateData.budget_min = data.budget_min;
  if (data.budget_max !== undefined) updateData.budget_max = data.budget_max;
  if (data.preferred_location !== undefined) updateData.preferred_location = data.preferred_location;
  if (data.property_type !== undefined) updateData.property_type = data.property_type;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.assigned_agent_id !== undefined) updateData.assigned_agent_id = data.assigned_agent_id;

  // Encrypt phone if provided
  if (data.phone !== undefined) {
    if (data.phone) {
      try {
        updateData.phone = encryptPhone(data.phone);
      } catch {
        updateData.phone = data.phone;
      }
    } else {
      updateData.phone = null;
    }
  }

  updateData.updated_at = new Date().toISOString();

  let query = (supabase.from('leads') as any)
    .update(updateData)
    .eq('id', leadId);

  if (expectedUpdatedAt) {
    query = query.eq('updated_at', expectedUpdatedAt);
  }

  const { data: result, error } = await query.select().single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error(`Lead not found or conflict: ${leadId}`);
    }
    console.error('[leads/queries] updateLead error:', error);
    throw new Error(`Failed to update lead: ${error.message}`);
  }

  return result as LeadRow;
}

// ---------------------------------------------------------------------------
// 5. deleteLead — Soft delete (set status = 'archived')
// ---------------------------------------------------------------------------

export async function deleteLead(leadId: string): Promise<void> {
  const supabase = getDb();

  const { error } = await (supabase.from('leads') as any)
    .update({
      status: 'archived',
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq('id', leadId);

  if (error) {
    console.error('[leads/queries] deleteLead error:', error);
    throw new Error(`Failed to archive lead: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 6. bulkUpdateLeads — Bulk status change / reassign
// ---------------------------------------------------------------------------

export async function bulkUpdateLeads(
  leadIds: string[],
  data: UpdateLeadInput,
): Promise<number> {
  if (leadIds.length === 0) return 0;

  const supabase = getDb();

  const updateData: Record<string, any> = {};
  if (data.status !== undefined) updateData.status = data.status;
  if (data.assigned_agent_id !== undefined) updateData.assigned_agent_id = data.assigned_agent_id;
  if (data.source !== undefined) updateData.source = data.source;
  if (data.ai_score !== undefined) updateData.ai_score = data.ai_score;
  updateData.updated_at = new Date().toISOString();

  const { error, count } = await (supabase.from('leads') as any)
    .update(updateData)
    .in('id', leadIds)
    .select('id', { count: 'exact' });

  if (error) {
    console.error('[leads/queries] bulkUpdateLeads error:', error);
    throw new Error(`Failed to bulk update leads: ${error.message}`);
  }

  return count ?? 0;
}

// ---------------------------------------------------------------------------
// 7. getLeadActivity — Timeline of calls, messages, site visits
// ---------------------------------------------------------------------------

export async function getLeadActivity(leadId: string, tenantId: string): Promise<LeadActivityItem[]> {
  const supabase = getDb();
  const activities: LeadActivityItem[] = [];

  // Fetch calls for this lead (tenant-scoped)
  const { data: calls, error: callsErr } = await (supabase.from('calls') as any)
    .select('id, status, direction, duration_seconds, notes, created_at')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!callsErr && calls) {
    for (const call of calls as Array<Record<string, unknown>>) {
      activities.push({
        id: String(call.id),
        type: 'call',
        description: `${call.direction} call — ${call.status}${call.duration_seconds ? ` (${call.duration_seconds}s)` : ''}`,
        created_at: String(call.created_at),
        metadata: { notes: call.notes, duration: call.duration_seconds },
      });
    }
  }

  // Fetch messages for this lead (tenant-scoped)
  const { data: msgs, error: msgsErr } = await (supabase.from('messages') as any)
    .select('id, channel, direction, content, created_at')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!msgsErr && msgs) {
    for (const msg of msgs as Array<Record<string, unknown>>) {
      activities.push({
        id: String(msg.id),
        type: 'message',
        description: `${msg.direction} ${msg.channel} message`,
        created_at: String(msg.created_at),
        metadata: { channel: msg.channel, content: msg.content },
      });
    }
  }

  // Fetch site visits for this lead (tenant-scoped)
  const { data: visits, error: visitsErr } = await (supabase.from('site_visits') as any)
    .select('id, status, scheduled_at, notes, created_at')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!visitsErr && visits) {
    for (const visit of visits as Array<Record<string, unknown>>) {
      activities.push({
        id: String(visit.id),
        type: 'site_visit',
        description: `Site visit — ${visit.status} (scheduled: ${new Date(String(visit.scheduled_at)).toLocaleDateString()})`,
        created_at: String(visit.created_at),
        metadata: { status: visit.status, notes: visit.notes },
      });
    }
  }

  // Sort all activities by created_at descending
  activities.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return activities;
}

// ---------------------------------------------------------------------------
// 8. searchLeads — Full-text search across name, phone, email, notes
// ---------------------------------------------------------------------------

export async function searchLeads(
  query: string,
  tenantId: string,
  pagination: PaginationParams = { page: 1, limit: 20, offset: 0 },
): Promise<{ data: LeadRow[]; meta: PaginationMeta }> {
  const supabase = getDb();
  const searchTerm = `%${query}%`;

  const { data, error, count } = await (supabase.from('leads') as any)
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .or(
      `full_name.ilike.${searchTerm}` +
      `,email.ilike.${searchTerm}` +
      `,notes.ilike.${searchTerm}` +
      `,phone.ilike.${searchTerm}` +
      `,source.ilike.${searchTerm}` +
      `,preferred_location.ilike.${searchTerm}`,
    )
    .order('created_at', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  if (error) {
    console.error('[leads/queries] searchLeads error:', error);
    throw new Error(`Failed to search leads: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    data: (data as LeadRow[]) || [],
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      total_pages: Math.ceil(total / pagination.limit),
    },
  };
}

// ---------------------------------------------------------------------------
// 9. getDuplicateLeads — Find leads matching by phone
// ---------------------------------------------------------------------------

async function findLeadsByPhone(
  phone: string,
  tenantId: string,
): Promise<LeadRow[]> {
  const supabase = getDb();

  // We search by the encrypted phone — we encrypt the search phone and match
  // against stored encrypted values. However, since AES-GCM is non-deterministic
  // (random IV per encryption), we can't directly search encrypted values.
  //
  // Strategy: Fetch leads for tenant, decrypt phone in-app, and compare.
  // Limit is configurable via DUPLICATE_CHECK_LIMIT env var (default 500).
  const DUPLICATE_CHECK_LIMIT = parseInt(process.env.DUPLICATE_CHECK_LIMIT || '500', 10);
  const { data, error } = await (supabase.from('leads') as any)
    .select('id, full_name, phone, email, status, created_at')
    .eq('tenant_id', tenantId)
    .is('phone', 'neq', null)
    .limit(DUPLICATE_CHECK_LIMIT);

  if (error) {
    console.error('[leads/queries] findLeadsByPhone error:', error);
    throw new Error(`Failed to check duplicates: ${error.message}`);
  }

  const matches: LeadRow[] = [];
  // Strip all non-digits from search phone for robust matching
  const normalizedSearch = normalizePhone(phone).replace(/\D/g, '');

  for (const lead of (data || []) as LeadRow[]) {
    if (!lead.phone) continue;
    try {
      const decrypted = decryptPhone(lead.phone);
      // Strip '+' and non-digits from both sides for reliable matching
      const normalizedLead = normalizePhone(decrypted).replace(/\D/g, '');
      if (normalizedLead === normalizedSearch) {
        matches.push(lead);
      }
    } catch {
      // If decryption fails, try direct comparison (dev mode with plaintext)
      const normalizedLead = normalizePhone(lead.phone).replace(/\D/g, '');
      if (normalizedLead === normalizedSearch) {
        matches.push(lead);
      }
    }
  }

  return matches;
}

/**
 * Public wrapper: find duplicate leads by phone number within a tenant.
 */
export async function getDuplicateLeads(
  phone: string,
  tenantId: string,
): Promise<LeadRow[]> {
  return findLeadsByPhone(phone, tenantId);
}

// ---------------------------------------------------------------------------
// 10. getLeadStats — Aggregated counts by status, source, score range
// ---------------------------------------------------------------------------

/**
 * Helper: fetch column values for a tenant with filters applied.
 */
async function fetchLeadsColumn(
  tenantId: string,
  column: string,
  filters: LeadFilters,
  supabase: any,
): Promise<any[]> {
  let query = supabase
    .from('leads')
    .select(column)
    .eq('tenant_id', tenantId);

  if (filters.created_after) query = query.gte('created_at', filters.created_after);
  if (filters.created_before) query = query.lte('created_at', filters.created_before);
  if (filters.source) query = query.eq('source', filters.source);
  if (filters.assigned_agent_id) query = query.eq('assigned_agent_id', filters.assigned_agent_id);
  if (filters.property_type) query = query.eq('property_type', filters.property_type);

  const { data } = await query;
  return data || [];
}

export async function getLeadStats(
  tenantId: string,
  filters: LeadFilters = {},
): Promise<LeadStats> {
  const supabase = getDb();

  // --- Total count ---
  let totalQuery = supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (filters.created_after) totalQuery = totalQuery.gte('created_at', filters.created_after);
  if (filters.created_before) totalQuery = totalQuery.lte('created_at', filters.created_before);
  if (filters.source) totalQuery = totalQuery.eq('source', filters.source);
  if (filters.assigned_agent_id) totalQuery = totalQuery.eq('assigned_agent_id', filters.assigned_agent_id);
  if (filters.property_type) totalQuery = totalQuery.eq('property_type', filters.property_type);

  const { count: total, error: totalErr } = await totalQuery;
  if (totalErr) throw new Error(`Failed to count leads: ${totalErr.message}`);

  // --- By status (fetch all matching leads and aggregate in-memory) ---
  const statusRows = await fetchLeadsColumn(tenantId, 'status', filters, supabase);
  const byStatusMap: Record<string, number> = {};
  for (const row of statusRows) {
    const s = String(row.status || 'unknown');
    byStatusMap[s] = (byStatusMap[s] || 0) + 1;
  }

  // --- By source ---
  const sourceRows = await fetchLeadsColumn(tenantId, 'source', filters, supabase);
  const bySourceMap: Record<string, number> = {};
  for (const row of sourceRows) {
    const s = String(row.source || 'unknown');
    bySourceMap[s] = (bySourceMap[s] || 0) + 1;
  }

  // --- By AI score range ---
  const scoreRows = await fetchLeadsColumn(tenantId, 'ai_score', filters, supabase);
  const scoreStats = { low: 0, medium: 0, high: 0, unassigned: 0 };
  for (const row of scoreRows) {
    const score = row.ai_score;
    if (score === null || score === undefined) {
      scoreStats.unassigned++;
    } else if (Number(score) <= 33) {
      scoreStats.low++;
    } else if (Number(score) <= 66) {
      scoreStats.medium++;
    } else {
      scoreStats.high++;
    }
  }

  return {
    total: total ?? 0,
    by_status: byStatusMap,
    by_source: bySourceMap,
    by_score_range: scoreStats,
  };
}
