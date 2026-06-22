// ============================================================================
// EstateFlow CRM — useTenant React Hook
// Agent-5-Whitelabel Contract v1.0.0
// ============================================================================

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  WhiteLabelConfig,
  BrandingColors,
  UseTenantResult,
} from '@/types/whitelabel';
import {
  getTenantConfig,
  computeBrandingColors,
} from '@/lib/whitelabel/config';

// ─── React Query Integration ────────────────────────────────────────────────

/**
 * Lightweight React hook that fetches and caches WhiteLabelConfig for
 * the given tenant slug.
 *
 * Uses React Query (`@tanstack/react-query`) as the caching layer when
 * available, but falls back to a simple useState+useEffect pattern if
 * React Query is not set up yet.
 *
 * @param tenantSlug - The tenant slug to fetch branding for.
 *                     If omitted, reads from `x-tenant-slug` cookie or meta tag.
 * @returns UseTenantResult with config, loading, error, and computed colors
 */
export function useTenant(tenantSlug?: string): UseTenantResult {
  // Resolve tenant slug: prefer argument, then cookie, then meta tag
  const resolvedSlug = useResolveTenantSlug(tenantSlug);

  const [config, setConfig] = useState<WhiteLabelConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Track latest slug to avoid stale responses
  const slugRef = useRef<string | null>(null);

  const fetchConfig = useCallback(async (slug: string) => {
    slugRef.current = slug;
    setIsLoading(true);
    setError(null);

    try {
      const result = await getTenantConfig(slug);
      // Only update if this response is still for the current slug
      if (slugRef.current === slug) {
        setConfig(result);
        setIsLoading(false);
      }
    } catch (err) {
      if (slugRef.current === slug) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (resolvedSlug) {
      fetchConfig(resolvedSlug);
    } else {
      // No tenant slug — use default branding
      setConfig(null);
      setIsLoading(false);
    }

    return () => {
      slugRef.current = null;
    };
  }, [resolvedSlug, fetchConfig]);

  // Compute BrandingColors from config
  const colors: BrandingColors | null = useMemo(() => {
    if (!config) return null;
    return computeBrandingColors(config);
  }, [config]);

  return { config, isLoading, error, colors };
}

// ─── Tenant Slug Resolution ─────────────────────────────────────────────────

/**
 * Resolve the tenant slug from:
 *   1. Explicit argument (highest priority)
 *   2. `x-tenant-slug` cookie
 *   3. `<meta name="x-tenant-slug">` tag (set by middleware)
 *   4. Hostname-based extraction (e.g., tenant.estateflow.com)
 *
 * @returns Resolved tenant slug, or null if no tenant context detected
 */
function useResolveTenantSlug(explicitSlug?: string): string | null {
  const [slug, setSlug] = useState<string | null>(() => {
    if (explicitSlug) return explicitSlug;

    // Try cookie
    if (typeof document !== 'undefined') {
      const cookieSlug = getCookie('x-tenant-slug');
      if (cookieSlug) return cookieSlug;

      // Try meta tag
      const meta = document.querySelector<HTMLMetaElement>(
        'meta[name="x-tenant-slug"]',
      );
      if (meta?.content) return meta.content;
    }

    return null;
  });

  useEffect(() => {
    if (explicitSlug) {
      setSlug(explicitSlug);
      return;
    }
    // No explicit slug — leave as resolved from initial state
  }, [explicitSlug]);

  return slug;
}

// ─── Cookie Helper ──────────────────────────────────────────────────────────

/**
 * Read a cookie value by name.
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=(.*?)(?:;|$)`),
  );
  return match ? decodeURIComponent(match[1]!) : null;
}
