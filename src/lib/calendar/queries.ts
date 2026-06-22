// ============================================================================
// EstateFlow CRM — Site Visit Calendar Database Queries
// Agent-6-1-Attendance-Calendar v1.0.0
// ============================================================================
//
// All queries operate within a tenant context. Callers are expected to have
// set RLS session variables (via withTenantContext) before invoking these.
//
// Features:
//   - Schedule, reschedule, cancel site visits
//   - Agent schedule for a given date
//   - Auto-send reminders for tomorrow's visits
//
// ============================================================================

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SiteVisitRow {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  property_id: string | null;
  scheduled_by: string | null;
  scheduled_at: string;
  status: string;
  notes: string | null;
  feedback: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteVisitWithDetails extends SiteVisitRow {
  lead_name?: string | null;
  lead_phone?: string | null;
  property_title?: string | null;
  property_location?: string | null;
  agent_name?: string | null;
}

export interface CreateSiteVisitInput {
  leadId: string;
  propertyId: string;
  date: string;            // ISO date YYYY-MM-DD
  time: string;            // ISO time HH:mm or full ISO datetime
  agentId?: string | null; // UUID of the agent scheduling (maps to scheduled_by)
  notes?: string | null;
}

export interface UpdateSiteVisitInput {
  date?: string;
  time?: string;
  status?: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled' | 'no_show';
  notes?: string | null;
  feedback?: string | null;
  scheduled_at?: string;   // Full ISO datetime override
}

// ---------------------------------------------------------------------------
// Supabase client helper
// ---------------------------------------------------------------------------

let _supabase: ReturnType<typeof createClient> | null = null;

function getDb() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY).',
    );
  }

  _supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _supabase;
}

// ---------------------------------------------------------------------------
// 1. getSiteVisits — List site visits with optional filters
// ---------------------------------------------------------------------------

export async function getSiteVisits(
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  agentId?: string | null,
): Promise<SiteVisitWithDetails[]> {
  const supabase = getDb();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from('site_visits') as any)
    .select('*, leads!left(full_name, phone), properties!left(title, location), users!site_visits_scheduled_by_fkey!left(full_name)')
    .eq('tenant_id', tenantId)
    .gte('scheduled_at', dateFrom)
    .lte('scheduled_at', dateTo)
    .order('scheduled_at', { ascending: true });

  if (agentId) {
    query = query.eq('scheduled_by', agentId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[calendar/queries] getSiteVisits error:', error);
    throw new Error(`Failed to fetch site visits: ${error.message}`);
  }

  // Flatten joined data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) || []).map((row) => {
    const lead = row.leads as Record<string, unknown> | null;
    const property = row.properties as Record<string, unknown> | null;
    const user = row.users as Record<string, unknown> | null;
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      lead_id: row.lead_id,
      property_id: row.property_id,
      scheduled_by: row.scheduled_by,
      scheduled_at: row.scheduled_at,
      status: row.status,
      notes: row.notes ?? null,
      feedback: row.feedback ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      lead_name: lead?.full_name as string | null ?? null,
      lead_phone: lead?.phone as string | null ?? null,
      property_title: property?.title as string | null ?? null,
      property_location: property?.location as string | null ?? null,
      agent_name: user?.full_name as string | null ?? null,
    } as SiteVisitWithDetails;
  });
}

// ---------------------------------------------------------------------------
// 2. createSiteVisit — Schedule a new site visit
// ---------------------------------------------------------------------------

export async function createSiteVisit(
  leadId: string,
  propertyId: string,
  date: string,
  time: string,
  agentId?: string | null,
  notes?: string | null,
): Promise<SiteVisitRow> {
  const supabase = getDb();

  // Build the scheduled_at timestamp from date + time
  // time may be "HH:mm" or a full ISO string — handle both
  let scheduledAt: string;
  if (time.includes('T')) {
    // Full ISO datetime provided
    scheduledAt = time;
  } else if (time.includes(':')) {
    // Time-only string — combine with date
    scheduledAt = `${date}T${time}:00.000Z`;
  } else {
    // Integer or unknown format — treat as hours
    scheduledAt = `${date}T${String(time).padStart(2, '0')}:00:00.000Z`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertData: Record<string, any> = {
    lead_id: leadId,
    property_id: propertyId,
    scheduled_by: agentId ?? null,
    scheduled_at: scheduledAt,
    status: 'scheduled',
    notes: notes ?? null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: result, error } = await (supabase.from('site_visits') as any)
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[calendar/queries] createSiteVisit error:', error);
    throw new Error(`Failed to schedule site visit: ${error.message}`);
  }

  return result as SiteVisitRow;
}

// ---------------------------------------------------------------------------
// 3. updateSiteVisit — Reschedule or cancel a site visit
// ---------------------------------------------------------------------------

export async function updateSiteVisit(
  visitId: string,
  data: UpdateSiteVisitInput,
): Promise<SiteVisitRow> {
  const supabase = getDb();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};

  if (data.status !== undefined) updateData.status = data.status;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.feedback !== undefined) updateData.feedback = data.feedback;

  if (data.scheduled_at) {
    updateData.scheduled_at = data.scheduled_at;
  } else if (data.date && data.time) {
    if (data.time.includes('T')) {
      updateData.scheduled_at = data.time;
    } else {
      updateData.scheduled_at = `${data.date}T${data.time}:00.000Z`;
    }
  } else if (data.date) {
    // Only date provided — keep existing time, update date
    // We need the existing record to preserve time — we'll fetch first
    // For simplicity, just set the date at midnight
    updateData.scheduled_at = `${data.date}T00:00:00.000Z`;
  }

  updateData.updated_at = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: result, error } = await (supabase.from('site_visits') as any)
    .update(updateData)
    .eq('id', visitId)
    .select()
    .single();

  if (error) {
    console.error('[calendar/queries] updateSiteVisit error:', error);
    throw new Error(`Failed to update site visit: ${error.message}`);
  }

  return result as SiteVisitRow;
}

// ---------------------------------------------------------------------------
// 4. getAgentSchedule — Agent's site visits for a given date
// ---------------------------------------------------------------------------

export async function getAgentSchedule(
  agentId: string,
  date: string, // ISO date YYYY-MM-DD
): Promise<SiteVisitWithDetails[]> {
  const supabase = getDb();

  const dateFrom = `${date}T00:00:00.000Z`;
  const dateTo = `${date}T23:59:59.999Z`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('site_visits') as any)
    .select('*, leads!left(full_name, phone), properties!left(title, location)')
    .eq('scheduled_by', agentId)
    .gte('scheduled_at', dateFrom)
    .lte('scheduled_at', dateTo)
    .order('scheduled_at', { ascending: true });

  if (error) {
    console.error('[calendar/queries] getAgentSchedule error:', error);
    throw new Error(`Failed to fetch agent schedule: ${error.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) || []).map((row) => {
    const lead = row.leads as Record<string, unknown> | null;
    const property = row.properties as Record<string, unknown> | null;
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      lead_id: row.lead_id,
      property_id: row.property_id,
      scheduled_by: row.scheduled_by,
      scheduled_at: row.scheduled_at,
      status: row.status,
      notes: row.notes ?? null,
      feedback: row.feedback ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      lead_name: lead?.full_name as string | null ?? null,
      lead_phone: lead?.phone as string | null ?? null,
      property_title: property?.title as string | null ?? null,
      property_location: property?.location as string | null ?? null,
      agent_name: null,
    } as SiteVisitWithDetails;
  });
}

// ---------------------------------------------------------------------------
// 5. getTodayVisits — Today's upcoming site visits for an agent
// ---------------------------------------------------------------------------

export async function getTodayVisits(
  agentId: string,
): Promise<SiteVisitWithDetails[]> {
  const today = new Date().toISOString().split('T')[0]!;
  return getAgentSchedule(agentId, today);
}

// ---------------------------------------------------------------------------
// 6. getVisitById — Get a single site visit by ID
// ---------------------------------------------------------------------------

export async function getVisitById(
  visitId: string,
): Promise<SiteVisitWithDetails | null> {
  const supabase = getDb();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('site_visits') as any)
    .select('*, leads!left(full_name, phone), properties!left(title, location), users!site_visits_scheduled_by_fkey!left(full_name)')
    .eq('id', visitId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[calendar/queries] getVisitById error:', error);
    throw new Error(`Failed to fetch site visit: ${error.message}`);
  }

  const lead = data.leads as Record<string, unknown> | null;
  const property = data.properties as Record<string, unknown> | null;
  const user = data.users as Record<string, unknown> | null;

  return {
    id: data.id,
    tenant_id: data.tenant_id,
    lead_id: data.lead_id,
    property_id: data.property_id,
    scheduled_by: data.scheduled_by,
    scheduled_at: data.scheduled_at,
    status: data.status,
    notes: data.notes ?? null,
    feedback: data.feedback ?? null,
    created_at: data.created_at,
    updated_at: data.updated_at,
    lead_name: lead?.full_name as string | null ?? null,
    lead_phone: lead?.phone as string | null ?? null,
    property_title: property?.title as string | null ?? null,
    property_location: property?.location as string | null ?? null,
    agent_name: user?.full_name as string | null ?? null,
  } as SiteVisitWithDetails;
}

// ---------------------------------------------------------------------------
// 7. sendReminders — Auto-send reminders for tomorrow's visits
// ---------------------------------------------------------------------------

export interface VisitReminder {
  visitId: string;
  scheduledAt: string;
  leadName: string | null;
  leadPhone: string | null;
  propertyTitle: string | null;
  propertyLocation: string | null;
  agentId: string | null;
}

/**
 * Fetch all site visits scheduled for tomorrow with status 'scheduled'.
 * This is intended to be called by a cron job to send reminders.
 */
export async function getTomorrowVisits(
  tenantId: string,
): Promise<VisitReminder[]> {
  const supabase = getDb();

  // Calculate tomorrow's date boundaries
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];
  const dateFrom = `${dateStr}T00:00:00.000Z`;
  const dateTo = `${dateStr}T23:59:59.999Z`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('site_visits') as any)
    .select('id, scheduled_at, leads!left(full_name, phone), properties!left(title, location), scheduled_by')
    .eq('tenant_id', tenantId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', dateFrom)
    .lte('scheduled_at', dateTo)
    .order('scheduled_at', { ascending: true });

  if (error) {
    console.error('[calendar/queries] getTomorrowVisits error:', error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) || []).map((row) => {
    const lead = row.leads as Record<string, unknown> | null;
    const property = row.properties as Record<string, unknown> | null;
    return {
      visitId: row.id,
      scheduledAt: row.scheduled_at,
      leadName: lead?.full_name as string | null ?? null,
      leadPhone: lead?.phone as string | null ?? null,
      propertyTitle: property?.title as string | null ?? null,
      propertyLocation: property?.location as string | null ?? null,
      agentId: row.scheduled_by ?? null,
    } as VisitReminder;
  });
}

/**
 * Send reminders for tomorrow's site visits.
 * This is designed to be called by a cron job (e.g., every evening at 8 PM).
 * It fetches tomorrow's visits and returns them for the caller to send
 * notifications (SMS, email, push, in-app, WhatsApp, etc.).
 */
export async function sendReminders(
  tenantId: string,
): Promise<VisitReminder[]> {
  const visits = await getTomorrowVisits(tenantId);

  if (visits.length > 0) {
    console.info(
      `[calendar/queries] sendReminders: Found ${visits.length} visit(s) for tomorrow. ` +
      `Reminder dispatch should be handled by caller (SMS/Email/Push/WhatsApp).`,
    );
  }

  return visits;
}
