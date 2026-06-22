// ============================================================================
// EstateFlow CRM — Email Template Renderer
// Agent-4-3-Email-Notifications v1.0.0
// ============================================================================

import { render } from '@react-email/render';
import type { ReactElement } from 'react';
import type { WhiteLabelConfig } from '@/types/whitelabel';

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/**
 * Render a React Email template component to an HTML string.
 *
 * @param component - React element (the template component with props)
 * @param options   - Optional render options (pretty, plainText)
 * @returns Promise resolving to the rendered HTML string
 */
export async function renderEmailTemplate(
  component: ReactElement,
  options?: { pretty?: boolean; plainText?: boolean },
): Promise<string> {
  return render(component, {
    pretty: options?.pretty ?? true,
    plainText: options?.plainText ?? false,
  });
}

// ---------------------------------------------------------------------------
// Branding injection
// ---------------------------------------------------------------------------

/**
 * Inject tenant branding (logo, colors, company name) into a rendered HTML
 * email by performing string replacements on template placeholders.
 *
 * Supported placeholders (added to templates):
 *   {{COMPANY_NAME}}    → Tenant company name
 *   {{PRIMARY_COLOR}}   → Primary brand hex color
 *   {{SECONDARY_COLOR}} → Secondary brand hex color
 *   {{LOGO_URL}}        → Tenant logo URL
 *
 * For white-label tenants, "Powered by EstateFlow" footers and EstateFlow
 * brand references are stripped.
 *
 * @param html   - Raw HTML string from rendered template
 * @param config - Tenant white-label configuration
 * @returns HTML string with branding injected
 */
export function injectBranding(
  html: string,
  config: WhiteLabelConfig,
): string {
  const {
    is_white_label,
    company_name,
    logo_url,
    primary_color,
    secondary_color,
  } = config;

  const companyName = company_name || 'EstateFlow CRM';
  const primary = primary_color || '#1e40af';
  const secondary = secondary_color || '#64748b';

  // Replace placeholders
  html = html
    .replace(/\{\{COMPANY_NAME\}\}/g, companyName)
    .replace(/\{\{PRIMARY_COLOR\}\}/g, primary)
    .replace(/\{\{SECONDARY_COLOR\}\}/g, secondary);

  // Logo — either insert URL or remove the logo placeholder block
  if (logo_url && is_white_label) {
    html = html.replace(/\{\{LOGO_URL\}\}/g, logo_url);
  } else {
    // Remove lines containing the logo placeholder
    html = html.replace(/^.*\{\{LOGO_URL\}\}.*$/gm, '');
    html = html.replace(/\{\{LOGO_URL\}\}/g, '');
  }

  // Strip EstateFlow branding for white-label tenants
  if (is_white_label) {
    html = html.replace(
      /<div[^>]*data-brand="estateflow"[^>]*>[\s\S]*?<\/div>/gi,
      '',
    );
    html = html.replace(/Powered by EstateFlow/gi, '');
    html = html.replace(/EstateFlow CRM/gi, companyName);
  }

  return html;
}

// ---------------------------------------------------------------------------
// RenderWithBranding (convenience)
// ---------------------------------------------------------------------------

/**
 * Render a React Email template and inject tenant branding in one call.
 *
 * @param component   - React element (template component)
 * @param config      - Tenant white-label config (null = no branding injection)
 * @param options     - Optional render options
 * @returns Promise resolving to the branded HTML string
 */
export async function renderWithBranding(
  component: ReactElement,
  config: WhiteLabelConfig | null,
  options?: { pretty?: boolean; plainText?: boolean },
): Promise<string> {
  const html = await renderEmailTemplate(component, options);

  if (!config) return html;

  return injectBranding(html, config);
}
