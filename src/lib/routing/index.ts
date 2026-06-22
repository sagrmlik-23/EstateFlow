/**
 * Routing module barrel export.
 *
 * Re-exports all public types, functions, and utilities from the routing subsystem
 * so consumers can import from a single entry point:
 *
 *   import { resolveTenantFromHost, parseSubdomain, getTenantFromCache } from '@/lib/routing';
 */

// ─── Subdomain Parser ───────────────────────────────────────────────────────

export {
  parseSubdomain,
  getDomainLevel,
  isReservedSubdomain,
  ESTATEFLOW_DOMAIN,
} from './subdomainParser';

// ─── Tenant Resolver ────────────────────────────────────────────────────────

export {
  resolveTenantFromHost,
  resolveTenantFromSubdomain,
  DEFAULT_TENANT_SLUG,
} from './tenantResolver';

// ─── Edge Config Cache ──────────────────────────────────────────────────────

export {
  getTenantFromCache,
  setTenantInCache,
  warmTenantCache,
  invalidateTenantCache,
} from './edgeConfigCache';

// ─── Types ──────────────────────────────────────────────────────────────────

export type { TenantRoutingInfo, SubdomainResult, MiddlewareHeaders } from '@/types/routing';
