// ============================================================================
// EstateFlow CRM — AI Voice Provider Factory
// Phase 3 — AI Voice Agent (AGENT-3-1-PROVIDER-ADAPTER)
// ============================================================================

import type { AIVoiceProvider, AIProviderName, ProviderConfig } from '@/types/ai';
import { BlandAIProvider } from './providers/blandAI';
import { RetellAIProvider } from './providers/retellAI';
import { VapiProvider } from './providers/vapi';

// ---------------------------------------------------------------------------
// Provider Registry
// ---------------------------------------------------------------------------

interface ProviderRegistration {
  name: AIProviderName;
  factory: (config: ProviderConfig, ...args: unknown[]) => AIVoiceProvider;
  defaultConfig?: ProviderConfig;
}

const providerRegistry: Map<AIProviderName, ProviderRegistration> = new Map();

/**
 * Register a provider in the factory.
 * Can be called at startup to register custom or additional providers.
 */
export function registerProvider(
  name: AIProviderName,
  factory: (config: ProviderConfig, ...args: unknown[]) => AIVoiceProvider,
  defaultConfig?: ProviderConfig,
): void {
  providerRegistry.set(name, { name, factory, defaultConfig });
}

// ---------------------------------------------------------------------------
// Default registration (called at module import time)
// ---------------------------------------------------------------------------

function getApiKey(provider: string): string | undefined {
  const envKey = `${provider.toUpperCase()}_API_KEY`;
  return process.env[envKey] ?? process.env[`NEXT_PUBLIC_${envKey}`];
}

// Register Bland AI
registerProvider(
  'bland_ai',
  (config) => new BlandAIProvider(config),
  {
    apiKey: getApiKey('bland_ai') ?? '',
    baseUrl: 'https://api.bland.ai/v1',
  },
);

// Register Retell AI (requires agent ID from env)
const retellAgentId = process.env.RETELL_AI_AGENT_ID;
registerProvider(
  'retell_ai',
  (config) => new RetellAIProvider(config, retellAgentId),
  {
    apiKey: getApiKey('retell_ai') ?? '',
    baseUrl: 'https://api.retellai.com/v2',
  },
);

// Register Vapi (requires assistant ID from env)
const vapiAssistantId = process.env.VAPI_ASSISTANT_ID;
registerProvider(
  'vapi',
  (config) => new VapiProvider(config, vapiAssistantId),
  {
    apiKey: getApiKey('vapi') ?? '',
    baseUrl: 'https://api.vapi.ai',
  },
);

// ---------------------------------------------------------------------------
// Provider Retrieval
// ---------------------------------------------------------------------------

/**
 * Get an AI voice provider by name with the given configuration.
 * If no config is provided, uses the registered default config.
 *
 * @param providerName - The name of the provider (e.g. 'bland_ai', 'retell_ai', 'vapi')
 * @param config - Optional configuration override
 * @returns An instance implementing AIVoiceProvider
 * @throws Error if the provider is not registered
 */
export function getProvider(
  providerName: AIProviderName,
  config?: ProviderConfig,
): AIVoiceProvider {
  const registration = providerRegistry.get(providerName);
  if (!registration) {
    throw new Error(
      `Unknown AI voice provider: '${providerName}'. ` +
        `Available providers: ${Array.from(providerRegistry.keys()).join(', ')}`,
    );
  }

  const resolvedConfig = config ?? registration.defaultConfig;
  if (!resolvedConfig) {
    throw new Error(
      `No configuration available for provider '${providerName}'. ` +
        `Provide a config or set the ${providerName.toUpperCase()}_API_KEY environment variable.`,
    );
  }

  return registration.factory(resolvedConfig);
}

/**
 * Get the default AI voice provider.
 * Falls back: BLAND_AI → RETELL_AI → VAPI (first with an API key configured).
 *
 * @param config - Optional configuration (applied to whichever provider is selected)
 * @returns An instance implementing AIVoiceProvider
 * @throws Error if no provider has configuration
 */
export function getDefaultProvider(config?: ProviderConfig): AIVoiceProvider {
  const preferredOrder: AIProviderName[] = ['bland_ai', 'retell_ai', 'vapi'];

  for (const name of preferredOrder) {
    const registration = providerRegistry.get(name);
    if (!registration) continue;

    const cfg = config ?? registration.defaultConfig;
    if (cfg?.apiKey) {
      return registration.factory(cfg);
    }
  }

  throw new Error(
    'No AI voice provider is configured. ' +
      'Set at least one of: BLAND_AI_API_KEY, RETELL_AI_API_KEY, or VAPI_API_KEY in your environment variables.',
  );
}

/**
 * List all registered provider names with their configuration status.
 */
export function listProviders(): Array<{
  name: AIProviderName;
  configured: boolean;
}> {
  return Array.from(providerRegistry.entries()).map(([name, reg]) => ({
    name,
    configured: !!(reg.defaultConfig?.apiKey),
  }));
}

/**
 * Validate a specific provider's configuration by making a test API call.
 */
export async function validateProvider(
  providerName: AIProviderName,
  config?: ProviderConfig,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const provider = getProvider(providerName, config);
    return await provider.validateConfig();
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
