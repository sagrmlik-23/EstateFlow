// ============================================================================
// EstateFlow CRM — Exotel Voice Provider
// Phase 4 — Voice Adapter (AGENT-4-1-VOICE-ADAPTER)
//
// Exotel is India's leading cloud telephony platform.
// Supports +91 numbers, Hindi IVR, call recording, and webhooks.
// ============================================================================

import type {
  CommunicationProvider,
  CallParams,
  CallResult,
  CallStatusResponse,
  WebhookResult,
  ProviderConfig,
} from '@/types/communication';
import type { VoiceProviderName } from '@/types/communication';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXOTEL_BASE_URL = 'https://api.exotel.com/v1/accounts';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAuthHeader(apiKey: string, apiSecret: string): string {
  const encoded = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  return `Basic ${encoded}`;
}

function buildExotelUrl(baseUrl: string, accountSid: string, path: string): string {
  const base = baseUrl || EXOTEL_BASE_URL;
  return `${base}/${encodeURIComponent(accountSid)}${path}`;
}

async function apiRequest<T>(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(
          `Exotel API error (${response.status}): ${errorBody || response.statusText}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
    }
  }
  throw new Error('Unreachable — all retries exhausted');
}

function mapExotelStatus(exotelStatus: string): string {
  const statusMap: Record<string, string> = {
    scheduled: 'queued',
    ringing: 'ringing',
    'in-progress': 'in_progress',
    in_progress: 'in_progress',
    completed: 'completed',
    failed: 'failed',
    'no-answer': 'no_answer',
    no_answer: 'no_answer',
    busy: 'busy',
    cancelled: 'cancelled',
    missed: 'missed',
  };
  return statusMap[exotelStatus?.toLowerCase()] ?? exotelStatus ?? 'unknown';
}

// ---------------------------------------------------------------------------
// ExotelProvider
// ---------------------------------------------------------------------------

export class ExotelProvider implements CommunicationProvider {
  public readonly name: VoiceProviderName = 'exotel';
  private readonly config: ProviderConfig;
  private readonly baseUrl: string;
  private readonly accountSid: string;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) throw new Error('Exotel provider requires an apiKey');
    if (!config.apiSecret) throw new Error('Exotel provider requires an apiSecret');
    if (!config.accountSid) throw new Error('Exotel provider requires an accountSid');

    this.config = config;
    this.baseUrl = config.baseUrl ?? EXOTEL_BASE_URL;
    this.accountSid = config.accountSid;
  }

  // -----------------------------------------------------------------------
  // makeCall
  // -----------------------------------------------------------------------

  async makeCall(params: CallParams): Promise<CallResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      // Exotel Connect Call API — uses form-encoded POST
      // https://developer.exotel.com/api/connect-call
      const formBody = new URLSearchParams();
      formBody.append('From', params.from || this.config.fromNumber || '');
      formBody.append('To', params.to);
      formBody.append('CallerId', params.from || this.config.fromNumber || '');
      formBody.append('Record', params.record !== false ? 'true' : 'false');

      if (params.url) {
        formBody.append('Url', params.url);
      }

      if (params.callType) {
        formBody.append('CallType', params.callType); // 'trans' for transactional, 'promo' for promotional
      }

      // Custom headers for metadata
      if (params.tenantId) formBody.append('CustomField', params.tenantId);
      if (params.leadId) formBody.append('StatusCallback', params.leadId);

      const url = buildExotelUrl(this.baseUrl, this.accountSid, '/calls/connect');
      const data = await apiRequest<Record<string, unknown>>(
        url,
        {
          method: 'POST',
          headers: {
            Authorization: buildAuthHeader(this.config.apiKey, this.config.apiSecret),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formBody.toString(),
          signal: controller.signal,
        },
      );

      // Exotel returns { call: { Sid, ... } }
      const callData = (data.call || data) as Record<string, unknown>;
      const callSid = (callData.Sid || callData.sid || callData.id) as string | undefined;

      if (!callSid) {
        throw new Error('Exotel did not return a call SID');
      }

      return {
        callSid,
        status: mapExotelStatus((callData.Status as string) ?? 'queued'),
        provider: this.name,
        message: 'Call initiated successfully via Exotel',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // -----------------------------------------------------------------------
  // getCallStatus
  // -----------------------------------------------------------------------

  async getCallStatus(callSid: string): Promise<CallStatusResponse> {
    const url = buildExotelUrl(this.baseUrl, this.accountSid, `/calls/${encodeURIComponent(callSid)}`);
    const data = await apiRequest<Record<string, unknown>>(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: buildAuthHeader(this.config.apiKey, this.config.apiSecret),
        },
      },
    );

    const callData = (data.call || data) as Record<string, unknown>;

    return {
      callSid: (callData.Sid as string) ?? callSid,
      status: mapExotelStatus((callData.Status as string) ?? ''),
      durationSeconds: (callData.Duration as number) ?? undefined,
      recordingUrl: (callData.RecordingUrl as string) ?? null,
      price: (callData.Price as number) ?? undefined,
      direction: (callData.Direction as 'inbound' | 'outbound') ?? undefined,
      from: (callData.From as string) ?? undefined,
      to: (callData.To as string) ?? undefined,
      error: (callData.ErrorMessage as string) ?? null,
    };
  }

  // -----------------------------------------------------------------------
  // getRecording
  // -----------------------------------------------------------------------

  async getRecording(callSid: string): Promise<string | null> {
    const url = buildExotelUrl(this.baseUrl, this.accountSid, `/calls/${encodeURIComponent(callSid)}`);
    const data = await apiRequest<Record<string, unknown>>(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: buildAuthHeader(this.config.apiKey, this.config.apiSecret),
        },
      },
    );

    const callData = (data.call || data) as Record<string, unknown>;
    return (callData.RecordingUrl as string) ?? null;
  }

  // -----------------------------------------------------------------------
  // transcribe
  // -----------------------------------------------------------------------

  async transcribe(callSid: string): Promise<string | null> {
    try {
      const url = buildExotelUrl(this.baseUrl, this.accountSid, `/calls/${encodeURIComponent(callSid)}/transcriptions`);
      const data = await apiRequest<Record<string, unknown>>(
        url,
        {
          method: 'GET',
          headers: {
            Authorization: buildAuthHeader(this.config.apiKey, this.config.apiSecret),
          },
        },
      );

      const transcriptionData = (data.transcription || data) as Record<string, unknown>;
      return (transcriptionData.text || transcriptionData.content || null) as string | null;
    } catch {
      // Exotel transcription may not be available
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // validateConfig
  // -----------------------------------------------------------------------

  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    try {
      // Ping the account endpoint to verify credentials
      const url = buildExotelUrl(this.baseUrl, this.accountSid, '');
      await apiRequest<Record<string, unknown>>(
        url,
        {
          method: 'GET',
          headers: {
            Authorization: buildAuthHeader(this.config.apiKey, this.config.apiSecret),
          },
        },
        0, // no retries for validation
      );
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  // -----------------------------------------------------------------------
  // handleCallback
  // -----------------------------------------------------------------------

  handleCallback(payload: Record<string, unknown>): WebhookResult {
    // Exotel sends call status callbacks as form-encoded data that arrives
    // as JSON or URLSearchParams depending on configuration
    return {
      callSid: (payload.CallSid || payload.call_sid || payload.CallId || '') as string,
      status: mapExotelStatus((payload.Status || payload.status || payload.CallStatus || '') as string),
      recordingUrl: (payload.RecordingUrl || payload.recording_url || null) as string | null,
      duration: parseInt((payload.Duration || payload.duration || '0') as string, 10) || undefined,
      price: parseFloat((payload.Price || payload.price || '0') as string) || undefined,
      direction: (payload.Direction || payload.direction || 'outbound') as 'inbound' | 'outbound',
      from: (payload.From || payload.from || '') as string,
      to: (payload.To || payload.to || '') as string,
      error: (payload.ErrorMessage || payload.error_message || null) as string | null,
    };
  }
}
