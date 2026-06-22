// ============================================================================
// EstateFlow CRM — Resend Email Provider
// Agent-4-3-Email-Notifications v1.0.0
// ============================================================================

import { Resend } from 'resend';
import type { ReactElement } from 'react';
import { render } from '@react-email/render';
import type { WhiteLabelConfig } from '@/types/whitelabel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  /** Sender address. Defaults to tenant config or RESEND_DEFAULT_FROM env var */
  from?: string;
  /** Reply-to address. Defaults to tenant config if provided */
  replyTo?: string | string[];
  /** Optional attachments (base64-encoded content or Buffer) */
  attachments?: Array<{
    content?: string | Buffer;
    filename?: string | false;
    path?: string;
    contentType?: string;
    contentId?: string;
  }>;
  /** ISO 8601 schedule time */
  scheduledAt?: string;
  /** CC recipients */
  cc?: string | string[];
  /** BCC recipients */
  bcc?: string | string[];
}

export interface SendTemplateEmailParams {
  /** Recipient email(s) */
  to: string | string[];
  /** Subject line */
  subject: string;
  /** React element (template component) to render */
  template: ReactElement;
  /** Template data (injected into template props) */
  data?: Record<string, unknown>;
  /** Tenant branding config for white-label injection */
  tenantConfig?: WhiteLabelConfig | null;
  /** Sender override */
  from?: string;
  /** Reply-to override */
  replyTo?: string | string[];
  /** Schedule time */
  scheduledAt?: string;
}

export interface ResendProviderConfig {
  apiKey: string;
  defaultFrom?: string;
  defaultFromName?: string;
}

// ---------------------------------------------------------------------------
// ResendProvider
// ---------------------------------------------------------------------------

/**
 * Resend email provider — sends transactional emails via the Resend API.
 *
 * Supports:
 * - Plain HTML emails
 * - React Email template rendering with branding injection
 * - Custom from name/email (white-label)
 * - Reply-to, attachments, scheduled sending
 * - Configuration validation
 */
export class ResendProvider {
  private readonly client: Resend;
  private readonly defaultFrom: string;
  private readonly defaultFromName: string;

  constructor(config: ResendProviderConfig) {
    this.client = new Resend(config.apiKey);
    this.defaultFrom = config.defaultFrom || process.env.RESEND_DEFAULT_FROM || 'noreply@estateflow.com';
    this.defaultFromName = config.defaultFromName || process.env.RESEND_DEFAULT_FROM_NAME || 'EstateFlow CRM';
  }

  // ─── Send plain HTML email ───────────────────────────────────────────────

  /**
   * Send a plain HTML email via Resend.
   *
   * @param params - Email sending parameters
   * @returns The Resend email ID on success
   * @throws If the API call fails
   */
  async sendEmail(params: SendEmailParams): Promise<{ id: string }> {
    const from = params.from ?? this.buildFromAddress();

    const { data, error } = await this.client.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
      attachments: params.attachments?.map((a) => ({
        content: a.content,
        filename: a.filename,
        path: a.path,
        content_type: a.contentType,
        content_id: a.contentId,
      })),
      scheduledAt: params.scheduledAt,
      cc: params.cc,
      bcc: params.bcc,
    });

    if (error || !data) {
      throw new Error(
        `Resend send failed: ${error?.message ?? 'Unknown error (no data returned)'}`,
      );
    }

    return { id: data.id };
  }

  // ─── Send React Email template ───────────────────────────────────────────

  /**
   * Render a React Email template, inject tenant branding, and send via Resend.
   *
   * @param params - Template email parameters
   * @returns The Resend email ID on success
   */
  async sendTemplateEmail(params: SendTemplateEmailParams): Promise<{ id: string }> {
    const html = await renderEmailTemplate(params.template, params.tenantConfig ?? null);

    return this.sendEmail({
      to: params.to,
      subject: params.subject,
      html,
      from: params.from ?? (params.tenantConfig?.email_sender_name
        ? `${params.tenantConfig.email_sender_name} <${params.tenantConfig.email_reply_to ?? this.defaultFrom}>`
        : this.buildFromAddress(params.tenantConfig)),
      replyTo: params.replyTo ?? params.tenantConfig?.email_reply_to ?? undefined,
      scheduledAt: params.scheduledAt,
    });
  }

  // ─── Validate configuration ──────────────────────────────────────────────

  /**
   * Verify that the Resend API key is valid by making a test request.
   *
   * @returns An object with `valid: boolean` and optional `message`.
   */
  async validateConfig(): Promise<{ valid: boolean; message?: string }> {
    try {
      // Try listing API keys as a lightweight validation call
      const { data, error } = await this.client.apiKeys.list();
      if (error) {
        return { valid: false, message: error.message };
      }
      return { valid: true, message: `Resend API key valid. Key prefix: ${data?.data?.[0]?.name ?? 'N/A'}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error validating Resend config';
      return { valid: false, message };
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Build the "From" address string, optionally using tenant white-label config.
   *
   * Format: `"Sender Name" <sender@domain.com>`
   */
  private buildFromAddress(tenantConfig?: WhiteLabelConfig | null): string {
    const name = tenantConfig?.email_sender_name ?? this.defaultFromName;
    const email = tenantConfig?.email_reply_to ?? this.defaultFrom;
    return `"${name}" <${email}>`;
  }
}

// ---------------------------------------------------------------------------
// Singleton / factory
// ---------------------------------------------------------------------------

let _instance: ResendProvider | null = null;

/**
 * Get or create the singleton ResendProvider instance.
 * Reads RESEND_API_KEY from environment variables.
 *
 * @returns Configured ResendProvider
 * @throws If RESEND_API_KEY is not set
 */
export function getResendProvider(): ResendProvider {
  if (_instance) return _instance;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY environment variable is not set. ' +
      'Set it in your .env.local file or deployment environment.',
    );
  }

  _instance = new ResendProvider({
    apiKey,
    defaultFrom: process.env.RESEND_DEFAULT_FROM,
    defaultFromName: process.env.RESEND_DEFAULT_FROM_NAME,
  });

  return _instance;
}

/**
 * Reset the singleton (useful for testing).
 */
export function resetResendProvider(): void {
  _instance = null;
}

// ---------------------------------------------------------------------------
// Render helper (shared with renderTemplate.ts pattern)
// ---------------------------------------------------------------------------

/**
 * Render a React Email template element to HTML string.
 * Optionally injects tenant branding (logo, primary color, company name).
 *
 * @param component - React Email component (ReactElement)
 * @param tenantConfig - Optional tenant branding config (null = use EstateFlow defaults)
 * @returns Rendered HTML string
 */
export async function renderEmailTemplate(
  component: ReactElement,
  tenantConfig: WhiteLabelConfig | null,
): Promise<string> {
  let html = await render(component, { pretty: true });

  if (tenantConfig) {
    html = injectBranding(html, tenantConfig);
  }

  return html;
}

// ---------------------------------------------------------------------------
// Branding injection
// ---------------------------------------------------------------------------

/**
 * Injects tenant branding (logo, colors, company name) into the rendered
 * HTML email. For white-label tenants, EstateFlow branding is replaced with
 * the tenant's own brand.
 *
 * @param html - Raw rendered HTML
 * @param config - Tenant white-label config
 * @returns HTML with branding variables replaced
 */
export function injectBranding(html: string, config: WhiteLabelConfig): string {
  const { is_white_label, company_name, logo_url, primary_color, secondary_color } = config;

  // Always inject company name and colors
  html = html
    .replace(/{{COMPANY_NAME}}/g, company_name || 'EstateFlow CRM')
    .replace(/{{PRIMARY_COLOR}}/g, primary_color || '#1e40af')
    .replace(/{{SECONDARY_COLOR}}/g, secondary_color || '#64748b');

  // Inject logo (or hide logo for non-white-label tenants)
  if (logo_url && is_white_label) {
    html = html.replace(/{{LOGO_URL}}/g, logo_url);
  } else {
    // Remove logo placeholder or use default EstateFlow logo
    html = html.replace(/{{LOGO_URL}}/g, '');
  }

  // Remove "Powered by EstateFlow" for white-label tenants
  if (is_white_label) {
    html = html.replace(
      /<div[^>]*data-brand="estateflow"[^>]*>[\s\S]*?<\/div>/gi,
      '',
    );
    html = html.replace(/Powered by EstateFlow/gi, '');
  }

  return html;
}
