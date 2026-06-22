// ============================================================================
// EstateFlow CRM — White-Label Branding Type Definitions
// Agent-5-Whitelabel Contract v1.0.0
// ============================================================================

// ---------------------------------------------------------------------------
// WhiteLabelConfig
// ---------------------------------------------------------------------------

/**
 * Complete per-tenant branding and communication configuration.
 * Maps to tenants table columns from agent-2-database contract.
 */
export interface WhiteLabelConfig {
  /** Tenant UUID */
  tenant_id: string;
  /** Company/tenant display name */
  company_name: string;
  /** URL to tenant logo image (optional) */
  logo_url: string | null;
  /** URL to tenant favicon (optional) */
  favicon_url: string | null;
  /** Primary brand color in hex (e.g. #2563eb) */
  primary_color: string | null;
  /** Secondary brand color in hex (e.g. #64748b) */
  secondary_color: string | null;
  /** Accent brand color in hex (e.g. #f59e0b) */
  accent_color: string | null;
  /** Custom domain for white-label (optional) */
  custom_domain: string | null;
  /** Custom sender name for outgoing emails */
  email_sender_name: string | null;
  /** Custom reply-to email address */
  email_reply_to: string | null;
  /** WhatsApp business number */
  whatsapp_number: string | null;
  /** SMS sender ID */
  sms_sender_id: string | null;
  /** Whether this tenant has white-label enabled */
  is_white_label: boolean;
}

// ---------------------------------------------------------------------------
// BrandingColors
// ---------------------------------------------------------------------------

/**
 * CSS variable mapping for dynamic theme injection.
 * Used by ClientLayout to set CSS custom properties on :root.
 */
export interface BrandingColors {
  /** CSS variable: --tenant-primary */
  primary: string;
  /** CSS variable: --tenant-secondary */
  secondary: string;
  /** CSS variable: --tenant-accent */
  accent: string;
  /** CSS variable: --tenant-primary-rgb (comma-separated RGB tuple) */
  primaryRgb: string;
  /** CSS variable: --tenant-secondary-rgb (comma-separated RGB tuple) */
  secondaryRgb: string;
  /** CSS variable: --tenant-accent-rgb (comma-separated RGB tuple) */
  accentRgb: string;
}

// ---------------------------------------------------------------------------
// UseTenantResult
// ---------------------------------------------------------------------------

/**
 * Return type of the useTenant() React hook.
 */
export interface UseTenantResult {
  /** The fetched WhiteLabelConfig, or null if not loaded / error */
  config: WhiteLabelConfig | null;
  /** Whether the config is still being fetched */
  isLoading: boolean;
  /** Error object if fetch failed, null otherwise */
  error: Error | null;
  /** Computed BrandingColors derived from config, or null */
  colors: BrandingColors | null;
}

// ---------------------------------------------------------------------------
// GenerateMetadataOptions
// ---------------------------------------------------------------------------

/**
 * Optional page-specific metadata overrides for generateTenantMetadata().
 */
export interface GenerateMetadataOptions {
  title?: string;
  description?: string;
  path?: string;
}
