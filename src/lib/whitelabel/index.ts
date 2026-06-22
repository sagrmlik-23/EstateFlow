// ============================================================================
// EstateFlow CRM — White-Label Module Barrel Export
// Agent-5-Whitelabel Contract v1.0.0
// ============================================================================

// ─── Types ─────────────────────────────────────────────────────────────────

export type {
  WhiteLabelConfig,
  BrandingColors,
  UseTenantResult,
  GenerateMetadataOptions,
} from '@/types/whitelabel';

// ─── Config ────────────────────────────────────────────────────────────────

export {
  getTenantConfig,
  getCachedTenantConfig,
  setCachedTenantConfig,
  computeBrandingColors,
  injectBrandingCSS,
  generateBrandingCSS,
  generateDefaultBranding,
  hexToRgb,
} from './config';

// ─── React Hook ────────────────────────────────────────────────────────────

export { useTenant } from './useTenant';

// ─── Metadata ──────────────────────────────────────────────────────────────

export {
  generateTenantMetadata,
  generateFaviconPreloadMetadata,
} from './metadata';

// ─── Components ────────────────────────────────────────────────────────────

export { default as ClientLayout } from '@/components/layout/ClientLayout';
export type { ClientLayoutProps } from '@/components/layout/ClientLayout';

export { default as TenantLogo } from '@/components/layout/TenantLogo';
export type { TenantLogoProps } from '@/components/layout/TenantLogo';

export { default as TenantFavicon } from '@/components/layout/TenantFavicon';
export type { TenantFaviconProps } from '@/components/layout/TenantFavicon';
