// ============================================================================
// EstateFlow CRM — AI Voice Provider Barrel Export
// Phase 3 — AI Voice Agent (AGENT-3-1-PROVIDER-ADAPTER)
// ============================================================================

// ─── Providers ──────────────────────────────────────────────────────────────

export { BlandAIProvider } from './providers/blandAI';
export { RetellAIProvider } from './providers/retellAI';
export { VapiProvider } from './providers/vapi';

// ─── Factory ────────────────────────────────────────────────────────────────

export {
  getProvider,
  getDefaultProvider,
  registerProvider,
  listProviders,
  validateProvider,
} from './providerFactory';

// ─── Types (re-exported for convenience) ────────────────────────────────────

export type {
  AIVoiceProvider,
  AICallParams,
  AICallResult,
  AICallStatusResponse,
  ProviderConfig,
  BlandAIWebhookPayload,
  RetellAIWebhookPayload,
  VapiWebhookPayload,
  CallOutcome,
  AIProviderName,
  TranscriptEntry,
} from '@/types/ai';

export { AICallStatus } from '@/types/ai';
