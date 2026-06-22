// ============================================================================
// EstateFlow CRM — Billing & Payment Type Definitions
// Agent-7-Payments v1.0.0
// ============================================================================

// ---------------------------------------------------------------------------
// Pricing Tier
// ---------------------------------------------------------------------------

export interface PricingTierLimit {
  users: number;
  properties: number;
  leads: number;
  storage_gb: number;
  ai_calls: number;
  api_calls: number;
}

export interface PricingTierFeature {
  name: string;
  included: boolean;
  description?: string;
}

export interface PricingTier {
  id: string;
  name: string;
  displayPrice: string;
  setupFee: number;
  monthlyPrice: number;
  annualPrice: number;
  features: PricingTierFeature[];
  limits: PricingTierLimit;
  isNegotiable: boolean;
  popular?: boolean;
}

// ---------------------------------------------------------------------------
// Custom/Negotiated Pricing
// ---------------------------------------------------------------------------

export interface CustomPricing {
  tenantId: string;
  baseTierId: string;
  negotiatedSetupFee: number | null;
  negotiatedMonthlyPrice: number | null;
  negotiatedAnnualPrice: number | null;
  customLimits: Partial<PricingTierLimit> | null;
  contractDurationMonths: number | null;
  discountPercentage: number;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Billing Dashboard (Super Admin view)
// ---------------------------------------------------------------------------

export interface RevenueByTier {
  tierId: string;
  tierName: string;
  count: number;
  monthlyRevenue: number;
  annualRevenue: number;
}

export interface BillingDashboard {
  totalMrr: number;
  totalArr: number;
  activeTenants: number;
  churnRate: number;
  avgRevenuePerTenant: number;
  revenueByTier: RevenueByTier[];
  failedPayments: number;
  upcomingRenewals: number;
  totalCollected: number;
  periodStart: string;
  periodEnd: string;
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  tenantName?: string;
  amount: number;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
  dueDate: string;
  paidAt: string | null;
  items: InvoiceItem[];
  razorpayPaymentId: string | null;
  razorpayInvoiceId: string | null;
  planName: string;
  billingPeriod: { start: string; end: string } | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Payment History
// ---------------------------------------------------------------------------

export interface PaymentRecord {
  id: string;
  tenantId: string;
  plan: string;
  amount: number;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
  razorpaySubscriptionId: string | null;
  razorpayPaymentId: string | null;
  paidAt: string | null;
  retryCount: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Billing Cycle
// ---------------------------------------------------------------------------

export type BillingCycle = 'monthly' | 'annual';

// ---------------------------------------------------------------------------
// Subscription Status
// ---------------------------------------------------------------------------

export type SubscriptionStatus =
  | 'active'
  | 'incomplete'
  | 'incomplete_expired'
  | 'past_due'
  | 'cancelled'
  | 'paused'
  | 'trialing';

// ---------------------------------------------------------------------------
// API request/response types
// ---------------------------------------------------------------------------

export interface CreateSubscriptionRequest {
  tenantId: string;
  tierId: string;
  billingCycle: BillingCycle;
  couponCode?: string;
}

export interface CreateSubscriptionResponse {
  success: boolean;
  subscriptionId?: string;
  razorpaySubscriptionId?: string;
  shortUrl?: string;
  error?: string;
}

export interface ChargeSetupFeeRequest {
  tenantId: string;
  tierId: string;
}

export interface ChargeSetupFeeResponse {
  success: boolean;
  paymentId?: string;
  razorpayPaymentId?: string;
  error?: string;
}

export interface InvoiceListResponse {
  success: boolean;
  data: Invoice[];
  error?: string;
}

export interface BillingDashboardResponse {
  success: boolean;
  data?: BillingDashboard;
  error?: string;
}
