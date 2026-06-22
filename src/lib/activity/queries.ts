/**
 * Activity timeline queries for EstateFlow CRM.
 *
 * Provides functions to log and retrieve activity entries across
 * leads, calls, messages, deals, and other entities.
 *
 * All functions are stubbed — replace DB client calls in production.
 */

import type { PaginationParams, PaginationMeta } from '@/lib/types';
import { buildPaginationParams } from '@/lib/types';
import type { ActivityType, ActivityEntry } from '@/lib/dashboard/queries';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ActivityFilters {
  types?: ActivityType[];
  userId?: string;
  entityType?: string;
  entityId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ActivityFeedResult {
  entries: ActivityEntry[];
  meta: PaginationMeta;
}

// ─── In-memory store ────────────────────────────────────────────────────────

const activityStore: ActivityEntry[] = [];

/**
 * Get the raw activity store (useful for testing / seeding).
 */
export { activityStore };

// ─── Log Activity ───────────────────────────────────────────────────────────

/**
 * Log an activity entry.
 *
 * @param tenantId    - Tenant UUID
 * @param userId      - User UUID who performed the action (null for system actions)
 * @param type        - Activity type identifier
 * @param entityId    - UUID of the related entity (lead, call, etc.)
 * @param description - Human-readable description of the activity
 * @param entityType  - Entity type name (e.g., 'lead', 'call', 'deal')
 * @param metadata    - Optional structured data attached to the activity
 * @returns The created ActivityEntry
 */
export async function logActivity(
  tenantId: string,
  userId: string | null,
  type: ActivityType,
  entityId: string,
  description: string,
  entityType?: string,
  metadata?: Record<string, unknown>,
): Promise<ActivityEntry> {
  const entry: ActivityEntry = {
    id: crypto.randomUUID(),
    tenantId,
    userId: userId ?? 'system',
    userName: null, // Would be fetched from user table in production
    type,
    entityType: entityType ?? type.split('_')[0] ?? 'unknown',
    entityId,
    description,
    metadata: metadata ?? null,
    createdAt: new Date().toISOString(),
  };

  // In production:
  //   await supabase.from('activity_log').insert({
  //     id: entry.id,
  //     tenant_id: entry.tenantId,
  //     user_id: entry.userId,
  //     type: entry.type,
  //     entity_type: entry.entityType,
  //     entity_id: entry.entityId,
  //     description: entry.description,
  //     metadata: entry.metadata,
  //     created_at: entry.createdAt,
  //   });

  activityStore.push(entry);

  return entry;
}

// ─── Get Activity Feed ──────────────────────────────────────────────────────

/**
 * Fetch paginated activity entries for a tenant with optional filters.
 *
 * @param tenantId   - Tenant UUID
 * @param filters    - Optional filters (types, userId, entityType, date range)
 * @param pagination - Pagination parameters (page, limit)
 * @returns ActivityFeedResult with entries and pagination meta
 */
export async function getActivityFeed(
  tenantId: string,
  filters?: ActivityFilters,
  pagination?: Partial<PaginationParams>,
): Promise<ActivityFeedResult> {
  // In production:
  //   let query = supabase
  //     .from('activity_log')
  //     .select('*', { count: 'exact' })
  //     .eq('tenant_id', tenantId);

  //   if (filters?.types?.length) query = query.in('type', filters.types);
  //   if (filters?.userId) query = query.eq('user_id', filters.userId);
  //   if (filters?.entityType) query = query.eq('entity_type', filters.entityType);
  //   if (filters?.entityId) query = query.eq('entity_id', filters.entityId);
  //   if (filters?.dateFrom) query = query.gte('created_at', filters.dateFrom);
  //   if (filters?.dateTo) query = query.lte('created_at', filters.dateTo);

  //   query = query.order('created_at', { ascending: false })
  //     .range(p.offset, p.offset + p.limit - 1);

  //   const { data, count, error } = await query;
  //   return { entries: data ?? [], meta: { ...p, total: count ?? 0, total_pages: ... } };

  const params = buildPaginationParams(pagination?.page, pagination?.limit);

  let filtered = activityStore.filter((a) => a.tenantId === tenantId);

  // Apply filters
  if (filters?.types && filters.types.length > 0) {
    filtered = filtered.filter((a) => filters.types!.includes(a.type));
  }
  if (filters?.userId) {
    filtered = filtered.filter((a) => a.userId === filters.userId);
  }
  if (filters?.entityType) {
    filtered = filtered.filter((a) => a.entityType === filters.entityType);
  }
  if (filters?.entityId) {
    filtered = filtered.filter((a) => a.entityId === filters.entityId);
  }
  if (filters?.dateFrom) {
    const from = new Date(filters.dateFrom).getTime();
    filtered = filtered.filter((a) => new Date(a.createdAt).getTime() >= from);
  }
  if (filters?.dateTo) {
    const to = new Date(filters.dateTo).getTime();
    filtered = filtered.filter((a) => new Date(a.createdAt).getTime() <= to);
  }

  // Sort by created_at descending
  filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const total = filtered.length;
  const totalPages = Math.ceil(total / params.limit);

  // Paginate
  const entries = filtered.slice(params.offset, params.offset + params.limit);

  return {
    entries,
    meta: {
      page: params.page,
      limit: params.limit,
      total,
      total_pages: totalPages,
    },
  };
}
