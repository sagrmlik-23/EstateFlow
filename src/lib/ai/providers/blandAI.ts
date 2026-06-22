// ============================================================================
// EstateFlow CRM — Bland AI Voice Provider
// Phase 3 — AI Voice Agent (AGENT-3-1-PROVIDER-ADAPTER)
// ============================================================================

import type {
  AIVoiceProvider,
  AICallParams,
  AICallResult,
  AICallStatusResponse,
  ProviderConfig,
  BlandAIWebhookPayload,
  CallOutcome,
} from '@/types/ai';
import { AICallStatus, AIProviderName } from '@/types/ai';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLAND_AI_BASE_URL = 'https://api.bland.ai/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Helpers
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
          `Bland AI API error (${response.status}): ${errorBody || response.statusText}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      // Exponential backoff: 500ms, 1000ms
      await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
    }
  }
  throw new Error('Unreachable — all retries exhausted');
}

function mapBlandStatus(blandStatus: string): AICallStatus {
  const statusMap: Record<string, AICallStatus> = {
    queued: AICallStatus.Queued,
    ringing: AICallStatus.Ringing,
    'in-progress': AICallStatus.InProgress,
    in_progress: AICallStatus.InProgress,
    completed: AICallStatus.Completed,
    failed: AICallStatus.Failed,
    'no-answer': AICallStatus.NoAnswer,
    no_answer: AICallStatus.NoAnswer,
    busy: AICallStatus.Busy,
    cancelled: AICallStatus.Cancelled,
  };
  return statusMap[blandStatus?.toLowerCase()] ?? AICallStatus.Failed;
}

// ---------------------------------------------------------------------------
// BlandAIProvider
// ---------------------------------------------------------------------------

export class BlandAIProvider implements AIVoiceProvider {
  public readonly name: AIProviderName = 'bland_ai';
  private readonly config: ProviderConfig;
  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error('Bland AI provider requires an apiKey');
    }
    this.config = config;
    this.baseUrl = config.baseUrl ?? BLAND_AI_BASE_URL;
  }

  // -----------------------------------------------------------------------
  // makeCall
  // -----------------------------------------------------------------------

  async makeCall(params: AICallParams): Promise<AICallResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const body: Record<string, unknown> = {
        phone_number: params.to,
        voice: params.voice ?? 'jennifer',
        task: params.script,
        language: params.language ?? 'en',
        max_duration: params.maxDuration ?? 120,
        model: 'turbo', // Bland AI's fastest model
        wait_for_greeting: false,
        record: true,
        metadata: {
          ...(params.metadata ?? {}),
          tenantId: params.tenantId,
          leadId: params.leadId,
          agentId: params.agentId,
          callType: params.callType,
        },
      };

      if (this.config.webhookUrl) {
        body.webhook = this.config.webhookUrl;
      }

      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/calls`,
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

      const callId = (data.call_id ?? data.id) as string | undefined;
      if (!callId) {
        throw new Error('Bland AI did not return a call ID');
      }

      return {
        callId,
        status: mapBlandStatus((data.status as string) ?? 'queued'),
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
      `${this.baseUrl}/calls/${encodeURIComponent(callId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      },
    );

    return {
      callId: (data.call_id as string) ?? callId,
      status: mapBlandStatus((data.status as string) ?? ''),
      durationSeconds: (data.duration as number) ?? undefined,
      recordingUrl: (data.recording_url as string) ?? null,
      transcript: (data.transcript as string) ?? null,
      sentiment: (data.sentiment as string) ?? null,
      outcome: this.parseOutcome(data),
      error: (data.error as string) ?? null,
      metadata: (data.metadata as Record<string, unknown>) ?? undefined,
    };
  }

  // -----------------------------------------------------------------------
  // getRecording
  // -----------------------------------------------------------------------

  async getRecording(callId: string): Promise<string | null> {
    const data = await apiRequest<Record<string, unknown>>(
      `${this.baseUrl}/calls/${encodeURIComponent(callId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      },
    );
    return (data.recording_url as string) ?? null;
  }

  // -----------------------------------------------------------------------
  // getTranscript
  // -----------------------------------------------------------------------

  async getTranscript(callId: string): Promise<string | null> {
    try {
      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/calls/${encodeURIComponent(callId)}/transcript`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        },
      );
      return (data.transcript as string) ?? null;
    } catch {
      // Fallback: transcript sometimes comes on the call detail endpoint
      const status = await this.getCallStatus(callId);
      return status.transcript ?? null;
    }
  }

  // -----------------------------------------------------------------------
  // endCall
  // -----------------------------------------------------------------------

  async endCall(callId: string): Promise<AICallResult> {
    const data = await apiRequest<Record<string, unknown>>(
      `${this.baseUrl}/calls/${encodeURIComponent(callId)}/end`,
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
      callId: (data.call_id as string) ?? callId,
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
      // Ping the accounts endpoint to verify the API key
      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/accounts`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        },
        0, // no retries for validation
      );
      return { valid: data != null };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  // -----------------------------------------------------------------------
  // handleWebhook — convenience method for parsing webhook payloads
  // -----------------------------------------------------------------------

  handleWebhook(payload: BlandAIWebhookPayload): {
    callId: string;
    status: AICallStatus;
    outcome?: CallOutcome | null;
    transcript?: string | null;
    recordingUrl?: string | null;
    duration?: number;
    sentiment?: string;
  } {
    return {
      callId: payload.call_id,
      status: mapBlandStatus(payload.status),
      transcript: payload.transcript ?? null,
      recordingUrl: payload.recording_url ?? null,
      duration: payload.duration,
      sentiment: payload.sentiment,
      outcome: this.parseOutcome(payload as unknown as Record<string, unknown>),
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private parseOutcome(
    data: Record<string, unknown>,
  ): CallOutcome | null {
    const outcomeRaw = (data.outcome as string) ?? (data.disposition as string) ?? '';
    const status = (data.status as string) ?? '';

    if (outcomeRaw === 'interested' || outcomeRaw === 'converted') return 'interested';
    if (outcomeRaw === 'not_interested') return 'not_interested';
    if (outcomeRaw === 'callback') return 'callback';
    if (outcomeRaw === 'site_visit') return 'site_visit';
    if (outcomeRaw === 'wrong_number') return 'wrong_number';
    if (status === 'no-answer' || status === 'no_answer') return 'no_answer';
    if (outcomeRaw === 'no_answer') return 'no_answer';

    return null;
  }
}
