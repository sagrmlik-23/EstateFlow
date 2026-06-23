// ============================================================================
// EstateFlow CRM — Voice Communication Provider Factory
// Phase 4 — Voice Adapter (AGENT-4-1-VOICE-ADAPTER)
//
// Returns Exotel (India) or Twilio (global) based on tenant region.
// Applies dry-run wrapper if feature flag is enabled.
// Caches provider instances by tenant.
// ============================================================================

import type {
  CommunicationProvider,
  ProviderConfig,
  VoiceProviderName,
  CallParams,
  CallResult,
  CallStatusResponse,
} from '@/types/communication';
import { ExotelProvider } from './providers/exotel';
import { TwilioProvider } from './providers/twilio';
import { DryRunCallAdapter, isDryRunEnabled } from './dryRun';

// ---------------------------------------------------------------------------
// Provider Instance Cache
// ---------------------------------------------------------------------------

interface CachedProvider {
  instance: CommunicationProvider;
  region: string;
  createdAt: number;
}

const providerCache = new Map<string, CachedProvider>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Tenant Region Helpers
// ---------------------------------------------------------------------------

const INDIA_COUNTRY_CODES = ['+91', '91', 'IN', 'india', 'ind'];

function isIndiaRegion(region?: string, phone?: string): boolean {
  if (region) {
    const normalized = region.toLowerCase().trim();
    if (INDIA_COUNTRY_CODES.includes(normalized)) return true;
  }
  if (phone) {
    const normalized = phone.replace(/[\s+\-]/g, '').trim();
    if (normalized.startsWith('+91') || normalized.startsWith('91')) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Environment-based default configs
// ---------------------------------------------------------------------------

function getEnvConfig(): Record<string, ProviderConfig | undefined> {
  const exotelSid = process.env.EXOTEL_ACCOUNT_SID;
  const exotelKey = process.env.EXOTEL_API_KEY;
  const exotelSecret = process.env.EXOTEL_API_SECRET;
  const exotelFrom = process.env.EXOTEL_FROM_NUMBER || process.env.TWILIO_FROM_NUMBER;

  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioKey = process.env.TWILIO_API_KEY || twilioSid;
  const twilioSecret = process.env.TWILIO_API_SECRET || process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_FROM_NUMBER;

  const webhookUrl = process.env.VOICE_WEBHOOK_URL || `${process.env.BASE_URL || ''}/api/webhooks/voice`;

  return {
    exotel: exotelSid && exotelKey && exotelSecret
      ? {
          apiKey: exotelKey,
          apiSecret: exotelSecret,
          accountSid: exotelSid,
          fromNumber: exotelFrom,
          webhookUrl,
        }
      : undefined,
    twilio: twilioSid && twilioKey && twilioSecret
      ? {
          apiKey: twilioKey,
          apiSecret: twilioSecret,
          accountSid: twilioSid,
          fromNumber: twilioFrom,
          webhookUrl,
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

function getCachedProvider(cacheKey: string): CommunicationProvider | null {
  const cached = providerCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
    providerCache.delete(cacheKey);
    return null;
  }
  return cached.instance;
}

function setCachedProvider(
  cacheKey: string,
  instance: CommunicationProvider,
  region: string,
): void {
  providerCache.set(cacheKey, { instance, region, createdAt: Date.now() });
}

function buildCacheKey(tenantId: string, region: string): string {
  return `${tenantId}::${region}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a voice provider for a given tenant.
 *
 * The provider selection is based on the tenant's region:
 * - India (+91): Exotel (primary)
 * - Global: Twilio (fallback)
 *
 * If a tenant's feature_flags include dryRunEnabled=true, the provider
 * is wrapped in a DryRunCallAdapter that logs instead of making real API calls.
 *
 * @param tenantId - Tenant UUID
 * @param region - Optional region hint (e.g. 'IN', 'US')
 * @param phone - Optional phone number (used to detect region)
 * @param featureFlags - Optional tenant-level feature flags
 * @param config - Optional config overrides
 * @returns A CommunicationProvider instance
 */
export function getVoiceProvider(
  tenantId: string,
  region?: string,
  phone?: string,
  featureFlags?: Record<string, unknown>,
  config?: ProviderConfig,
): CommunicationProvider {
  const resolvedRegion = region || (phone ? (isIndiaRegion(undefined, phone) ? 'IN' : 'WW') : 'WW');
  const cacheKey = buildCacheKey(tenantId, resolvedRegion);

  // Check cache first
  const cached = getCachedProvider(cacheKey);
  if (cached) return cached;

  // Determine which provider to use
  const isIndia = isIndiaRegion(resolvedRegion, phone);
  const envConfigs = getEnvConfig();

  let provider: CommunicationProvider;

  if (isIndia && envConfigs.exotel) {
    // Use Exotel for India
    provider = new ExotelProvider(config ?? envConfigs.exotel);
  } else if (envConfigs.twilio) {
    // Fallback to Twilio for global / when Exotel not configured
    provider = new TwilioProvider(config ?? envConfigs.twilio);
  } else if (envConfigs.exotel) {
    // If Twilio not configured but Exotel is, use Exotel
    provider = new ExotelProvider(config ?? envConfigs.exotel);
  } else {
    throw new Error(
      'No voice provider is configured. ' +
        'Set EXOTEL_ACCOUNT_SID/EXOTEL_API_KEY/EXOTEL_API_SECRET (for India) ' +
        'or TWILIO_ACCOUNT_SID/TWILIO_API_KEY/TWILIO_API_SECRET (for global) ' +
        'in your environment variables.',
    );
  }

  // Apply dry-run wrapper if feature flag enabled
  if (featureFlags && isDryRunEnabled(featureFlags)) {
    provider = new DryRunCallAdapter(provider, {
      mode: true,
      logPath: featureFlags.dryRunLogPath as string | undefined,
    });
  }

  setCachedProvider(cacheKey, provider, resolvedRegion);
  return provider;
}

/**
 * Invalidate cached provider instance for a tenant.
 * Call this when tenant configuration changes (e.g. region, feature flags).
 */
export function invalidateProviderCache(tenantId: string, region?: string): void {
  if (region) {
    providerCache.delete(buildCacheKey(tenantId, region));
  } else {
    // Remove all cache entries for this tenant
    for (const key of Array.from(providerCache.keys())) {
      if (key.startsWith(`${tenantId}::`)) {
        providerCache.delete(key);
      }
    }
  }
}

/**
 * Clear the entire provider cache.
 */
export function clearProviderCache(): void {
  providerCache.clear();
}

/**
 * List available providers and their configuration status.
 */
export function listVoiceProviders(): Array<{
  name: VoiceProviderName;
  configured: boolean;
  region: string;
}> {
  const envConfigs = getEnvConfig();
  return [
    {
      name: 'exotel',
      configured: !!envConfigs.exotel,
      region: 'India (+91)',
    },
    {
      name: 'twilio',
      configured: !!envConfigs.twilio,
      region: 'Global',
    },
  ];
}

/**
 * Validate a voice provider's configuration.
 */
export async function validateVoiceProvider(
  providerName: VoiceProviderName,
  config?: ProviderConfig,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const envConfigs = getEnvConfig();
    const resolvedConfig = config ?? envConfigs[providerName];
    if (!resolvedConfig) {
      return {
        valid: false,
        error: `No configuration available for ${providerName}. Check environment variables.`,
      };
    }

    const provider: CommunicationProvider =
      providerName === 'exotel'
        ? new ExotelProvider(resolvedConfig)
        : new TwilioProvider(resolvedConfig);

    return await provider.validateConfig();
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}

// ---------------------------------------------------------------------------
// Utility: direct provider creation (bypasses cache and feature flags)
// ---------------------------------------------------------------------------

export function createProvider(
  providerName: VoiceProviderName,
  config: ProviderConfig,
): CommunicationProvider {
  switch (providerName) {
    case 'exotel':
      return new ExotelProvider(config);
    case 'twilio':
      return new TwilioProvider(config);
    default:
      throw new Error(`Unknown voice provider: ${providerName}`);
  }
}

/**
 * Get the default voice provider based on available environment config.
 * Returns Exotel if configured, otherwise Twilio.
 */
export function getDefaultVoiceProvider(config?: ProviderConfig): CommunicationProvider {
  const envConfigs = getEnvConfig();
  if (envConfigs.exotel) {
    return new ExotelProvider(config ?? envConfigs.exotel);
  }
  if (envConfigs.twilio) {
    return new TwilioProvider(config ?? envConfigs.twilio);
  }
  throw new Error(
    'No voice provider is configured. ' +
      'Set EXOTEL_ACCOUNT_SID/EXOTEL_API_KEY/EXOTEL_API_SECRET or ' +
      'TWILIO_ACCOUNT_SID/TWILIO_API_KEY/TWILIO_API_SECRET environment variables.',
  );
}
