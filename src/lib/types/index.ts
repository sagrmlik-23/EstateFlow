// ============================================================================
// EstateFlow CRM — Shared Type Definitions
// Agent-1-Scaffold Contract v1.0.0
// ============================================================================

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum UserRole {
  SuperAdmin = 'super_admin',
  OrgAdmin = 'org_admin',
  Agent = 'agent',
  TeamLead = 'team_lead',
  Viewer = 'viewer',
}

export enum LeadStatus {
  New = 'new',
  Contacted = 'contacted',
  Qualified = 'qualified',
  Proposal = 'proposal',
  Negotiation = 'negotiation',
  ClosedWon = 'closed_won',
  ClosedLost = 'closed_lost',
  Archived = 'archived',
}

export enum PropertyType {
  Apartment = 'apartment',
  House = 'house',
  Villa = 'villa',
  Commercial = 'commercial',
  Land = 'land',
  Penthouse = 'penthouse',
  Studio = 'studio',
}

export enum CallStatus {
  Scheduled = 'scheduled',
  Completed = 'completed',
  Missed = 'missed',
  Rescheduled = 'rescheduled',
  NoAnswer = 'no_answer',
  CallbackRequested = 'callback_requested',
}

// ---------------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------------

export interface TenantInfo {
  tenantId: string;
  slug: string;
  domain: string | null;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

// ---------------------------------------------------------------------------
// API Response Wrapper
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta: PaginationMeta | null;
}

// ---------------------------------------------------------------------------
// Application Configuration
// ---------------------------------------------------------------------------

export interface IAppConfig {
  appName: string;
  version: string;
  baseUrl: string;
  defaultTenant: string;
  features: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Middleware Context
// ---------------------------------------------------------------------------

export interface IMiddlewareContext {
  tenantId: string | null;
  userId: string | null;
  userRole: UserRole | null;
  requestId: string;
  ip?: string;
}

// ---------------------------------------------------------------------------
// Helper: Build PaginationParams from request query
// ---------------------------------------------------------------------------

export function buildPaginationParams(
  page?: number,
  limit?: number,
): PaginationParams {
  const p = Math.max(1, page ?? 1);
  const l = Math.min(100, Math.max(1, limit ?? 20));
  return {
    page: p,
    limit: l,
    offset: (p - 1) * l,
  };
}
