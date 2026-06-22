// ============================================================================
// EstateFlow CRM — ClientLayout (use client)
// Agent-5-Whitelabel Contract v1.0.0
// ============================================================================

'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useTenant } from '@/lib/whitelabel/useTenant';
import { computeBrandingColors, generateDefaultBranding } from '@/lib/whitelabel/config';
import { injectBrandingCSS } from '@/lib/whitelabel/config';
import TenantFavicon from '@/components/layout/TenantFavicon';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ClientLayoutProps {
  children: ReactNode;
  /** Optional tenant slug override (otherwise auto-detected from cookie/header) */
  tenantSlug?: string;
}

// ─── ClientLayout ───────────────────────────────────────────────────────────

/**
 * Client-side wrapper component that injects tenant-specific CSS variables
 * on mount. Wraps children in a themed container.
 *
 * Renders children immediately with default EstateFlow brand colors, then
 * re-renders with tenant-specific colors once the config is fetched.
 *
 * CSS variables injected:
 *   --tenant-primary, --tenant-secondary, --tenant-accent
 *   --tenant-primary-rgb, --tenant-secondary-rgb, --tenant-accent-rgb
 *   --tenant-logo-url, --tenant-name
 */
export default function ClientLayout({
  children,
  tenantSlug,
}: ClientLayoutProps) {
  const { config, isLoading, error, colors } = useTenant(tenantSlug);

  // Compute fallback colors immediately for the first render
  const defaultBranding = useMemo(() => generateDefaultBranding(), []);
  const defaultColors = useMemo(() => computeBrandingColors(defaultBranding), [defaultBranding]);

  // Determine which colors to apply
  const activeColors = colors ?? defaultColors;
  const activeConfig = config ?? defaultBranding;

  // Track whether we've applied tenant colors (for fade-in transition)
  const hasTenantColors = useRef(false);
  if (config && !hasTenantColors.current) {
    hasTenantColors.current = true;
  }

  // Inject CSS variables into the document root
  useEffect(() => {
    injectBrandingCSS(activeColors, activeConfig);
  }, [activeColors, activeConfig]);

  return (
    <div
      className="tenant-themed"
      style={
        {
          '--tenant-primary': activeColors.primary,
          '--tenant-secondary': activeColors.secondary,
          '--tenant-accent': activeColors.accent,
          '--tenant-primary-rgb': activeColors.primaryRgb,
          '--tenant-secondary-rgb': activeColors.secondaryRgb,
          '--tenant-accent-rgb': activeColors.accentRgb,
          '--tenant-logo-url': activeConfig.logo_url
            ? `url(${activeConfig.logo_url})`
            : "''",
          '--tenant-name': activeConfig.company_name,
        } as React.CSSProperties
      }
    >
      {/* Tenant-specific favicon */}
      <TenantFavicon tenantSlug={tenantSlug} />

      {/* Loading indicator for slow fetches */}
      {isLoading && (
        <div
          className="fixed top-0 left-0 w-full h-0.5 z-50 transition-opacity duration-300"
          style={{
            backgroundColor: `rgb(var(--tenant-primary-rgb, 30, 64, 175))`,
            opacity: 0.6,
          }}
        >
          <div
            className="h-full animate-pulse rounded-full"
            style={{
              width: '30%',
              backgroundColor: `rgb(var(--tenant-primary-rgb, 30, 64, 175))`,
            }}
          />
        </div>
      )}

      {/* Error toast (subtle, non-blocking) */}
      {error && (
        <div
          className="fixed bottom-4 right-4 z-50 rounded-lg px-4 py-2 text-sm shadow-lg"
          style={{
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            border: '1px solid #fecaca',
          }}
          role="alert"
        >
          Failed to load tenant branding. Using defaults.
        </div>
      )}

      {children}
    </div>
  );
}
