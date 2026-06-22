/**
 * Routing type definitions for EstateFlow CRM.
 *
 * TenantRoutingInfo — resolved tenant data used by edge middleware and downstream handlers.
 * SubdomainResult — result of parsing a hostname into subdomain components.
 * MiddlewareHeaders — headers injected by the routing middleware on every request.
 */

// ---------------------------------------------------------------------------
// TenantRoutingInfo
// ---------------------------------------------------------------------------

export interface TenantRoutingInfo {
  tenantId: string;
  slug: string;
  name: string;
  domain: string | null;
  logo_url: string | null;
  primary_color: string | null;
}

// ---------------------------------------------------------------------------
// SubdomainResult
// ---------------------------------------------------------------------------

export interface SubdomainResult {
  subdomain: string | null;
  domain: string;
  isCustomDomain: boolean;
}

// ---------------------------------------------------------------------------
// MiddlewareHeaders
// ---------------------------------------------------------------------------

export interface MiddlewareHeaders {
  'x-tenant-id': string;
  'x-tenant-slug': string;
  'x-tenant-domain'?: string;
}
