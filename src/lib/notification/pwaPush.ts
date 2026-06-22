// ============================================================================
// EstateFlow CRM — PWA Push Notification Service
// Agent-4-6-Notification-Preferences v1.0.0
// ============================================================================

import * as webPush from 'web-push';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Push subscription as stored in the database */
export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  tenantId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent: string | null;
  created_at: string;
  updated_at: string;
}

/** Push notification payload */
export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  tag?: string;
  url?: string;
  requireInteraction?: boolean;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

// ---------------------------------------------------------------------------
// VAPID Keys
// ---------------------------------------------------------------------------

/**
 * Generate or retrieve VAPID keys for web push.
 * In production, store these in environment variables.
 */
export function getVapidKeys(): {
  publicKey: string;
  privateKey: string;
} {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (publicKey && privateKey) {
    return { publicKey, privateKey };
  }

  // Generate keys if not configured (development only)
  const vapidKeys = webPush.generateVAPIDKeys();
  console.warn(
    '[pwaPush] VAPID keys not found in env. Generated fresh keys. ' +
      'Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in production.',
  );

  return vapidKeys;
}

/**
 * Get the VAPID subject (mailto: or URL) for the push service.
 */
function getVapidSubject(): string {
  return process.env.VAPID_SUBJECT ?? 'mailto:admin@estateflow.app';
}

// ---------------------------------------------------------------------------
// In-memory store (MVP)
// ---------------------------------------------------------------------------

/**
 * In-memory store for push subscriptions.
 * In production, replace with a PostgreSQL table (push_subscriptions).
 */
const subscriptionsStore: Map<string, PushSubscriptionRecord[]> = new Map();
let subIdCounter = 0;

// ---------------------------------------------------------------------------
// PushNotificationService
// ---------------------------------------------------------------------------

/**
 * Service for managing PWA push notification subscriptions and delivery.
 */
export class PushNotificationService {
  private configured = false;

  /**
   * Configure web-push with VAPID keys.
   * Called automatically on first send if not already configured.
   */
  private configure(): void {
    if (this.configured) return;

    const { publicKey, privateKey } = getVapidKeys();

    webPush.setVapidDetails(getVapidSubject(), publicKey, privateKey);
    this.configured = true;
  }

  // ─── Subscribe ────────────────────────────────────────────────────────────

  /**
   * Save a push subscription for a user.
   *
   * @param userId - User UUID
   * @param tenantId - Tenant UUID
   * @param subscription - Push subscription from the browser
   * @param userAgent - Optional user agent string
   * @returns Saved subscription record
   */
  async subscribeUser(
    userId: string,
    tenantId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string | null,
  ): Promise<PushSubscriptionRecord> {
    // Remove existing subscription with same endpoint (re-subscribe)
    const existing = subscriptionsStore.get(userId) ?? [];
    const filtered = existing.filter(
      (s) => s.endpoint !== subscription.endpoint,
    );

    const record: PushSubscriptionRecord = {
      id: `sub-${++subIdCounter}`,
      userId,
      tenantId,
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      userAgent: userAgent ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    filtered.push(record);
    subscriptionsStore.set(userId, filtered);

    return { ...record };
  }

  // ─── Unsubscribe ──────────────────────────────────────────────────────────

  /**
   * Remove a push subscription by endpoint.
   *
   * @param endpoint - Push subscription endpoint URL
   * @returns True if a subscription was removed
   */
  async unsubscribeUser(endpoint: string): Promise<boolean> {
    const entries = Array.from(subscriptionsStore.entries());
    for (const [userId, subs] of entries) {
      const index = subs.findIndex((s) => s.endpoint === endpoint);
      if (index !== -1) {
        subs.splice(index, 1);
        if (subs.length === 0) {
          subscriptionsStore.delete(userId);
        } else {
          subscriptionsStore.set(userId, subs);
        }
        return true;
      }
    }
    return false;
  }

  // ─── Get subscriptions ────────────────────────────────────────────────────

  /**
   * Get all push subscriptions for a user.
   *
   * @param userId - User UUID
   * @returns Array of subscription records
   */
  async getSubscriptions(
    userId: string,
  ): Promise<PushSubscriptionRecord[]> {
    return [...(subscriptionsStore.get(userId) ?? [])];
  }

  // ─── Send push notification ───────────────────────────────────────────────

  /**
   * Send a push notification to a single subscription.
   *
   * @param subscription - Push subscription (endpoint + keys)
   * @param payload - Notification payload
   * @returns Result with success status
   */
  async sendPushNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: PushNotificationPayload,
  ): Promise<{ success: boolean; error?: string }> {
    this.configure();

    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
        },
        JSON.stringify(payload),
        {
          TTL: 86400, // 24 hours
          urgency: 'normal',
        },
      );

      return { success: true };
    } catch (error) {
      if (error instanceof webPush.WebPushError) {
        // Subscription is no longer valid (410 Gone)
        if (error.statusCode === 410 || error.statusCode === 404) {
          await this.unsubscribeUser(subscription.endpoint);
          return {
            success: false,
            error: 'Subscription expired or removed',
          };
        }

        return {
          success: false,
          error: `Push error (${error.statusCode}): ${error.message}`,
        };
      }

      const message =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  // ─── Send to user (all devices) ───────────────────────────────────────────

  /**
   * Send a push notification to all devices of a user.
   *
   * @param userId - User UUID
   * @param payload - Notification payload
   * @returns Array of delivery results per subscription
   */
  async sendToUser(
    userId: string,
    payload: PushNotificationPayload,
  ): Promise<Array<{ subscriptionId: string; success: boolean; error?: string }>> {
    const subscriptions = subscriptionsStore.get(userId) ?? [];
    const results: Array<{ subscriptionId: string; success: boolean; error?: string }> = [];

    for (const sub of subscriptions) {
      const result = await this.sendPushNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload,
      );
      results.push({
        subscriptionId: sub.id,
        success: result.success,
        error: result.error,
      });
    }

    return results;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _pushInstance: PushNotificationService | null = null;

export function getPushNotificationService(): PushNotificationService {
  if (!_pushInstance) {
    _pushInstance = new PushNotificationService();
  }
  return _pushInstance;
}

export function resetPushNotificationService(): void {
  _pushInstance = null;
  subscriptionsStore.clear();
}
