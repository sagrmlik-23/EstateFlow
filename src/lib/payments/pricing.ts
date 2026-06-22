// ============================================================================
// EstateFlow CRM — Pricing Tiers & Configuration
// Agent-7-Payments v1.0.0
// ============================================================================

import type { PricingTier, BillingCycle, CustomPricing } from '@/types/billing';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Default Tiers
// ---------------------------------------------------------------------------

export const DEFAULT_TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    displayPrice: 'Free',
    setupFee: 0,
    monthlyPrice: 0,
    annualPrice: 0,
    features: [
      { name: 'Up to 3 users', included: true },
      { name: 'Up to 20 properties', included: true },
      { name: 'Up to 50 leads', included: true },
      { name: '5 GB storage', included: true },
      { name: 'Basic reports', included: true },
      { name: 'Email support', included: true },
      { name: 'AI voice agents', included: false },
      { name: 'Custom branding', included: false },
      { name: 'API access', included: false },
      { name: 'Priority support', included: false },
    ],
    limits: {
      users: 3,
      properties: 20,
      leads: 50,
      storage_gb: 5,
      ai_calls: 0,
      api_calls: 0,
    },
    isNegotiable: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    displayPrice: '₹2,999/mo',
    setupFee: 9999,
    monthlyPrice: 2999,
    annualPrice: 29990, // ~₹2,499/mo annual
    features: [
      { name: 'Up to 10 users', included: true },
      { name: 'Up to 100 properties', included: true },
      { name: 'Up to 500 leads', included: true },
      { name: '15 GB storage', included: true },
      { name: 'Advanced reports', included: true },
      { name: 'Email & chat support', included: true },
      { name: '50 AI voice calls/mo', included: true },
      { name: 'Custom branding', included: false },
      { name: 'API access', included: true },
      { name: 'Priority support', included: false },
    ],
    limits: {
      users: 10,
      properties: 100,
      leads: 500,
      storage_gb: 15,
      ai_calls: 50,
      api_calls: 1000,
    },
    isNegotiable: false,
    popular: false,
  },
  {
    id: 'professional',
    name: 'Professional',
    displayPrice: '₹7,999/mo',
    setupFee: 24999,
    monthlyPrice: 7999,
    annualPrice: 79990, // ~₹6,666/mo annual
    features: [
      { name: 'Up to 25 users', included: true },
      { name: 'Unlimited properties', included: true },
      { name: 'Unlimited leads', included: true },
      { name: '50 GB storage', included: true },
      { name: 'Advanced reports & analytics', included: true },
      { name: 'Email, chat & phone support', included: true },
      { name: '200 AI voice calls/mo', included: true },
      { name: 'Custom branding (white-label)', included: true },
      { name: 'Full API access', included: true },
      { name: 'Priority support', included: true },
    ],
    limits: {
      users: 25,
      properties: -1, // unlimited
      leads: -1, // unlimited
      storage_gb: 50,
      ai_calls: 200,
      api_calls: 10000,
    },
    isNegotiable: true,
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    displayPrice: '₹25,000/mo',
    setupFee: 49999,
    monthlyPrice: 25000,
    annualPrice: 250000, // ~₹20,833/mo annual
    features: [
      { name: 'Unlimited users', included: true },
      { name: 'Unlimited properties', included: true },
      { name: 'Unlimited leads', included: true },
      { name: '100 GB storage', included: true },
      { name: 'Custom analytics & BI', included: true },
      { name: 'Dedicated account manager', included: true },
      { name: 'Unlimited AI voice calls', included: true },
      { name: 'Full white-label', included: true },
      { name: 'Full API + webhooks', included: true },
      { name: '24/7 priority support & SLA', included: true },
    ],
    limits: {
      users: -1, // unlimited
      properties: -1,
      leads: -1,
      storage_gb: 100,
      ai_calls: -1,
      api_calls: -1,
    },
    isNegotiable: true,
    popular: false,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get a pricing tier by its ID.
 */
export function getTier(tierId: string): PricingTier | undefined {
  return DEFAULT_TIERS.find((t) => t.id === tierId);
}

/**
 * Calculate the effective price for a given tier and billing cycle.
 */
export function calculatePrice(
  tierId: string,
  billingCycle: BillingCycle,
): { price: number; setupFee: number; displayPrice: string } {
  const tier = getTier(tierId);
  if (!tier) {
    throw new Error(`Unknown pricing tier: ${tierId}`);
  }

  if (billingCycle === 'annual') {
    return {
      price: tier.annualPrice,
      setupFee: tier.setupFee,
      displayPrice: `₹${(tier.annualPrice / 12).toLocaleString('en-IN')}/mo billed annually`,
    };
  }

  return {
    price: tier.monthlyPrice,
    setupFee: tier.setupFee,
    displayPrice: tier.displayPrice,
  };
}

/**
 * Create a custom/negotiated pricing record for a tenant.
 */
export async function createCustomPricing(
  tenantId: string,
  customPricing: Omit<CustomPricing, 'tenantId' | 'createdAt' | 'updatedAt'>,
  supabaseUrl?: string,
  supabaseKey?: string,
): Promise<CustomPricing> {
  const url = supabaseUrl || process.env.SUPABASE_URL;
  const key = supabaseKey || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('Supabase credentials not configured');
  }

  const supabase = createClient(url, key);

  // Store negotiated pricing as metadata in the tenants table
  const negotiatedPricing = {
    base_tier_id: customPricing.baseTierId,
    negotiated_setup_fee: customPricing.negotiatedSetupFee,
    negotiated_monthly_price: customPricing.negotiatedMonthlyPrice,
    negotiated_annual_price: customPricing.negotiatedAnnualPrice,
    custom_limits: customPricing.customLimits,
    contract_duration_months: customPricing.contractDurationMonths,
    discount_percentage: customPricing.discountPercentage,
    valid_until: customPricing.validUntil,
  };

  const { error } = await supabase
    .from('tenants')
    .update({
      negotiated_discount: customPricing.discountPercentage,
      contract_duration_months: customPricing.contractDurationMonths,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tenantId);

  if (error) {
    throw new Error(`Failed to save custom pricing: ${error.message}`);
  }

  return {
    tenantId,
    ...customPricing,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get the effective price for a tenant after negotiation/custom pricing.
 */
export async function getTenantPrice(
  tenantId: string,
  tierId: string,
  billingCycle: BillingCycle,
  supabaseUrl?: string,
  supabaseKey?: string,
): Promise<{ price: number; setupFee: number; discountPercentage: number }> {
  const url = supabaseUrl || process.env.SUPABASE_URL;
  const key = supabaseKey || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('Supabase credentials not configured');
  }

  const supabase = createClient(url, key);

  // Fetch tenant to check for negotiated pricing
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('negotiated_discount')
    .eq('id', tenantId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch tenant: ${error.message}`);
  }

  const discountPercentage = tenant?.negotiated_discount ?? 0;
  const basePrice = calculatePrice(tierId, billingCycle);

  const discountedPrice = Math.round(
    basePrice.price * (1 - discountPercentage / 100),
  );
  const discountedSetupFee = Math.round(
    basePrice.setupFee * (1 - discountPercentage / 100),
  );

  return {
    price: discountedPrice,
    setupFee: discountedSetupFee,
    discountPercentage,
  };
}

/**
 * Get feature flag mapping for a given tier.
 */
export function getTierFeatureFlags(tierId: string): Record<string, boolean> {
  const tier = getTier(tierId);
  if (!tier) return {};

  return {
    ai_voice_enabled: tier.limits.ai_calls > 0 || tier.limits.ai_calls === -1,
    custom_branding: tierId === 'professional' || tierId === 'enterprise',
    api_access: tierId !== 'free',
    priority_support: tierId === 'professional' || tierId === 'enterprise',
    unlimited_properties:
      tier.limits.properties === -1,
    unlimited_leads: tier.limits.leads === -1,
    unlimited_users: tier.limits.users === -1,
    unlimited_ai_calls:
      tier.limits.ai_calls === -1,
  };
}
