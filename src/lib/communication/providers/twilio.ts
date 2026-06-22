// ============================================================================
// EstateFlow CRM — Twilio Voice Provider (fallback for non-India regions)
// Phase 4 — Voice Adapter (AGENT-4-1-VOICE-ADAPTER)
//
// Twilio is used as the global fallback when the tenant is not India-based.
// Supports international numbers, TwiML apps, call recording, transcription.
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

const TWILIO_BASE_URL = 'https://api.twilio.com/2010-04-01/Accounts';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAuthHeader(apiKey: string, apiSecret: string): string {
  const encoded = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  return `Basic ${encoded}`;
}

function buildTwilioUrl(baseUrl: string, accountSid: string, path: string): string {
  const base = baseUrl || TWILIO_BASE_URL;
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
          `Twilio API error (${response.status}): ${errorBody || response.statusText}`,
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

function mapTwilioStatus(twilioStatus: string): string {
  const statusMap: Record<string, string> = {
    queued: 'queued',
    ringing: 'ringing',
    'in-progress': 'in_progress',
    in_progress: 'in_progress',
    completed: 'completed',
    failed: 'failed',
    busy: 'busy',
    'no-answer': 'no_answer',
    no_answer: 'no_answer',
    cancelled: 'cancelled',
  };
  return statusMap[twilioStatus?.toLowerCase()] ?? twilioStatus ?? 'unknown';
}

// ---------------------------------------------------------------------------
// TwilioProvider
// ---------------------------------------------------------------------------

export class TwilioProvider implements CommunicationProvider {
  public readonly name: VoiceProviderName = 'twilio';
  private readonly config: ProviderConfig;
  private readonly baseUrl: string;
  private readonly accountSid: string;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) throw new Error('Twilio provider requires an apiKey');
    if (!config.apiSecret) throw new Error('Twilio provider requires an apiSecret');
    if (!config.accountSid) throw new Error('Twilio provider requires an accountSid');

    this.config = config;
    this.baseUrl = config.baseUrl ?? TWILIO_BASE_URL;
    this.accountSid = config.accountSid;
  }

  // -----------------------------------------------------------------------
  // makeCall
  // -----------------------------------------------------------------------

  async makeCall(params: CallParams): Promise<CallResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      // Twilio Calls API — form-encoded POST
      // https://www.twilio.com/docs/voice/api/call-resource
      const formBody = new URLSearchParams();
      formBody.append('To', params.to);
      formBody.append('From', params.from || this.config.fromNumber || '');
      formBody.append('StatusCallback', this.config.webhookUrl || '');
      formBody.append('StatusCallbackEvent', 'initiated,ringing,answered,completed');
      formBody.append('StatusCallbackMethod', 'POST');

      if (params.record !== false) {
        formBody.append('Record', 'true');
        formBody.append('RecordingStatusCallback', this.config.webhookUrl || '');
      }

      if (params.twiml) {
        formBody.append('Twiml', params.twiml);
      } else if (params.url) {
        formBody.append('Url', params.url);
      } else {
        // Default TwiML: say a greeting
        formBody.append('Twiml', '<Response><Say>Hello, this is EstateFlow calling.</Say></Response>');
      }

      if (params.metadata) {
        formBody.append('MachineDetection', 'Enable'); // Detect answering machines
      }

      const url = buildTwilioUrl(this.baseUrl, this.accountSid, '/Calls.json');
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

      const callSid = (data.sid as string) ?? null;
      if (!callSid) {
        throw new Error('Twilio did not return a call SID');
      }

      return {
        callSid,
        status: mapTwilioStatus((data.status as string) ?? 'queued'),
        provider: this.name,
        message: 'Call initiated successfully via Twilio',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // -----------------------------------------------------------------------
  // getCallStatus
  // -----------------------------------------------------------------------

  async getCallStatus(callSid: string): Promise<CallStatusResponse> {
    const url = buildTwilioUrl(this.baseUrl, this.accountSid, `/Calls/${encodeURIComponent(callSid)}.json`);
    const data = await apiRequest<Record<string, unknown>>(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: buildAuthHeader(this.config.apiKey, this.config.apiSecret),
        },
      },
    );

    return {
      callSid: (data.sid as string) ?? callSid,
      status: mapTwilioStatus((data.status as string) ?? ''),
      durationSeconds: parseInt((data.duration as string) || '0', 10) || undefined,
      recordingUrl: null, // Twilio recordings are on a separate API
      price: parseFloat((data.price as string) || '0') || undefined,
      direction: (data.direction as 'inbound' | 'outbound') ?? undefined,
      from: (data.from as string) ?? undefined,
      to: (data.to as string) ?? undefined,
      error: (data.error_message as string) ?? null,
    };
  }

  // -----------------------------------------------------------------------
  // getRecording
  // -----------------------------------------------------------------------

  async getRecording(callSid: string): Promise<string | null> {
    try {
      // Twilio stores recordings under /Recordings — query by call SID
      const url = buildTwilioUrl(this.baseUrl, this.accountSid, `/Recordings.json?CallSid=${encodeURIComponent(callSid)}`);
      const data = await apiRequest<Record<string, unknown>>(
        url,
        {
          method: 'GET',
          headers: {
            Authorization: buildAuthHeader(this.config.apiKey, this.config.apiSecret),
          },
        },
      );

      const recordings = (data.recordings ?? data) as unknown as Array<Record<string, unknown>>;
      if (Array.isArray(recordings) && recordings.length > 0) {
        const recording = recordings[0];
        if (recording) {
          // Twilio recording URL pattern
          const recordingSid = recording.sid as string;
          return `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Recordings/${recordingSid}.mp3`;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // transcribe
  // -----------------------------------------------------------------------

  async transcribe(callSid: string): Promise<string | null> {
    try {
      // Query transcriptions by call SID
      const url = buildTwilioUrl(this.baseUrl, this.accountSid, `/Transcriptions.json?CallSid=${encodeURIComponent(callSid)}`);
      const data = await apiRequest<Record<string, unknown>>(
        url,
        {
          method: 'GET',
          headers: {
            Authorization: buildAuthHeader(this.config.apiKey, this.config.apiSecret),
          },
        },
      );

      const transcriptions = (data.transcriptions ?? data) as unknown as Array<Record<string, unknown>>;
      if (Array.isArray(transcriptions) && transcriptions.length > 0) {
        const transcription = transcriptions[0];
        return (transcription?.transcription_text as string) ?? null;
      }
      return null;
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // validateConfig
  // -----------------------------------------------------------------------

  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    try {
      // Ping the account endpoint to verify credentials
      const url = buildTwilioUrl(this.baseUrl, this.accountSid, '.json');
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
    // Twilio status callbacks send form-encoded params
    return {
      callSid: (payload.CallSid || payload.CallSid || '') as string,
      status: mapTwilioStatus((payload.CallStatus || payload.call_status || '') as string),
      recordingUrl: (payload.RecordingUrl || payload.recording_url || null) as string | null,
      duration: parseInt((payload.CallDuration || payload.duration || '0') as string, 10) || undefined,
      price: parseFloat((payload.CallPrice || payload.price || '0') as string) || undefined,
      direction: (payload.Direction || payload.direction || 'outbound') as 'inbound' | 'outbound',
      from: (payload.From || payload.from || '') as string,
      to: (payload.To || payload.to || '') as string,
      transcription: (payload.TranscriptionText || payload.transcription_text || null) as string | null,
      error: (payload.ErrorCode || payload.error_code || null) as string | null,
    };
  }
}
