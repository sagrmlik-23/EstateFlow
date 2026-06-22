// ============================================================================
// EstateFlow CRM — Vapi Voice Provider
// Phase 3 — AI Voice Agent (AGENT-3-1-PROVIDER-ADAPTER)
// ============================================================================

import type {
  AIVoiceProvider,
  AICallParams,
  AICallResult,
  AICallStatusResponse,
  ProviderConfig,
  VapiWebhookPayload,
  CallOutcome,
} from '@/types/ai';
import { AICallStatus, AIProviderName } from '@/types/ai';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VAPI_BASE_URL = 'https://api.vapi.ai';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Vapi uses assistant IDs (pre-configured in Vapi dashboard).
// Calls use assistants + optional overrides for voice, script, etc.
// ---------------------------------------------------------------------------

interface FetchOptions {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

async function apiRequest<T>(
  url: string,
  options: FetchOptions,
  retries = MAX_RETRIES,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(
          `Vapi API error (${response.status}): ${errorBody || response.statusText}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
    }
  }
  throw new Error('Unreachable — all retries exhausted');
}

function mapVapiStatus(vapiStatus: string): AICallStatus {
  const statusMap: Record<string, AICallStatus> = {
    queued: AICallStatus.Queued,
    ringing: AICallStatus.Ringing,
    'in-progress': AICallStatus.InProgress,
    in_progress: AICallStatus.InProgress,
    forwarding: AICallStatus.InProgress,
    completed: AICallStatus.Completed,
    failed: AICallStatus.Failed,
    'no-answer': AICallStatus.NoAnswer,
    no_answer: AICallStatus.NoAnswer,
    busy: AICallStatus.Busy,
    cancelled: AICallStatus.Cancelled,
  };
  return statusMap[vapiStatus?.toLowerCase()] ?? AICallStatus.Failed;
}

// ---------------------------------------------------------------------------
// VapiProvider
// ---------------------------------------------------------------------------

export class VapiProvider implements AIVoiceProvider {
  public readonly name: AIProviderName = 'vapi';
  private readonly config: ProviderConfig;
  private readonly baseUrl: string;
  /** Vapi requires an assistant ID (pre-configured in Vapi dashboard) */
  private readonly defaultAssistantId?: string;

  constructor(config: ProviderConfig, defaultAssistantId?: string) {
    if (!config.apiKey) {
      throw new Error('Vapi provider requires an apiKey');
    }
    this.config = config;
    this.baseUrl = config.baseUrl ?? VAPI_BASE_URL;
    this.defaultAssistantId = defaultAssistantId;
  }

  // -----------------------------------------------------------------------
  // makeCall
  // -----------------------------------------------------------------------

  async makeCall(params: AICallParams): Promise<AICallResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const assistantOverrides: Record<string, unknown> = {};

      if (params.script) {
        assistantOverrides.firstMessage = params.script;
        assistantOverrides.variableValues = {
          prompt: params.script,
          ...(params.metadata ?? {}),
        };
      }

      if (params.voice) {
        assistantOverrides.voice = params.voice;
      }

      if (params.language) {
        assistantOverrides.language = params.language;
      }

      const body: Record<string, unknown> = {
        phoneNumberId: params.metadata?.phoneNumberId as string ?? undefined,
        customer: {
          number: params.to,
        },
        assistantId: params.agentId ?? this.defaultAssistantId,
        assistantOverrides,
        maxDurationSeconds: params.maxDuration ?? 120,
      };

      // Metadata passed via metadata / analysis context
      body.metadata = {
        ...(params.metadata ?? {}),
        tenantId: params.tenantId,
        leadId: params.leadId,
        agentId: params.agentId,
        callType: params.callType,
      };

      // Webhook for async events
      if (this.config.webhookUrl) {
        body.serverUrl = this.config.webhookUrl;
        body.serverMessages = [
          'conversation-update',
          'end-of-call-report',
          'status-update',
        ];
      }

      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/call`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );

      const callId = (data.id as string) ?? (data.callId as string);
      if (!callId) {
        throw new Error('Vapi did not return a call ID');
      }

      return {
        callId,
        status: mapVapiStatus((data.status as string) ?? 'queued'),
        provider: this.name,
        message: 'Call initiated successfully',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // -----------------------------------------------------------------------
  // getCallStatus
  // -----------------------------------------------------------------------

  async getCallStatus(callId: string): Promise<AICallStatusResponse> {
    const data = await apiRequest<Record<string, unknown>>(
      `${this.baseUrl}/call/${encodeURIComponent(callId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      },
    );

    const endedReason = (data.endedReason as string) ?? '';

    return {
      callId: (data.id as string) ?? callId,
      status: mapVapiStatus((data.status as string) ?? ''),
      durationSeconds: (data.durationSeconds as number) ?? (data.duration_seconds as number) ?? undefined,
      recordingUrl: (data.recordingUrl as string) ?? (data.recording_url as string) ?? null,
      transcript: (data.transcript as string) ?? null,
      sentiment: this.extractSentiment(data),
      outcome: this.parseOutcome(endedReason, data),
      error: (data.errorMessage as string) ?? (data.endedReason as string) ?? null,
      metadata: (data.metadata as Record<string, unknown>) ?? undefined,
    };
  }

  // -----------------------------------------------------------------------
  // getRecording
  // -----------------------------------------------------------------------

  async getRecording(callId: string): Promise<string | null> {
    const data = await apiRequest<Record<string, unknown>>(
      `${this.baseUrl}/call/${encodeURIComponent(callId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      },
    );
    return (data.recordingUrl as string) ?? (data.recording_url as string) ?? null;
  }

  // -----------------------------------------------------------------------
  // getTranscript
  // -----------------------------------------------------------------------

  async getTranscript(callId: string): Promise<string | null> {
    try {
      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/call/${encodeURIComponent(callId)}/transcript`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        },
      );
      return (data.transcript as string) ?? null;
    } catch {
      // Fallback: transcript on the call detail endpoint
      const status = await this.getCallStatus(callId);
      return status.transcript ?? null;
    }
  }

  // -----------------------------------------------------------------------
  // endCall
  // -----------------------------------------------------------------------

  async endCall(callId: string): Promise<AICallResult> {
    const data = await apiRequest<Record<string, unknown>>(
      `${this.baseUrl}/call/${encodeURIComponent(callId)}/end`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({}),
      },
    );

    return {
      callId: (data.id as string) ?? callId,
      status: AICallStatus.Cancelled,
      provider: this.name,
      message: 'Call ended successfully',
    };
  }

  // -----------------------------------------------------------------------
  // validateConfig
  // -----------------------------------------------------------------------

  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    try {
      // Vapi has an assistant list endpoint we can use to validate the key
      const data = await apiRequest<Record<string, unknown>[]>(
        `${this.baseUrl}/assistant`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        },
        0,
      );
      return { valid: Array.isArray(data) };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  // -----------------------------------------------------------------------
  // handleWebhook — convenience method for parsing Vapi webhook payloads
  // -----------------------------------------------------------------------

  handleWebhook(payload: VapiWebhookPayload): {
    callId: string;
    status: AICallStatus;
    outcome?: CallOutcome | null;
    transcript?: string | null;
    recordingUrl?: string | null;
    duration?: number;
    messageType?: string;
  } {
    const msg = payload.message;
    const callId = msg?.call_id ?? payload.call_id ?? '';
    const status = mapVapiStatus(msg?.status ?? payload.status ?? '');

    return {
      callId,
      status,
      transcript: msg?.transcript ?? null,
      recordingUrl: msg?.recording_url ?? null,
      duration: msg?.duration_seconds,
      messageType: msg?.type,
      outcome: this.parseOutcome(msg?.ended_reason ?? '', msg ?? {}),
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private extractSentiment(data: Record<string, unknown>): string | null {
    if (data.sentiment) return data.sentiment as string;
    if (data.analysis) {
      const analysis = data.analysis as Record<string, unknown>;
      if (analysis.sentiment) return analysis.sentiment as string;
      if (analysis.summary) return analysis.summary as string;
    }
    return null;
  }

  private parseOutcome(
    endedReason: string,
    data: Record<string, unknown>,
  ): CallOutcome | null {
    const reason = endedReason?.toLowerCase() ?? '';
    const outcomeRaw = (data.outcome as string) ?? '';

    if (outcomeRaw === 'interested') return 'interested';
    if (outcomeRaw === 'not_interested') return 'not_interested';
    if (outcomeRaw === 'callback') return 'callback';
    if (outcomeRaw === 'site_visit') return 'site_visit';
    if (outcomeRaw === 'wrong_number') return 'wrong_number';

    if (reason === 'no-answer' || reason === 'no_answer' || reason === 'customer-busy') return 'no_answer';
    if (reason === 'customer-busy') return 'no_answer';

    return null;
  }
}
