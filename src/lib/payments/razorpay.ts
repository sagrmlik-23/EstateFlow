// ============================================================================
// EstateFlow CRM — Razorpay Payment Integration
// Agent-7-Payments v1.0.0
// ============================================================================

import Razorpay from 'razorpay';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import type { PaymentRecord, Invoice, InvoiceItem } from '@/types/billing';
import { getTier } from './pricing';

// ---------------------------------------------------------------------------
// Webhook payload types
// ---------------------------------------------------------------------------

interface RazorpayEntity {
  id?: string;
  entity?: string;
  amount?: number;
  currency?: string;
  status?: string;
  order_id?: string;
  subscription_id?: string;
  notes?: Record<string, string>;
  current_end?: number;
  [key: string]: unknown;
}

interface RazorpayWebhookPayload {
  event: string;
  payload?: {
    payment?: { entity: RazorpayEntity };
    subscription?: { entity: RazorpayEntity };
    order?: { entity: RazorpayEntity };
  };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Razorpay Client
// ---------------------------------------------------------------------------

let razorpayInstance: Razorpay | null = null;

function getRazorpay(): Razorpay {
  if (razorpayInstance) return razorpayInstance;

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      'Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
    );
  }

  razorpayInstance = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });

  return razorpayInstance;
}

// ---------------------------------------------------------------------------
// Supabase Client Helper
// ---------------------------------------------------------------------------

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('Supabase credentials not configured');
  }

  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Create Razorpay Subscription
// ---------------------------------------------------------------------------

/**
 * Create a Razorpay subscription for a tenant.
 *
 * Steps:
 *   1. Ensure tenant has a Razorpay customer ID (create one if not).
 *   2. Create a Razorpay subscription with the appropriate plan.
 *   3. Update the tenant record in Supabase.
 *   4. Return the subscription details to the frontend.
 */
export async function createSubscription(
  tenantId: string,
  tierId: string,
  billingCycle: 'monthly' | 'annual' = 'monthly',
  couponCode?: string,
): Promise<{
  subscriptionId: string;
  razorpaySubscriptionId: string;
  shortUrl: string;
}> {
  const razorpay = getRazorpay();
  const supabase = getSupabase();

  // ── 1. Fetch tenant & ensure Razorpay customer ─────────────────────────
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, name, email, razorpay_customer_id, billing_email')
    .eq('id', tenantId)
    .single();

  if (tenantError || !tenant) {
    throw new Error(`Tenant not found: ${tenantError?.message}`);
  }

  let customerId = tenant.razorpay_customer_id;

  if (!customerId) {
    // Create a new Razorpay customer
    const customer = await razorpay.customers.create({
      name: tenant.name,
      email: tenant.billing_email || tenant.email || undefined,
      contact: undefined,
      notes: {
        tenant_id: tenantId,
      },
    });

    customerId = customer.id;

    // Persist the customer ID
    await supabase
      .from('tenants')
      .update({
        razorpay_customer_id: customerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);
  }

  // ── 2. Determine pricing ────────────────────────────────────────────────
  const tier = getTier(tierId);
  if (!tier) {
    throw new Error(`Invalid tier: ${tierId}`);
  }

  let amount: number;
  let period: 'daily' | 'weekly' | 'monthly' | 'yearly';

  if (billingCycle === 'annual') {
    amount = tier.annualPrice * 100; // Razorpay uses paise
    period = 'yearly';
  } else {
    amount = tier.monthlyPrice * 100;
    period = 'monthly';
  }

  // ── 3. Handle coupon code ────────────────────────────────────────────────
  if (couponCode) {
    try {
      const coupon = await (razorpay as any).coupons.fetch(couponCode);
      if (coupon) {
        if (coupon.percent_off) {
          amount = Math.round(amount * (1 - coupon.percent_off / 100));
        } else if (coupon.amount_off) {
          amount = Math.max(0, amount - coupon.amount_off);
        }
      }
    } catch {
      console.warn(`[razorpay] Coupon "${couponCode}" not found or invalid`);
    }
  }

  // ── 4. Create Razorpay plan + subscription ──────────────────────────────
  // For production, plans should be pre-configured in Razorpay dashboard.
  // Here we create an ad-hoc plan for the subscription.

  const plan = await razorpay.plans.create({
    period,
    interval: 1,
    item: {
      name: `${tier.name} Plan (${billingCycle})`,
      amount,
      currency: 'INR',
      description: `EstateFlow ${tier.name} - ${billingCycle} billing`,
    },
    notes: {
      tenant_id: tenantId,
      tier_id: tierId,
    },
  });

  const subscription = await (razorpay as any).subscriptions.create({
    plan_id: plan.id,
    total_count: 0, // 0 = infinite renewals
    customer_id: customerId,
    quantity: 1,
    notes: {
      tenant_id: tenantId,
      tier_id: tierId,
      billing_cycle: billingCycle,
    },
  }) as any;

  // ── 5. Update tenant record ─────────────────────────────────────────────
  const now = new Date().toISOString();
  const periodEnd = new Date();
  if (billingCycle === 'annual') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  await supabase
    .from('tenants')
    .update({
      plan: tierId,
      razorpay_subscription_id: subscription.id,
      current_period_start: now,
      current_period_end: periodEnd.toISOString(),
      status: 'active',
      updated_at: now,
    })
    .eq('id', tenantId);

  return {
    subscriptionId: subscription.id,
    razorpaySubscriptionId: subscription.id,
    shortUrl: subscription.short_url || '',
  };
}

// ---------------------------------------------------------------------------
// Charge One-Time Setup Fee
// ---------------------------------------------------------------------------

/**
 * Charge a one-time setup fee for a tier.
 * Creates an order for the frontend to collect payment via Razorpay checkout.
 */
export async function chargeSetupFee(
  tenantId: string,
  amount: number,
  tierId: string,
): Promise<{
  orderId: string;
  amount: number;
  currency: string;
}> {
  const razorpay = getRazorpay();
  const supabase = getSupabase();

  // Create a Razorpay order
  const order = await razorpay.orders.create({
    amount: Math.round(amount * 100), // Convert to paise
    currency: 'INR',
    receipt: `setup_fee_${tenantId}_${tierId}`,
    notes: {
      tenant_id: tenantId,
      tier_id: tierId,
      type: 'setup_fee',
    },
  });

  // Record the billing transaction
  await supabase.from('tenant_billing').insert({
    tenant_id: tenantId,
    plan: tierId,
    amount: amount,
    status: 'pending',
    razorpay_payment_id: order.id,
    created_at: new Date().toISOString(),
  });

  return {
    orderId: order.id,
    amount: amount * 100,
    currency: 'INR',
  };
}

// ---------------------------------------------------------------------------
// Handle Webhook
// ---------------------------------------------------------------------------

/**
 * Handle incoming Razorpay webhook events.
 *
 * Supported events:
 *   - payment.captured        : successful payment
 *   - payment.failed           : failed payment
 *   - subscription.activated   : subscription activated
 *   - subscription.completed   : subscription completed
 *   - subscription.charged     : recurring charge successful
 *   - subscription.pending     : payment pending
 *   - subscription.halted      : subscription halted after multiple failures
 */
export async function handleWebhook(
  payload: Record<string, unknown>,
): Promise<{ received: boolean; status: string }> {
  const supabase = getSupabase();
  const webhookPayload = payload as RazorpayWebhookPayload;
  const event = webhookPayload.event;

  switch (event) {
    case 'payment.captured': {
      const paymentEntity = webhookPayload.payload?.payment?.entity;
      if (!paymentEntity) break;

      const paymentId = paymentEntity.id;
      const notes = paymentEntity.notes;
      const tenantId = notes?.tenant_id;
      const orderId = paymentEntity.order_id;

      if (!paymentId || !tenantId) break;

      // Mark setup fee as paid if applicable
      await supabase
        .from('tenants')
        .update({
          setup_fee_paid: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tenantId);

      const subId = paymentEntity.subscription_id;

      if (orderId) {
        // Update setup fee billing record
        await supabase
          .from('tenant_billing')
          .update({
            status: 'paid',
            razorpay_payment_id: paymentId,
            paid_at: new Date().toISOString(),
          })
          .eq('razorpay_payment_id', orderId);
      }

      // If this is a recurring subscription payment
      if (subId) {
        const { data: tenants } = await supabase
          .from('tenants')
          .select('id')
          .eq('razorpay_subscription_id', subId);

        if (tenants && tenants.length > 0) {
          const now = new Date().toISOString();
          const periodEnd = new Date();
          periodEnd.setMonth(periodEnd.getMonth() + 1);

          await supabase
            .from('tenants')
            .update({
              current_period_start: now,
              current_period_end: periodEnd.toISOString(),
              status: 'active',
              updated_at: now,
            })
            .eq('id', tenants[0]!.id);

          await supabase.from('tenant_billing').insert({
            tenant_id: tenants[0]!.id,
            plan: 'recurring',
            amount: paymentEntity.amount
              ? Number(paymentEntity.amount) / 100
              : 0,
            status: 'paid',
            razorpay_payment_id: paymentId,
            razorpay_subscription_id: subId,
            paid_at: now,
            created_at: now,
          });
        }
      }
      break;
    }

    case 'payment.failed': {
      const failedEntity = webhookPayload.payload?.payment?.entity;
      if (!failedEntity) break;

      const failedPaymentId = failedEntity.id;
      const failedTenantId = failedEntity.notes?.tenant_id;

      if (failedTenantId && failedPaymentId) {
        await supabase
          .from('tenant_billing')
          .update({
            status: 'failed',
            razorpay_payment_id: failedPaymentId,
          })
          .eq('tenant_id', failedTenantId)
          .eq('status', 'pending');
      }
      break;
    }

    case 'subscription.activated': {
      const subEntity = webhookPayload.payload?.subscription?.entity;
      if (!subEntity) break;

      const subId = subEntity.id;
      const subTenantId = subEntity.notes?.tenant_id;

      if (subTenantId && subId) {
        const now = new Date().toISOString();
        const periodEnd = subEntity.current_end
          ? new Date((subEntity.current_end as number) * 1000).toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        await supabase
          .from('tenants')
          .update({
            status: 'active',
            razorpay_subscription_id: subId,
            current_period_start: now,
            current_period_end: periodEnd,
            updated_at: now,
          })
          .eq('id', subTenantId);
      }
      break;
    }

    case 'subscription.completed':
    case 'subscription.halted': {
      const haltedEntity = webhookPayload.payload?.subscription?.entity;
      if (!haltedEntity) break;

      const haltedSubId = haltedEntity.id;

      if (haltedSubId) {
        const { data: haltedTenants } = await supabase
          .from('tenants')
          .select('id')
          .eq('razorpay_subscription_id', haltedSubId);

        if (haltedTenants && haltedTenants.length > 0) {
          await supabase
            .from('tenants')
            .update({
              status: event === 'subscription.halted' ? 'suspended' : 'active',
              updated_at: new Date().toISOString(),
            })
            .eq('id', haltedTenants[0]!.id);
        }
      }
      break;
    }

    case 'subscription.charged': {
      const chargedEntity = webhookPayload.payload?.subscription?.entity;
      if (!chargedEntity) break;

      const chargedSubId = chargedEntity.id;

      if (chargedSubId) {
        const { data: chargedTenants } = await supabase
          .from('tenants')
          .select('id')
          .eq('razorpay_subscription_id', chargedSubId);

        if (chargedTenants && chargedTenants.length > 0) {
          const now = new Date().toISOString();
          const periodEnd = new Date();
          periodEnd.setMonth(periodEnd.getMonth() + 1);

          await supabase
            .from('tenants')
            .update({
              current_period_start: now,
              current_period_end: periodEnd.toISOString(),
              updated_at: now,
            })
            .eq('id', chargedTenants[0]!.id);
        }
      }
      break;
    }

    default:
      console.log(`[razorpay] Unhandled event type: ${event}`);
  }

  return { received: true, status: 'processed' };
}

// ---------------------------------------------------------------------------
// Cancel Subscription
// ---------------------------------------------------------------------------

/**
 * Cancel a Razorpay subscription at period end.
 */
export async function cancelSubscription(
  subscriptionId: string,
  atPeriodEnd: boolean = true,
): Promise<{ cancelled: boolean }> {
  const razorpay = getRazorpay();
  const supabase = getSupabase();

  // Cancel the subscription in Razorpay
  await razorpay.subscriptions.cancel(subscriptionId, atPeriodEnd);

  // Find and update the tenant
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id')
    .eq('razorpay_subscription_id', subscriptionId);

  if (tenants && tenants.length > 0) {
    const now = new Date().toISOString();
    await supabase
      .from('tenants')
      .update({
        plan: 'free',
        status: 'cancelled',
        current_period_end: atPeriodEnd ? undefined : now,
        updated_at: now,
      })
      .eq('id', tenants[0]!.id);
  }

  return { cancelled: true };
}

// ---------------------------------------------------------------------------
// Get Payment History
// ---------------------------------------------------------------------------

/**
 * Get payment/billing history for a tenant.
 */
export async function getPaymentHistory(
  tenantId: string,
): Promise<PaymentRecord[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('tenant_billing')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Failed to fetch payment history: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    plan: row.plan,
    amount: row.amount,
    status: row.status,
    razorpaySubscriptionId: row.razorpay_subscription_id,
    razorpayPaymentId: row.razorpay_payment_id,
    paidAt: row.paid_at,
    retryCount: row.retry_count,
    createdAt: row.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Generate Invoice
// ---------------------------------------------------------------------------

/**
 * Generate an invoice for a tenant for a given billing period.
 */
export async function generateInvoice(
  tenantId: string,
  period: { start: string; end: string },
): Promise<Invoice> {
  const supabase = getSupabase();

  // Fetch tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, plan, billing_email')
    .eq('id', tenantId)
    .single();

  if (!tenant) throw new Error('Tenant not found');

  const tier = getTier(tenant.plan);
  const monthlyPrice = tier?.monthlyPrice ?? 0;

  // Build invoice items
  const items: InvoiceItem[] = [
    {
      id: crypto.randomUUID(),
      description: `${tier?.name || tenant.plan} Plan - Monthly Subscription`,
      quantity: 1,
      unitPrice: monthlyPrice,
      amount: monthlyPrice,
    },
  ];

  // If setup fee is not paid, add it
  if (tier?.setupFee && tier.setupFee > 0) {
    items.push({
      id: crypto.randomUUID(),
      description: 'One-time Setup Fee',
      quantity: 1,
      unitPrice: tier.setupFee,
      amount: tier.setupFee,
    });
  }

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

  const invoice: Invoice = {
    id: crypto.randomUUID(),
    tenantId,
    tenantName: tenant.name,
    amount: totalAmount,
    status: 'pending',
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    paidAt: null,
    items,
    razorpayPaymentId: null,
    razorpayInvoiceId: null,
    planName: tier?.name || tenant.plan,
    billingPeriod: period,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return invoice;
}

// ---------------------------------------------------------------------------
// Verify Webhook Signature
// ---------------------------------------------------------------------------

/**
 * Verify that a webhook payload came from Razorpay.
 * Uses the webhook secret configured in Razorpay dashboard.
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  webhookSecret?: string,
): boolean {
  const secret = webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret) {
    console.warn('[razorpay] No webhook secret configured — skipping verification');
    return true;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature),
  );
}
