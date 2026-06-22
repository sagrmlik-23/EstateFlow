// ============================================================================
// EstateFlow CRM — WATI WhatsApp Business API Provider
// Phase 4 — Communication (AGENT-4-2-WHATSAPP-SMS)
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WATIConfig {
  apiKey: string;
  whatsappNumber: string; // E.164 format, e.g. +919876543210
  baseUrl?: string;
  webhookVerifyToken?: string;
}

export interface WATIMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  [key: string]: unknown;
}

export interface WATIMessageStatus {
  messageId: string;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp?: string;
  error?: string;
}

export interface WATIWebhookPayload {
  /** WATI webhook event type */
  event?:
    | 'message_received'
    | 'message_sent'
    | 'message_delivered'
    | 'message_read'
    | 'message_failed';
  /** Unique message ID from WATI */
  id?: string;
  /** Sender phone number (WhatsApp ID) */
  from?: string;
  /** Recipient phone number */
  to?: string;
  /** Message body text */
  body?: string;
  /** Message type */
  type?: 'text' | 'image' | 'document' | 'location' | 'button';
  /** Media URL if type is image/document */
  mediaUrl?: string;
  /** Media filename if type is document */
  fileName?: string;
  /** Latitude for location messages */
  latitude?: number;
  /** Longitude for location messages */
  longitude?: number;
  /** Label for location messages */
  label?: string;
  /** Button reply text */
  buttonText?: string;
  /** Timestamp of the event */
  timestamp?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WATI_BASE_URL = 'https://live.wati.io/api/v1';
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
        `WATI API error (${response.status}): ${errorBody || response.statusText}`,
      );
    }

    // Some WATI endpoints return 200 with empty body
    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildHeaders(config: WATIConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// WATIProvider
// ---------------------------------------------------------------------------

export class WATIProvider {
  public readonly name = 'wati' as const;
  private readonly config: WATIConfig;
  private readonly baseUrl: string;

  constructor(config: WATIConfig) {
    if (!config.apiKey) {
      throw new Error('WATI provider requires an apiKey');
    }
    if (!config.whatsappNumber) {
      throw new Error('WATI provider requires a whatsappNumber');
    }
    this.config = config;
    this.baseUrl = config.baseUrl ?? WATI_BASE_URL;
  }

  // -----------------------------------------------------------------------
  // sendMessage — Send a template message
  // -----------------------------------------------------------------------

  async sendMessage(
    to: string,
    templateName: string,
    params?: Record<string, string>,
  ): Promise<WATIMessageResult> {
    try {
      const body: Record<string, unknown> = {
        to,
        templateName,
      };

      if (params && Object.keys(params).length > 0) {
        body.parameters = Object.entries(params).map(([key, value]) => ({
          name: key,
          value,
        }));
      }

      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/sendTemplateMessage?whatsappNumber=${encodeURIComponent(this.config.whatsappNumber)}`,
        {
          method: 'POST',
          headers: buildHeaders(this.config),
          body: JSON.stringify(body),
        },
      );

      return {
        success: true,
        messageId: (data.messageId as string) ?? (data.id as string) ?? undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown WATI send error',
      };
    }
  }

  // -----------------------------------------------------------------------
  // sendImage — Send an image message
  // -----------------------------------------------------------------------

  async sendImage(
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<WATIMessageResult> {
    try {
      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/sendImage?whatsappNumber=${encodeURIComponent(this.config.whatsappNumber)}`,
        {
          method: 'POST',
          headers: buildHeaders(this.config),
          body: JSON.stringify({
            to,
            imageUrl,
            caption: caption ?? '',
          }),
        },
      );

      return {
        success: true,
        messageId: (data.messageId as string) ?? (data.id as string) ?? undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown WATI sendImage error',
      };
    }
  }

  // -----------------------------------------------------------------------
  // sendDocument — Send a document/file
  // -----------------------------------------------------------------------

  async sendDocument(
    to: string,
    documentUrl: string,
    filename?: string,
  ): Promise<WATIMessageResult> {
    try {
      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/sendDocument?whatsappNumber=${encodeURIComponent(this.config.whatsappNumber)}`,
        {
          method: 'POST',
          headers: buildHeaders(this.config),
          body: JSON.stringify({
            to,
            documentUrl,
            fileName: filename ?? 'document.pdf',
          }),
        },
      );

      return {
        success: true,
        messageId: (data.messageId as string) ?? (data.id as string) ?? undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown WATI sendDocument error',
      };
    }
  }

  // -----------------------------------------------------------------------
  // sendLocation — Send a location message
  // -----------------------------------------------------------------------

  async sendLocation(
    to: string,
    lat: number,
    lng: number,
    label?: string,
  ): Promise<WATIMessageResult> {
    try {
      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/sendLocation?whatsappNumber=${encodeURIComponent(this.config.whatsappNumber)}`,
        {
          method: 'POST',
          headers: buildHeaders(this.config),
          body: JSON.stringify({
            to,
            latitude: lat,
            longitude: lng,
            label: label ?? '',
          }),
        },
      );

      return {
        success: true,
        messageId: (data.messageId as string) ?? (data.id as string) ?? undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown WATI sendLocation error',
      };
    }
  }

  // -----------------------------------------------------------------------
  // getMessageStatus — Check delivery status
  // -----------------------------------------------------------------------

  async getMessageStatus(messageId: string): Promise<WATIMessageStatus> {
    try {
      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/getMessageStatus?messageId=${encodeURIComponent(messageId)}`,
        {
          method: 'GET',
          headers: buildHeaders(this.config),
        },
      );

      return {
        messageId: (data.id as string) ?? messageId,
        status: this.mapStatus((data.status as string) ?? 'sent'),
        timestamp: (data.timestamp as string) ?? undefined,
        error: (data.error as string) ?? undefined,
      };
    } catch (error) {
      return {
        messageId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error fetching status',
      };
    }
  }

  // -----------------------------------------------------------------------
  // handleWebhook — Process incoming WATI webhook payload
  // -----------------------------------------------------------------------

  handleWebhook(payload: WATIWebhookPayload): {
    event: string | undefined;
    messageId: string | undefined;
    from: string | undefined;
    to: string | undefined;
    body: string | undefined;
    type: string | undefined;
    mediaUrl: string | undefined;
    fileName: string | undefined;
    latitude: number | undefined;
    longitude: number | undefined;
    status: string;
  } {
    return {
      event: payload.event,
      messageId: payload.id,
      from: payload.from,
      to: payload.to,
      body: payload.body,
      type: payload.type,
      mediaUrl: payload.mediaUrl,
      fileName: payload.fileName,
      latitude: payload.latitude,
      longitude: payload.longitude,
      status: this.mapStatusFromEvent(payload.event),
    };
  }

  // -----------------------------------------------------------------------
  // validateConfig — Verify WATI API key works
  // -----------------------------------------------------------------------

  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    try {
      // Ping a lightweight WATI endpoint to verify the API key
      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/ping`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        },
        10_000,
      );
      return { valid: data != null };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown WATI validation error',
      };
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private mapStatus(watiStatus: string): WATIMessageStatus['status'] {
    const map: Record<string, WATIMessageStatus['status']> = {
      queued: 'queued',
      sent: 'sent',
      delivered: 'delivered',
      read: 'read',
      failed: 'failed',
    };
    return map[watiStatus.toLowerCase()] ?? 'sent';
  }

  private mapStatusFromEvent(
    event?: string,
  ): WATIMessageStatus['status'] {
    const map: Record<string, WATIMessageStatus['status']> = {
      message_sent: 'sent',
      message_delivered: 'delivered',
      message_read: 'read',
      message_failed: 'failed',
      message_received: 'delivered',
    };
    return map[event ?? ''] ?? 'sent';
  }
}
