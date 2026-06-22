// ============================================================================
// EstateFlow CRM — White-Label Config Service
// Agent-5-Whitelabel Contract v1.0.0
// ============================================================================

import type {
  WhiteLabelConfig,
  BrandingColors,
} from '@/types/whitelabel';
import { APP_NAME } from '@/lib/constants';
import { CACHE_TTL } from '@/lib/constants';

// ─── Default Branding ───────────────────────────────────────────────────────

const DEFAULT_PRIMARY = '#1e40af';
const DEFAULT_SECONDARY = '#64748b';
const DEFAULT_ACCENT = '#f59e0b';

/**
 * Returns the default EstateFlow CRM branding config, used as fallback
 * when no tenant config is available (e.g., super admin login page).
 */
export function generateDefaultBranding(): WhiteLabelConfig {
  return {
    tenant_id: 'default',
    company_name: APP_NAME,
    logo_url: null,
    favicon_url: null,
    primary_color: DEFAULT_PRIMARY,
    secondary_color: DEFAULT_SECONDARY,
    accent_color: DEFAULT_ACCENT,
    custom_domain: null,
    email_sender_name: null,
    email_reply_to: null,
    whatsapp_number: null,
    sms_sender_id: null,
    is_white_label: false,
  };
}

// ─── Hex-to-RGB Helper ──────────────────────────────────────────────────────

/**
 * Convert a hex color string to a comma-separated RGB tuple.
 *
 * @param hex - Hex color string (e.g., '#1e40af', '1e40af', '#fff')
 * @returns RGB tuple as string (e.g., '30, 64, 175') or fallback
 */
export function hexToRgb(hex: string | null | undefined, fallback: string): string {
  if (!hex) return fallback;

  // Normalise: remove leading #
  const clean = hex.replace(/^#/, '');

  // Handle short hex (e.g., #fff -> #ffffff)
  const full =
    clean.length === 3
      ? clean[0]!.repeat(2) + clean[1]!.repeat(2) + clean[2]!.repeat(2)
      : clean;

  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num) || full.length !== 6) return fallback;

  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  return `${r}, ${g}, ${b}`;
}

// ─── Compute Branding Colors ───────────────────────────────────────────────

/**
 * Converts a WhiteLabelConfig into a BrandingColors map with computed
 * RGB values for rgba() CSS usage.
 *
 * Null/undefined color fields fall back to EstateFlow brand defaults.
 */
export function computeBrandingColors(config: WhiteLabelConfig): BrandingColors {
  const primary = config.primary_color ?? DEFAULT_PRIMARY;
  const secondary = config.secondary_color ?? DEFAULT_SECONDARY;
  const accent = config.accent_color ?? DEFAULT_ACCENT;

  return {
    primary,
    secondary,
    accent,
    primaryRgb: hexToRgb(primary, '30, 64, 175'),
    secondaryRgb: hexToRgb(secondary, '100, 116, 139'),
    accentRgb: hexToRgb(accent, '245, 158, 11'),
  };
}

// ─── Inject Branding CSS ───────────────────────────────────────────────────

/**
 * Injects CSS custom properties onto the document root element (:root)
 * for dynamic tenant-specific theming.
 *
 * Sets the following CSS variables:
 *   --tenant-primary, --tenant-secondary, --tenant-accent
 *   --tenant-primary-rgb, --tenant-secondary-rgb, --tenant-accent-rgb
 *   --tenant-logo-url, --tenant-name
 *
 * @param colors  - Computed BrandingColors to apply
 * @param config  - WhiteLabelConfig for non-color variables (logo, name)
 * @param root    - Target element (defaults to document.documentElement)
 */
export function injectBrandingCSS(
  colors: BrandingColors,
  config: WhiteLabelConfig,
  root: HTMLElement = document.documentElement,
): void {
  root.style.setProperty('--tenant-primary', colors.primary);
  root.style.setProperty('--tenant-primary-rgb', colors.primaryRgb);
  root.style.setProperty('--tenant-secondary', colors.secondary);
  root.style.setProperty('--tenant-secondary-rgb', colors.secondaryRgb);
  root.style.setProperty('--tenant-accent', colors.accent);
  root.style.setProperty('--tenant-accent-rgb', colors.accentRgb);
  root.style.setProperty('--tenant-logo-url', config.logo_url ? `url(${config.logo_url})` : "''");
  root.style.setProperty('--tenant-name', JSON.stringify(config.company_name));
}

/**
 * Generates a `<style>` tag content string with the tenant's CSS variables.
 * Useful for server-side / RSC injection before client hydration.
 *
 * @returns CSS string with :root custom properties
 */
export function generateBrandingCSS(
  colors: BrandingColors,
  config: WhiteLabelConfig,
): string {
  const logoValue = config.logo_url ? `url(${config.logo_url})` : "''";
  const nameValue = JSON.stringify(config.company_name);

  return `
:root {
  --tenant-primary: ${colors.primary};
  --tenant-primary-rgb: ${colors.primaryRgb};
  --tenant-secondary: ${colors.secondary};
  --tenant-secondary-rgb: ${colors.secondaryRgb};
  --tenant-accent: ${colors.accent};
  --tenant-accent-rgb: ${colors.accentRgb};
  --tenant-logo-url: ${logoValue};
  --tenant-name: ${nameValue};
}`.trim();
}

// ─── In-memory Cache (module-level) ────────────────────────────────────────

interface CacheEntry {
  config: WhiteLabelConfig;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Sync read from in-memory cache. Returns null if not yet fetched or expired.
 *
 * @param tenantSlug - Tenant slug to look up
 * @returns Cached WhiteLabelConfig or null
 */
export function getCachedTenantConfig(tenantSlug: string): WhiteLabelConfig | null {
  const entry = cache.get(tenantSlug);
  if (!entry) return null;

  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL.TENANT_CONFIG * 1000) {
    cache.delete(tenantSlug);
    return null;
  }

  return entry.config;
}

/**
 * Store a WhiteLabelConfig in the in-memory cache.
 *
 * @param tenantSlug - Tenant slug to key by
 * @param config     - Config to cache
 */
export function setCachedTenantConfig(
  tenantSlug: string,
  config: WhiteLabelConfig,
): void {
  cache.set(tenantSlug, {
    config,
    timestamp: Date.now(),
  });
}

// ─── Fetch from API ────────────────────────────────────────────────────────

/**
 * Fetches tenant branding config from the public API endpoint.
 * Checks in-memory cache first; falls back to fetching from server.
 * Cache duration is 5 minutes (CACHE_TTL.TENANT_CONFIG).
 *
 * @param tenantSlug - The tenant slug to fetch config for
 * @param options    - Optional: forceRefresh to bypass cache, signal for AbortController
 * @throws If the API request fails or the tenant is not found
 * @returns Promise resolving to WhiteLabelConfig
 */
export async function getTenantConfig(
  tenantSlug: string,
  options?: { forceRefresh?: boolean; signal?: AbortSignal },
): Promise<WhiteLabelConfig> {
  // Check cache first
  if (!options?.forceRefresh) {
    const cached = getCachedTenantConfig(tenantSlug);
    if (cached) return cached;
  }

  // Build base URL (works in both browser and Node.js)
  const baseUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

  const url = `${baseUrl}/api/tenants/${encodeURIComponent(tenantSlug)}/branding`;

  const response = await fetch(url, {
    signal: options?.signal,
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Tenant "${tenantSlug}" not found`);
    }
    throw new Error(
      `Failed to fetch tenant branding: ${response.status} ${response.statusText}`,
    );
  }

  const json = await response.json();

  // The API returns { success: true, data: WhiteLabelConfig }
  if (!json.success || !json.data) {
    throw new Error('Invalid response from branding API');
  }

  const config = json.data as WhiteLabelConfig;

  // Cache it
  setCachedTenantConfig(tenantSlug, config);

  return config;
}
