// ============================================================================
// EstateFlow CRM — Dry-Run Call Adapter
// Phase 4 — Voice Adapter (AGENT-4-1-VOICE-ADAPTER)
//
// Wraps any CommunicationProvider in dry-run mode:
// - Logs to file instead of making real API calls
// - Simulates call outcomes (random based on config)
// - Never makes real API calls
// - Returns fake callSid with 'dry_run' prefix
// - Enable/disable per tenant via feature flag
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import type {
  CommunicationProvider,
  CallParams,
  CallResult,
  CallStatusResponse,
  WebhookResult,
  DryRunConfig,
} from '@/types/communication';
import type { VoiceProviderName } from '@/types/communication';
import { WATIProvider, type WATIConfig } from './providers/wati';
import { MSG91Provider, type MSG91Config } from './providers/msg91';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LOG_DIR = 'logs/communication';
const DRY_RUN_PREFIX = 'dry_run';

// ---------------------------------------------------------------------------
// Random call outcome simulation
// ---------------------------------------------------------------------------

interface SimulationWeights {
  completed: number;
  failed: number;
  no_answer: number;
  busy: number;
}

const DEFAULT_WEIGHTS: SimulationWeights = {
  completed: 0.65,
  failed: 0.10,
  no_answer: 0.15,
  busy: 0.10,
};

function simulateCallOutcome(simulateResponse?: string): {
  status: string;
  duration: number;
  price: number;
} {
  if (simulateResponse) {
    return {
      status: simulateResponse,
      duration: simulateResponse === 'completed' ? Math.floor(Math.random() * 300) + 10 : 0,
      price: simulateResponse === 'completed' ? parseFloat((Math.random() * 2).toFixed(4)) : 0,
    };
  }

  const rand = Math.random();
  let cumulative = 0;
  let selectedStatus = 'completed';

  for (const [status, weight] of Object.entries(DEFAULT_WEIGHTS)) {
    cumulative += weight;
    if (rand < cumulative) {
      selectedStatus = status;
      break;
    }
  }

  const duration = selectedStatus === 'completed'
    ? Math.floor(Math.random() * 300) + 10
    : Math.floor(Math.random() * 30);

  const price = selectedStatus === 'completed'
    ? parseFloat((Math.random() * 2).toFixed(4))
    : 0;

  return { status: selectedStatus, duration, price };
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

function getLogPath(logDir: string): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(logDir, `dry-run-${date}.jsonl`);
}

async function logDryRunCall(
  logDir: string,
  entry: Record<string, unknown>,
): Promise<void> {
  try {
    const logPath = getLogPath(logDir);
    const dir = path.dirname(logPath);
    await fs.promises.mkdir(dir, { recursive: true });
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n';
    await fs.promises.appendFile(logPath, line, 'utf-8');
  } catch (error) {
    console.error('[DryRun] Failed to write log:', error);
  }
}

// ---------------------------------------------------------------------------
// DryRunCallAdapter
// ---------------------------------------------------------------------------

export class DryRunCallAdapter implements CommunicationProvider {
  public readonly name: VoiceProviderName;
  private readonly inner: CommunicationProvider;
  private readonly config: DryRunConfig;
  private readonly logDir: string;

  constructor(inner: CommunicationProvider, config: DryRunConfig) {
    this.inner = inner;
    this.name = inner.name;
    this.config = config;
    this.logDir = config.logPath ?? DEFAULT_LOG_DIR;
  }

  // -----------------------------------------------------------------------
  // makeCall — NEVER makes a real API call
  // -----------------------------------------------------------------------

  async makeCall(params: CallParams): Promise<CallResult> {
    const simulated = simulateCallOutcome(this.config.simulateResponse);
    const fakeCallSid = `${DRY_RUN_PREFIX}_${crypto.randomUUID()}`;

    await logDryRunCall(this.logDir, {
      type: 'makeCall',
      provider: this.inner.name,
      fakeCallSid,
      params: {
        to: params.to,
        from: params.from,
        tenantId: params.tenantId,
        leadId: params.leadId,
        agentId: params.agentId,
        callType: params.callType,
      },
      simulated,
    });

    return {
      callSid: fakeCallSid,
      status: simulated.status,
      duration: simulated.duration,
      price: simulated.price,
      provider: this.name,
      message: `[DRY RUN] Call simulated as ${simulated.status}`,
    };
  }

  // -----------------------------------------------------------------------
  // getCallStatus — returns simulated status
  // -----------------------------------------------------------------------

  async getCallStatus(callSid: string): Promise<CallStatusResponse> {
    const simulated = simulateCallOutcome(this.config.simulateResponse);

    await logDryRunCall(this.logDir, {
      type: 'getCallStatus',
      provider: this.inner.name,
      callSid,
      simulated,
    });

    return {
      callSid,
      status: simulated.status,
      durationSeconds: simulated.duration,
      recordingUrl: null,
      price: simulated.price,
      direction: 'outbound',
      error: null,
    };
  }

  // -----------------------------------------------------------------------
  // getRecording — returns null in dry-run
  // -----------------------------------------------------------------------

  async getRecording(callSid: string): Promise<string | null> {
    await logDryRunCall(this.logDir, {
      type: 'getRecording',
      provider: this.inner.name,
      callSid,
    });

    return null;
  }

  // -----------------------------------------------------------------------
  // transcribe — returns null in dry-run
  // -----------------------------------------------------------------------

  async transcribe(callSid: string): Promise<string | null> {
    await logDryRunCall(this.logDir, {
      type: 'transcribe',
      provider: this.inner.name,
      callSid,
    });

    return null;
  }

  // -----------------------------------------------------------------------
  // validateConfig — delegates to inner provider
  // -----------------------------------------------------------------------

  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    await logDryRunCall(this.logDir, {
      type: 'validateConfig',
      provider: this.inner.name,
    });

    // In dry-run, always report valid config
    return { valid: true };
  }

  // -----------------------------------------------------------------------
  // handleCallback — delegates to inner provider
  // -----------------------------------------------------------------------

  handleCallback(payload: Record<string, unknown>): WebhookResult {
    const result = this.inner.handleCallback(payload);

    // Log it asynchronously (fire-and-forget)
    logDryRunCall(this.logDir, {
      type: 'handleCallback',
      provider: this.inner.name,
      payload,
      result,
    });

    return result;
  }
}

// ---------------------------------------------------------------------------
// Helper: Check if dry-run is enabled for a tenant
// ---------------------------------------------------------------------------

export function isDryRunEnabled(featureFlags: Record<string, unknown>): boolean {
  return featureFlags?.dryRunEnabled === true || featureFlags?.dry_run_enabled === true;
}

/**
 * Create a dry-run enabled provider (if dry-run is on) or return the raw provider.
 */
export function maybeWrapDryRun(
  provider: CommunicationProvider,
  featureFlags: Record<string, unknown>,
  config?: Partial<DryRunConfig>,
): CommunicationProvider {
  if (isDryRunEnabled(featureFlags)) {
    return new DryRunCallAdapter(provider, {
      mode: true,
      logPath: config?.logPath,
      simulateResponse: config?.simulateResponse,
    });
  }
  return provider;
}

// ===========================================================================
// DryRunMessageAdapter — WhatsApp / SMS dry-run wrapper
// Phase 4 — Communication (AGENT-4-2-WHATSAPP-SMS)
// ===========================================================================
//
// Wraps WhatsApp (WATI) and SMS (MSG91) so all messages are logged
// to file instead of being sent. Active when DRY_RUN=true or when
// no config is provided.
// ===========================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DryRunMessageLogEntry {
  timestamp: string;
  provider: 'wati' | 'msg91';
  method: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  error?: string;
}

export interface DryRunMessageAdapterOptions {
  /** Directory to write dry-run log files (default: logs/dry-run) */
  logDir?: string;
  /** If true, still attempt real calls (for parallel testing) */
  passthrough?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MESSAGE_DRY_RUN_PREFIX = 'dry-run-msg';

// ---------------------------------------------------------------------------
// DryRunMessageAdapter
// ---------------------------------------------------------------------------

export class DryRunMessageAdapter {
  public readonly whatsapp: WATIProvider;
  public readonly sms: MSG91Provider;
  private readonly logDir: string;
  private readonly passthrough: boolean;
  private readonly isDryRun: boolean;

  constructor(
    watiConfig?: WATIConfig,
    msg91Config?: MSG91Config,
    options: DryRunMessageAdapterOptions = {},
  ) {
    this.isDryRun = process.env.DRY_RUN === 'true' || !watiConfig || !msg91Config;
    this.logDir = options.logDir ?? path.join(process.cwd(), 'logs', 'dry-run');
    this.passthrough = options.passthrough ?? false;

    // Create real providers with whatever config is available (even empty)
    this.whatsapp = new WATIProvider(
      watiConfig ?? { apiKey: '__dry_run__', whatsappNumber: '__dry_run__' },
    );
    this.sms = new MSG91Provider(
      msg91Config ?? { authKey: '__dry_run__', senderId: 'DRYRUN' },
    );

    if (this.isDryRun) {
      console.log('[DryRun] Message adapter initialized in DRY-RUN mode');
    }
  }

  // -----------------------------------------------------------------------
  // active
  // -----------------------------------------------------------------------

  get active(): boolean {
    return this.isDryRun;
  }

  // -----------------------------------------------------------------------
  // sendMessage — WhatsApp template message
  // -----------------------------------------------------------------------

  async sendMessage(
    to: string,
    templateName: string,
    params?: Record<string, string>,
  ): Promise<{ success: boolean; messageId?: string; error?: string; dryRun: boolean }> {
    if (!this.isDryRun || this.passthrough) {
      const result = await this.whatsapp.sendMessage(to, templateName, params);
      await this.logEntry('wati', 'sendMessage', { to, templateName, params }, result);
      return { ...result, dryRun: false };
    }

    const result = { success: true, messageId: `${MESSAGE_DRY_RUN_PREFIX}-${Date.now()}` };
    await this.logEntry('wati', 'sendMessage', { to, templateName, params }, result);
    return { ...result, dryRun: true };
  }

  // -----------------------------------------------------------------------
  // sendImage — WhatsApp image
  // -----------------------------------------------------------------------

  async sendImage(
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string; dryRun: boolean }> {
    if (!this.isDryRun || this.passthrough) {
      const result = await this.whatsapp.sendImage(to, imageUrl, caption);
      await this.logEntry('wati', 'sendImage', { to, imageUrl, caption }, result);
      return { ...result, dryRun: false };
    }

    const result = { success: true, messageId: `${MESSAGE_DRY_RUN_PREFIX}-${Date.now()}` };
    await this.logEntry('wati', 'sendImage', { to, imageUrl, caption }, result);
    return { ...result, dryRun: true };
  }

  // -----------------------------------------------------------------------
  // sendDocument — WhatsApp document
  // -----------------------------------------------------------------------

  async sendDocument(
    to: string,
    documentUrl: string,
    filename?: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string; dryRun: boolean }> {
    if (!this.isDryRun || this.passthrough) {
      const result = await this.whatsapp.sendDocument(to, documentUrl, filename);
      await this.logEntry('wati', 'sendDocument', { to, documentUrl, filename }, result);
      return { ...result, dryRun: false };
    }

    const result = { success: true, messageId: `${MESSAGE_DRY_RUN_PREFIX}-${Date.now()}` };
    await this.logEntry('wati', 'sendDocument', { to, documentUrl, filename }, result);
    return { ...result, dryRun: true };
  }

  // -----------------------------------------------------------------------
  // sendLocation — WhatsApp location
  // -----------------------------------------------------------------------

  async sendLocation(
    to: string,
    lat: number,
    lng: number,
    label?: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string; dryRun: boolean }> {
    if (!this.isDryRun || this.passthrough) {
      const result = await this.whatsapp.sendLocation(to, lat, lng, label);
      await this.logEntry('wati', 'sendLocation', { to, lat, lng, label }, result);
      return { ...result, dryRun: false };
    }

    const result = { success: true, messageId: `${MESSAGE_DRY_RUN_PREFIX}-${Date.now()}` };
    await this.logEntry('wati', 'sendLocation', { to, lat, lng, label }, result);
    return { ...result, dryRun: true };
  }

  // -----------------------------------------------------------------------
  // sendSMS — SMS via MSG91
  // -----------------------------------------------------------------------

  async sendSMS(
    to: string,
    message: string,
    options?: { unicode?: boolean; dltTemplateId?: string },
  ): Promise<{ success: boolean; messageId?: string; error?: string; dryRun: boolean }> {
    if (!this.isDryRun || this.passthrough) {
      const result = await this.sms.sendSMS(to, message, options);
      await this.logEntry('msg91', 'sendSMS', { to, message, ...options }, result);
      return { ...result, dryRun: false };
    }

    const result = { success: true, messageId: `${MESSAGE_DRY_RUN_PREFIX}-${Date.now()}` };
    await this.logEntry('msg91', 'sendSMS', { to, message, ...options }, result);
    return { ...result, dryRun: true };
  }

  // -----------------------------------------------------------------------
  // sendOTP — SMS OTP
  // -----------------------------------------------------------------------

  async sendOTP(
    to: string,
    otp: string,
    options?: { unicode?: boolean; expiryMinutes?: number },
  ): Promise<{ success: boolean; sessionId?: string; error?: string; dryRun: boolean }> {
    if (!this.isDryRun || this.passthrough) {
      const result = await this.sms.sendOTP(to, otp, options);
      await this.logEntry('msg91', 'sendOTP', { to, otp: '****', ...options }, result);
      return { ...result, dryRun: false };
    }

    const result = { success: true, sessionId: `${MESSAGE_DRY_RUN_PREFIX}-${Date.now()}` };
    await this.logEntry('msg91', 'sendOTP', { to, otp: '****', ...options }, result);
    return { ...result, dryRun: true };
  }

  // -----------------------------------------------------------------------
  // verifyOTP — SMS OTP verification
  // -----------------------------------------------------------------------

  async verifyOTP(
    sessionId: string,
    otp: string,
  ): Promise<{ success: boolean; error?: string; dryRun: boolean }> {
    if (!this.isDryRun || this.passthrough) {
      const result = await this.sms.verifyOTP(sessionId, otp);
      await this.logEntry('msg91', 'verifyOTP', { sessionId }, result);
      return { ...result, dryRun: false };
    }

    const result = { success: true };
    await this.logEntry('msg91', 'verifyOTP', { sessionId }, result);
    return { ...result, dryRun: true };
  }

  // -----------------------------------------------------------------------
  // getWhatsAppMessageStatus
  // -----------------------------------------------------------------------

  async getWhatsAppMessageStatus(
    messageId: string,
  ): Promise<{ messageId: string; status: string; error?: string }> {
    if (!this.isDryRun || this.passthrough) {
      return await this.whatsapp.getMessageStatus(messageId);
    }
    return { messageId, status: 'delivered' };
  }

  // -----------------------------------------------------------------------
  // getSMSStatus
  // -----------------------------------------------------------------------

  async getSMSStatus(
    messageId: string,
  ): Promise<{ messageId: string; status: string; deliveredAt?: string; error?: string }> {
    if (!this.isDryRun || this.passthrough) {
      return await this.sms.getSMSStatus(messageId);
    }
    return { messageId, status: 'delivered' };
  }

  // -----------------------------------------------------------------------
  // Private: log entry to file
  // -----------------------------------------------------------------------

  private async logEntry(
    provider: 'wati' | 'msg91',
    method: string,
    args: Record<string, unknown>,
    result: Record<string, unknown>,
  ): Promise<void> {
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logDir, `messages-${dateStr}.jsonl`);

      await fs.promises.mkdir(this.logDir, { recursive: true });

      const entry: DryRunMessageLogEntry = {
        timestamp: new Date().toISOString(),
        provider,
        method,
        args,
        result,
      };

      await fs.promises.appendFile(logFile, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (err) {
      console.warn('[DryRunMessageAdapter] Failed to log entry:', err);
    }
  }

  // -----------------------------------------------------------------------
  // Static: read log entries for a given date
  // -----------------------------------------------------------------------

  static readLogs(date?: string): DryRunMessageLogEntry[] {
    const dateStr = date ?? new Date().toISOString().split('T')[0];
    const logFile = path.join(process.cwd(), 'logs', 'dry-run', `messages-${dateStr}.jsonl`);

    if (!fs.existsSync(logFile)) {
      return [];
    }

    const content = fs.readFileSync(logFile, 'utf-8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as DryRunMessageLogEntry);
  }

  // -----------------------------------------------------------------------
  // Factory: create adapter with env-based config
  // -----------------------------------------------------------------------

  static fromEnv(
    options?: DryRunMessageAdapterOptions,
  ): DryRunMessageAdapter {
    const watiConfig: WATIConfig | undefined = process.env.WATI_API_KEY
      ? {
          apiKey: process.env.WATI_API_KEY!,
          whatsappNumber: process.env.WATI_WHATSAPP_NUMBER ?? '',
          baseUrl: process.env.WATI_BASE_URL,
          webhookVerifyToken: process.env.WATI_WEBHOOK_VERIFY_TOKEN,
        }
      : undefined;

    const msg91Config: MSG91Config | undefined = process.env.MSG91_AUTH_KEY
      ? {
          authKey: process.env.MSG91_AUTH_KEY!,
          senderId: process.env.MSG91_SENDER_ID ?? 'EFLOW',
          dltTemplateId: process.env.MSG91_DLT_TEMPLATE_ID,
          route: (process.env.MSG91_ROUTE as 'transactional' | 'promotional') ?? 'transactional',
        }
      : undefined;

    return new DryRunMessageAdapter(watiConfig, msg91Config, options);
  }
}
