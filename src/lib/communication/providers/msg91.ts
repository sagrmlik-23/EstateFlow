// ============================================================================
// EstateFlow CRM — MSG91 SMS Provider (India-focused)
// Phase 4 — Communication (AGENT-4-2-WHATSAPP-SMS)
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MSG91Config {
  authKey: string;
  senderId: string; // 6-character alphanumeric sender ID
  dltTemplateId?: string; // DLT (TRAI) template ID for transactional SMS
  route?: 'transactional' | 'promotional';
  baseUrl?: string;
}

export interface MSG91SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  /** MSG91 returns a 'type' in success responses */
  type?: string;
  [key: string]: unknown;
}

export interface MSG91OTPResult {
  success: boolean;
  sessionId?: string;
  error?: string;
  [key: string]: unknown;
}

export interface MSG91StatusResult {
  messageId: string;
  status: 'sent' | 'delivered' | 'failed' | 'unknown';
  deliveredAt?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MSG91_BASE_URL = 'https://api.msg91.com/api/v5';
const DEFAULT_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiRequest<T>(
  url: string,
  options: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `MSG91 API error (${response.status}): ${errorBody || response.statusText}`,
      );
    }

    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// MSG91Provider
// ---------------------------------------------------------------------------

export class MSG91Provider {
  public readonly name = 'msg91' as const;
  private readonly config: MSG91Config;
  private readonly baseUrl: string;

  constructor(config: MSG91Config) {
    if (!config.authKey) {
      throw new Error('MSG91 provider requires an authKey');
    }
    if (!config.senderId || config.senderId.length > 6) {
      throw new Error('MSG91 provider requires a senderId (max 6 chars)');
    }
    this.config = config;
    this.baseUrl = config.baseUrl ?? MSG91_BASE_URL;
  }

  // -----------------------------------------------------------------------
  // sendSMS — Send a transactional SMS
  // -----------------------------------------------------------------------

  async sendSMS(
    to: string,
    message: string,
    options?: {
      unicode?: boolean;
      dltTemplateId?: string;
    },
  ): Promise<MSG91SMSResult> {
    try {
      const body: Record<string, unknown> = {
        sender: this.config.senderId,
        route: this.config.route ?? 'transactional',
        sms: [
          {
            message,
            to: [to.replace(/[^0-9]/g, '')],
          },
        ],
      };

      // DLT template ID (TRAI compliance for India)
      const templateId = options?.dltTemplateId ?? this.config.dltTemplateId;
      if (templateId) {
        body.DLT_TE_ID = templateId;
      }

      // Unicode support (Hindi, etc.)
      if (options?.unicode) {
        body.unicode = 1;
      }

      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/sms/send`,
        {
          method: 'POST',
          headers: {
            authkey: this.config.authKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );

      // MSG91 returns { type: 'success', message: '', request_id: '...' }
      const requestId = data.request_id as string | undefined;
      return {
        success: data.type === 'success',
        messageId: requestId,
        type: data.type as string | undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown MSG91 sendSMS error',
      };
    }
  }

  // -----------------------------------------------------------------------
  // sendOTP — Send OTP via SMS
  // -----------------------------------------------------------------------

  async sendOTP(
    to: string,
    otp: string,
    options?: {
      unicode?: boolean;
      expiryMinutes?: number;
    },
  ): Promise<MSG91OTPResult> {
    try {
      const body: Record<string, unknown> = {
        authkey: this.config.authKey,
        sender: this.config.senderId,
        mobile: to.replace(/[^0-9]/g, ''),
        otp,
        otp_expiry: options?.expiryMinutes ?? 10,
      };

      if (options?.unicode) {
        body.unicode = 1;
      }

      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );

      return {
        success: data.type === 'success',
        sessionId: (data.session_id as string) ?? undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown MSG91 sendOTP error',
      };
    }
  }

  // -----------------------------------------------------------------------
  // verifyOTP — Verify an OTP
  // -----------------------------------------------------------------------

  async verifyOTP(
    sessionId: string,
    otp: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/otp/verify?session_id=${encodeURIComponent(sessionId)}&otp=${encodeURIComponent(otp)}`,
        {
          method: 'GET',
          headers: {
            authkey: this.config.authKey,
          },
        },
      );

      return {
        success: data.type === 'success',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown MSG91 verifyOTP error',
      };
    }
  }

  // -----------------------------------------------------------------------
  // getSMSStatus — Check delivery status
  // -----------------------------------------------------------------------

  async getSMSStatus(messageId: string): Promise<MSG91StatusResult> {
    try {
      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/sms/status?request_id=${encodeURIComponent(messageId)}`,
        {
          method: 'GET',
          headers: {
            authkey: this.config.authKey,
          },
        },
      );

      return {
        messageId,
        status: this.mapStatus(data.status as string | undefined),
        deliveredAt: (data.delivered_at as string) ?? undefined,
        error: (data.error as string) ?? undefined,
      };
    } catch (error) {
      return {
        messageId,
        status: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error fetching SMS status',
      };
    }
  }

  // -----------------------------------------------------------------------
  // validateConfig — Verify MSG91 auth key works
  // -----------------------------------------------------------------------

  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    try {
      // Use a simple balance/account check endpoint
      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/wallet/balance`,
        {
          method: 'GET',
          headers: {
            authkey: this.config.authKey,
          },
        },
        10_000,
      );
      return { valid: data != null };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown MSG91 validation error',
      };
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private mapStatus(msg91Status?: string): MSG91StatusResult['status'] {
    const map: Record<string, MSG91StatusResult['status']> = {
      sent: 'sent',
      delivered: 'delivered',
      failed: 'failed',
      undelivered: 'failed',
      rejected: 'failed',
      scheduled: 'sent',
      queued: 'sent',
    };
    return map[msg91Status?.toLowerCase() ?? ''] ?? 'unknown';
  }
}
