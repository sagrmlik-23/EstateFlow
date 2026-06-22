// ============================================================================
// EstateFlow CRM — Retell AI Voice Provider
// Phase 3 — AI Voice Agent (AGENT-3-1-PROVIDER-ADAPTER)
// ============================================================================

import type {
  AIVoiceProvider,
  AICallParams,
  AICallResult,
  AICallStatusResponse,
  ProviderConfig,
  RetellAIWebhookPayload,
  CallOutcome,
} from '@/types/ai';
import { AICallStatus, AIProviderName } from '@/types/ai';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RETELL_AI_BASE_URL = 'https://api.retellai.com/v2';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Retell AI uses an LLM-based voice agent with dynamic agent IDs.
// The agent must be pre-configured in the Retell AI dashboard.
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
          `Retell AI API error (${response.status}): ${errorBody || response.statusText}`,
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

function mapRetellStatus(retellStatus: string): AICallStatus {
  const statusMap: Record<string, AICallStatus> = {
    queued: AICallStatus.Queued,
    ringing: AICallStatus.Ringing,
    in_progress: AICallStatus.InProgress,
    in_progresss: AICallStatus.InProgress, // handle typo
    completed: AICallStatus.Completed,
    failed: AICallStatus.Failed,
    no_answer: AICallStatus.NoAnswer,
    busy: AICallStatus.Busy,
    cancelled: AICallStatus.Cancelled,
    error: AICallStatus.Failed,
  };
  return statusMap[retellStatus?.toLowerCase()] ?? AICallStatus.Failed;
}

// ---------------------------------------------------------------------------
// RetellAIProvider
// ---------------------------------------------------------------------------

export class RetellAIProvider implements AIVoiceProvider {
  public readonly name: AIProviderName = 'retell_ai';
  private readonly config: ProviderConfig;
  private readonly baseUrl: string;
  /** Retell AI requires a pre-configured agent ID for the call */
  private readonly defaultAgentId?: string;

  constructor(config: ProviderConfig, defaultAgentId?: string) {
    if (!config.apiKey) {
      throw new Error('Retell AI provider requires an apiKey');
    }
    this.config = config;
    this.baseUrl = config.baseUrl ?? RETELL_AI_BASE_URL;
    this.defaultAgentId = defaultAgentId;
  }

  // -----------------------------------------------------------------------
  // makeCall
  // -----------------------------------------------------------------------

  async makeCall(params: AICallParams): Promise<AICallResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const body: Record<string, unknown> = {
        from_number: params.metadata?.callerId as string ?? '+18888888888',
        to_number: params.to,
        agent_id: params.agentId ?? this.defaultAgentId,
        // Retell uses the prompt/LLM config from the agent dashboard,
        // but we can pass dynamic overrides here
        prompt: params.script,
      };

      if (params.language) {
        body.language = params.language;
      }

      if (params.voice) {
        body.voice_id = params.voice;
      }

      if (params.maxDuration) {
        body.max_call_duration_ms = params.maxDuration * 1000;
      }

      // Metadata stored as custom data
      body.metadata = {
        ...(params.metadata ?? {}),
        tenantId: params.tenantId,
        leadId: params.leadId,
        agentId: params.agentId,
        callType: params.callType,
      };

      if (this.config.webhookUrl) {
        body.webhook_url = this.config.webhookUrl;
      }

      const data = await apiRequest<Record<string, unknown>>(
        `${this.baseUrl}/create_phone_call`,
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

      const callId = (data.call_id as string) ?? (data.id as string);
      if (!callId) {
        throw new Error('Retell AI did not return a call ID');
      }

      return {
        callId,
        status: mapRetellStatus((data.call_status as string) ?? 'queued'),
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
      `${this.baseUrl}/get_call/${encodeURIComponent(callId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      },
    );

    return {
      callId: (data.call_id as string) ?? callId,
      status: mapRetellStatus((data.call_status as string) ?? ''),
      durationSeconds: data.duration_ms
        ? Math.round((data.duration_ms as number) / 1000)
        : undefined,
      recordingUrl: (data.recording_url as string) ?? null,
      transcript: (data.transcript as string) ?? null,
      sentiment: this.extractSentiment(data),
      outcome: this.parseOutcome(data),
      error: (data.error_message as string) ?? null,
      metadata: (data.metadata as Record<string, unknown>) ?? undefined,
    };
  }

  // -----------------------------------------------------------------------
  // getRecording
  // -----------------------------------------------------------------------

  async getRecording(callId: string): Promise<string | null> {
    const data = await apiRequest<Record<string, unknown>>(
      `${this.baseUrl}/get_call/${encodeURIComponent(callId)}`,
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
        `${this.baseUrl}/get_call/${encodeURIComponent(callId)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        },
      );
      return (data.transcript as string) ?? null;
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // endCall
  // -----------------------------------------------------------------------

  async endCall(callId: string): Promise<AICallResult> {
    const data = await apiRequest<Record<string, unknown>>(
      `${this.baseUrl}/end_call/${encodeURIComponent(callId)}`,
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
      // Retell AI doesn't have a simple auth-ping endpoint;
      // try listing agents instead
      const data = await apiRequest<Record<string, unknown>[]>(
        `${this.baseUrl}/list_agents`,
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
  // handleWebhook — convenience method for parsing Retell AI webhooks
  // -----------------------------------------------------------------------

  handleWebhook(payload: RetellAIWebhookPayload): {
    callId: string;
    status: AICallStatus;
    outcome?: CallOutcome | null;
    transcript?: string | null;
    recordingUrl?: string | null;
    duration?: number;
    event: string;
  } {
    return {
      callId: payload.call_id,
      status: mapRetellStatus(payload.call_status),
      transcript: payload.transcript ?? null,
      recordingUrl: payload.recording_url ?? null,
      duration: payload.duration_ms ? Math.round(payload.duration_ms / 1000) : undefined,
      event: payload.event,
      outcome: null, // Retell webhook doesn't include outcome directly
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private extractSentiment(data: Record<string, unknown>): string | null {
    // Retell AI may pass sentiment as part of custom analysis
    if (data.sentiment) return data.sentiment as string;
    if (data.call_analysis) {
      const analysis = data.call_analysis as Record<string, unknown>;
      if (analysis.sentiment) return analysis.sentiment as string;
    }
    return null;
  }

  private parseOutcome(
    data: Record<string, unknown>,
  ): CallOutcome | null {
    const disconnectionReason = (data.disconnection_reason as string) ?? '';
    const outcomeRaw = (data.outcome as string) ?? '';

    if (outcomeRaw === 'interested') return 'interested';
    if (outcomeRaw === 'not_interested') return 'not_interested';
    if (outcomeRaw === 'callback' || outcomeRaw === 'call_back') return 'callback';
    if (outcomeRaw === 'site_visit') return 'site_visit';
    if (outcomeRaw === 'wrong_number') return 'wrong_number';
    if (disconnectionReason === 'no_answer') return 'no_answer';

    return null;
  }
}
