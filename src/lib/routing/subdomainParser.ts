/**
 * Subdomain parsing utilities for EstateFlow CRM multi-tenant routing.
 *
 * Extracts subdomain information from hostnames, handles multi-level TLDs
 * (e.g. co.uk, com.au), and identifies reserved subdomains that bypass
 * tenant resolution.
 */

import { RESERVED_SUBDOMAINS } from '@/lib/constants';
import type { SubdomainResult } from '@/types/routing';

// ---------------------------------------------------------------------------
// Known multi-part TLDs (Public Suffix List subset)
// ---------------------------------------------------------------------------

const MULTI_PART_TLDS: Set<string> = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'net.uk',
  'com.au',
  'net.au',
  'org.au',
  'gov.au',
  'edu.au',
  'co.nz',
  'org.nz',
  'net.nz',
  'co.za',
  'org.za',
  'net.za',
  'co.in',
  'org.in',
  'net.in',
  'gov.in',
  'ac.in',
  'co.jp',
  'or.jp',
  'ne.jp',
  'ac.jp',
  'go.jp',
  'com.br',
  'org.br',
  'net.br',
  'gov.br',
  'co.kr',
  'or.kr',
  'ne.kr',
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'com.mx',
  'org.mx',
  'net.mx',
  'co.il',
  'org.il',
  'net.il',
  'ac.il',
  'gov.il',
]);

// ---------------------------------------------------------------------------
// Main application host — used to detect the EstateFlow.app platform domain
// ---------------------------------------------------------------------------

export const ESTATEFLOW_DOMAIN = 'estateflow.app';

// ---------------------------------------------------------------------------
// Reserved subdomain set (for fast lookup)
// ---------------------------------------------------------------------------

const RESERVED_SET: ReadonlySet<string> = new Set(RESERVED_SUBDOMAINS);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a hostname and extract the subdomain (if any).
 *
 * Handles:
 * - Apex domains (no subdomain):           example.com
 * - Single subdomain with single TLD:      tenant.example.com
 * - Single subdomain with multi-part TLD:  tenant.example.co.uk
 * - Multi-level subdomains:                app.tenant.example.com
 * - Subdomain on the EstateFlow domain:    tenant.estateflow.app
 * - Custom domains (no subdomain):         www.customrealty.com
 *
 * @param hostname - The full hostname from the request (e.g. "tenant.estateflow.app")
 * @returns SubdomainResult with parsed components
 */
export function parseSubdomain(hostname: string): SubdomainResult {
  if (!hostname) {
    return { subdomain: null, domain: hostname, isCustomDomain: false };
  }

  // Normalise: lowercase, strip port
  const cleanHost = hostname.toLowerCase().replace(/:\d+$/, '');

  // Handle localhost and IP addresses — not a tenant domain
  if (
    cleanHost === 'localhost' ||
    cleanHost.startsWith('localhost:') ||
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanHost)
  ) {
    return { subdomain: null, domain: cleanHost, isCustomDomain: false };
  }

  // Split into parts
  const parts = cleanHost.split('.');

  // Need at least 2 parts for a valid domain
  if (parts.length < 2) {
    return { subdomain: null, domain: cleanHost, isCustomDomain: false };
  }

  // Determine if the domain has a multi-part TLD
  const lastTwo = parts.slice(-2).join('.');
  const lastThree = parts.slice(-3).join('.');

  let domainLevels: number; // Number of parts that constitute the TLD + main domain

  if (MULTI_PART_TLDS.has(lastThree)) {
    domainLevels = 3; // e.g. something.co.uk
  } else if (MULTI_PART_TLDS.has(lastTwo)) {
    domainLevels = 2; // e.g. something.com
  } else {
    domainLevels = 2; // Default single-part TLD
  }

  const subdomainParts = parts.slice(0, parts.length - domainLevels);
  const domainCore = parts.slice(-domainLevels).join('.');

  // Check if this is the EstateFlow platform domain
  const isEstateFlowDomain = domainCore === ESTATEFLOW_DOMAIN || domainCore.endsWith('.' + ESTATEFLOW_DOMAIN);

  // If no subdomain part, it's an apex domain
  if (subdomainParts.length === 0) {
    return {
      subdomain: null,
      domain: domainCore,
      isCustomDomain: !isEstateFlowDomain,
    };
  }

  // For multi-level subdomains, take the first non-reserved level as the tenant subdomain
  // e.g. "app.tenant.estateflow.app" → subdomain = "tenant"
  let tenantSubdomain: string | null = null;

  for (const part of subdomainParts) {
    if (!RESERVED_SET.has(part)) {
      tenantSubdomain = part;
      break;
    }
  }

  // If all subdomain parts are reserved (e.g. "www.estateflow.app"), no tenant
  if (!tenantSubdomain) {
    return {
      subdomain: null,
      domain: domainCore,
      isCustomDomain: false,
    };
  }

  return {
    subdomain: tenantSubdomain,
    domain: domainCore,
    isCustomDomain: !isEstateFlowDomain,
  };
}

/**
 * Get the full domain-level breakdown of a hostname.
 *
 * Useful for debugging and logging.
 *
 * @param hostname - The full hostname
 * @returns Object with subdomain, domain, and TLD parts
 */
export function getDomainLevel(hostname: string): {
  subdomain: string | null;
  domain: string;
  tld: string;
} {
  const parsed = parseSubdomain(hostname);

  const parts = hostname.toLowerCase().replace(/:\d+$/, '').split('.');
  const lastPart = parts[parts.length - 1];
  const tld: string = lastPart ?? '';

  // For multi-part TLDs, reconstruct the full TLD
  let fullTld: string = tld;
  if (parts.length >= 2) {
    const lastTwo = parts.slice(-2).join('.');
    const lastThree = parts.slice(-3).join('.');
    if (MULTI_PART_TLDS.has(lastThree)) {
      fullTld = lastThree;
    } else if (MULTI_PART_TLDS.has(lastTwo)) {
      fullTld = lastTwo;
    }
  }

  return {
    subdomain: parsed.subdomain,
    domain: parsed.domain,
    tld: fullTld,
  };
}

/**
 * Check if a subdomain is reserved (bypasses tenant routing).
 *
 * @param subdomain - The subdomain to check
 * @returns True if the subdomain is reserved
 */
export function isReservedSubdomain(subdomain: string): boolean {
  return RESERVED_SET.has(subdomain.toLowerCase());
}
