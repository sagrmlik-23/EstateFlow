// ============================================================================
// EstateFlow CRM — TenantLogo Component (use client)
// Agent-5-Whitelabel Contract v1.0.0
// ============================================================================

'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Image from 'next/image';
import { useTenant } from '@/lib/whitelabel/useTenant';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface TenantLogoProps {
  /** Additional CSS classes for the container */
  className?: string;
  /** Custom fallback element when no logo_url is set */
  fallback?: ReactNode;
  /** Tenant slug override (auto-detected if omitted) */
  tenantSlug?: string;
  /** Image width (default: 120) */
  width?: number;
  /** Image height (default: 60) */
  height?: number;
}

// ─── TenantLogo ─────────────────────────────────────────────────────────────

/**
 * Renders the tenant's logo image using Next.js Image optimization.
 *
 * - Uses WhiteLabelConfig.logo_url for the image source
 * - Falls back to tenant name initials (or provided fallback) if no logo_url
 * - Respects alt text of "${tenantName} logo"
 * - Uses 2:1 aspect ratio container with object-contain
 */
export default function TenantLogo({
  className = '',
  fallback,
  tenantSlug,
  width = 120,
  height = 60,
}: TenantLogoProps) {
  const { config, isLoading } = useTenant(tenantSlug);

  // Logo load error state
  const [logoError, setLogoError] = useState(false);

  // Reset error state when config changes
  useEffect(() => {
    setLogoError(false);
  }, [config?.logo_url]);

  // ── Loading state ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center animate-pulse bg-muted rounded ${className}`}
        style={{ width, height }}
        aria-label="Loading logo"
      />
    );
  }

  // ── No config yet — render placeholder ──────────────────────────────────
  if (!config) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 rounded ${className}`}
        style={{ width, height }}
      >
        <span className="text-sm font-semibold text-gray-400">ES</span>
      </div>
    );
  }

  const { company_name, logo_url } = config;

  // ── Has logo URL and no error ───────────────────────────────────────────
  if (logo_url && !logoError) {
    return (
      <div
        className={`relative overflow-hidden ${className}`}
        style={{ width, height }}
      >
        <Image
          src={logo_url}
          alt={`${company_name} logo`}
          width={width}
          height={height}
          className="object-contain w-full h-full"
          priority
          onError={() => setLogoError(true)}
          unoptimized={!logo_url.startsWith('http') && !logo_url.startsWith('/')}
        />
      </div>
    );
  }

  // ── Fallback: show initials or custom fallback ──────────────────────────
  if (fallback) {
    return <>{fallback}</>;
  }

  const initials = company_name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');

  return (
    <div
      className={`flex items-center justify-center rounded ${className}`}
      style={{
        width,
        height,
        backgroundColor: `rgb(var(--tenant-primary-rgb, 30, 64, 175))`,
      }}
    >
      <span
        className="text-lg font-bold text-white select-none"
        style={{ fontSize: `${Math.min(width, height) * 0.35}px` }}
      >
        {initials || 'ES'}
      </span>
    </div>
  );
}
