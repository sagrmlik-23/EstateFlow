// ============================================================================
// EstateFlow CRM — Application Constants
// Agent-1-Scaffold Contract v1.0.0
// ============================================================================

export const APP_NAME = 'EstateFlow';

export const APP_VERSION = '1.0.0';

export const DEFAULT_PAGE_SIZE = 20;

export const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ORG_ADMIN: 'org_admin',
  AGENT: 'agent',
  TEAM_LEAD: 'team_lead',
  VIEWER: 'viewer',
} as const;

export type RoleValue = (typeof ROLES)[keyof typeof ROLES];

// ---------------------------------------------------------------------------
// Lead Statuses
// ---------------------------------------------------------------------------

export const LEAD_STATUSES = {
  NEW: 'new',
  CONTACTED: 'contacted',
  QUALIFIED: 'qualified',
  PROPOSAL: 'proposal',
  NEGOTIATION: 'negotiation',
  CLOSED_WON: 'closed_won',
  CLOSED_LOST: 'closed_lost',
  ARCHIVED: 'archived',
} as const;

export type LeadStatusValue = (typeof LEAD_STATUSES)[keyof typeof LEAD_STATUSES];

// ---------------------------------------------------------------------------
// Property Types
// ---------------------------------------------------------------------------

export const PROPERTY_TYPES = {
  APARTMENT: 'apartment',
  HOUSE: 'house',
  VILLA: 'villa',
  COMMERCIAL: 'commercial',
  LAND: 'land',
  PENTHOUSE: 'penthouse',
  STUDIO: 'studio',
} as const;

export type PropertyTypeValue = (typeof PROPERTY_TYPES)[keyof typeof PROPERTY_TYPES];

// ---------------------------------------------------------------------------
// Call Statuses
// ---------------------------------------------------------------------------

export const CALL_STATUSES = {
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  MISSED: 'missed',
  RESCHEDULED: 'rescheduled',
  NO_ANSWER: 'no_answer',
  CALLBACK_REQUESTED: 'callback_requested',
} as const;

export type CallStatusValue = (typeof CALL_STATUSES)[keyof typeof CALL_STATUSES];

// ---------------------------------------------------------------------------
// Lead Sources
// ---------------------------------------------------------------------------

export const LEAD_SOURCES = {
  WEBSITE: 'website',
  REFERRAL: 'referral',
  WHATSAPP: 'whatsapp',
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  COLD_CALL: 'cold_call',
  WALK_IN: 'walk_in',
  OTHER: 'other',
} as const;

export type LeadSourceValue = (typeof LEAD_SOURCES)[keyof typeof LEAD_SOURCES];

// ---------------------------------------------------------------------------
// Property Availability Statuses
// ---------------------------------------------------------------------------

export const AVAILABILITY_STATUSES = {
  AVAILABLE: 'available',
  SOLD: 'sold',
  RENTED: 'rented',
  UNDER_OFFER: 'under_offer',
  OFF_MARKET: 'off_market',
} as const;

export type AvailabilityStatusValue = (typeof AVAILABILITY_STATUSES)[keyof typeof AVAILABILITY_STATUSES];

// ---------------------------------------------------------------------------
// Deal Stages
// ---------------------------------------------------------------------------

export const DEAL_STAGES = {
  QUALIFICATION: 'qualification',
  PROPOSAL: 'proposal',
  NEGOTIATION: 'negotiation',
  CLOSED_WON: 'closed_won',
  CLOSED_LOST: 'closed_lost',
} as const;

export type DealStageValue = (typeof DEAL_STAGES)[keyof typeof DEAL_STAGES];

// ---------------------------------------------------------------------------
// AI Agent Purposes
// ---------------------------------------------------------------------------

export const AI_AGENT_PURPOSES = {
  LEAD_QUALIFICATION: 'lead_qualification',
  FOLLOW_UP: 'follow_up',
  SURVEY: 'survey',
  REMINDER: 'reminder',
  GENERAL: 'general',
} as const;

export type AIAgentPurposeValue = (typeof AI_AGENT_PURPOSES)[keyof typeof AI_AGENT_PURPOSES];

// ---------------------------------------------------------------------------
// AI Call Statuses
// ---------------------------------------------------------------------------

export const AI_CALL_STATUSES = {
  QUEUED: 'queued',
  RINGING: 'ringing',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  NO_ANSWER: 'no_answer',
  BUSY: 'busy',
  CANCELLED: 'cancelled',
} as const;

// ---------------------------------------------------------------------------
// Task Priorities & Statuses
// ---------------------------------------------------------------------------

export const TASK_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export const TASK_STATUSES = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

// ---------------------------------------------------------------------------
// Attendance Statuses
// ---------------------------------------------------------------------------

export const ATTENDANCE_STATUSES = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  HALF_DAY: 'half_day',
  LEAVE: 'leave',
  HOLIDAY: 'holiday',
} as const;

// ---------------------------------------------------------------------------
// Tenant Plans
// ---------------------------------------------------------------------------

export const TENANT_PLANS = {
  FREE: 'free',
  STARTER: 'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise',
} as const;

export type TenantPlanValue = (typeof TENANT_PLANS)[keyof typeof TENANT_PLANS];

// ---------------------------------------------------------------------------
// Tenant Statuses
// ---------------------------------------------------------------------------

export const TENANT_STATUSES = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  TRIAL: 'trial',
  CANCELLED: 'cancelled',
} as const;

// ---------------------------------------------------------------------------
// Message Channels
// ---------------------------------------------------------------------------

export const MESSAGE_CHANNELS = {
  WHATSAPP: 'whatsapp',
  SMS: 'sms',
  EMAIL: 'email',
  IN_APP: 'in_app',
  WEB: 'web',
} as const;

// ---------------------------------------------------------------------------
// Audit Actions
// ---------------------------------------------------------------------------

export const AUDIT_ACTIONS = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LOGIN: 'login',
  LOGOUT: 'logout',
  EXPORT: 'export',
  VIEW: 'view',
} as const;

// ---------------------------------------------------------------------------
// Document Categories
// ---------------------------------------------------------------------------

export const DOCUMENT_CATEGORIES = {
  CONTRACT: 'contract',
  AGREEMENT: 'agreement',
  ID_PROOF: 'id_proof',
  PROPERTY_DOC: 'property_doc',
  OTHER: 'other',
} as const;

// ---------------------------------------------------------------------------
// Reserved Subdomains (bypass tenant routing)
// ---------------------------------------------------------------------------

export const RESERVED_SUBDOMAINS = [
  'www',
  'app',
  'api',
  'admin',
  'mail',
  'dev',
  'staging',
] as const;

// ---------------------------------------------------------------------------
// Cache TTLs (seconds)
// ---------------------------------------------------------------------------

export const CACHE_TTL = {
  TENANT_CONFIG: 300, // 5 minutes
  EDGE_CONFIG: 3600, // 1 hour
  API_RESPONSE: 60, // 1 minute
  LEADERBOARD: 300, // 5 minutes
} as const;

// ---------------------------------------------------------------------------
// Rate Limit Defaults
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
  IP: { limit: 100, windowSeconds: 60 },
  TENANT: { limit: 1000, windowSeconds: 60 },
  USER: { limit: 60, windowSeconds: 60 },
  LOGIN: { limit: 5, windowSeconds: 900 }, // 5 per 15 min
  AI_CALL: { limit: 50, windowSeconds: 60 },
  WEBHOOK: { limit: 100, windowSeconds: 60 },
} as const;
