// ============================================================================
// EstateFlow CRM — Centralized Notification Service
// Agent-4-3-Email-Notifications v1.0.0
// ============================================================================

import { getResendProvider } from '@/lib/communication/providers/resend';
import { renderWithBranding } from '@/lib/email/renderTemplate';
import type { WhiteLabelConfig } from '@/types/whitelabel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported notification channels */
export type NotificationChannel =
  | 'in_app'
  | 'email'
  | 'whatsapp'
  | 'sms'
  | 'push';

/** Predefined notification types */
export type NotificationType =
  | 'new_lead'
  | 'lead_assigned'
  | 'call_missed'
  | 'deal_won'
  | 'payment_due'
  | 'task_assigned'
  | 'task_due'
  | 'property_inquiry'
  | 'system_alert';

/** A single notification record */
export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
  read_at: string | null;
}

/** Parameters for sending a notification */
export interface SendNotificationParams {
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Additional structured data (e.g., lead_id, property_id) */
  data?: Record<string, unknown>;
  /** User's preferred channels (defaults to all available) */
  channels?: NotificationChannel[];
  /** Tenant branding config for email templates */
  tenantConfig?: WhiteLabelConfig | null;
  /** Email-specific overrides */
  email?: {
    to: string;
    reactComponent?: React.ReactElement;
    from?: string;
    replyTo?: string;
  };
}

/** Parameters for bulk sending to multiple users */
export interface SendBulkNotificationParams {
  tenantId: string;
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channels?: NotificationChannel[];
  tenantConfig?: WhiteLabelConfig | null;
}

// ---------------------------------------------------------------------------
// In-memory notification store (MVP)
// ---------------------------------------------------------------------------

/**
 * In-memory store for in-app notifications.
 * In production, replace with a PostgreSQL table (notifications).
 */
const notificationStore: Notification[] = [];
let notificationIdCounter = 0;

// ---------------------------------------------------------------------------
// Notification templates
// ---------------------------------------------------------------------------

/**
 * Default title/body templates per notification type.
 */
const NOTIFICATION_TEMPLATES: Record<
  NotificationType,
  { title: string; body: string }
> = {
  new_lead: {
    title: 'New Lead Received',
    body: 'A new lead has been captured. Check the details in your CRM.',
  },
  lead_assigned: {
    title: 'Lead Assigned',
    body: 'A new lead has been assigned to you.',
  },
  call_missed: {
    title: 'Missed Call',
    body: 'An AI call was missed or not answered.',
  },
  deal_won: {
    title: 'Deal Won 🎉',
    body: 'Congratulations! A deal has been closed successfully.',
  },
  payment_due: {
    title: 'Payment Due',
    body: 'A payment is due. Please review and process it.',
  },
  task_assigned: {
    title: 'New Task Assigned',
    body: 'A new task has been assigned to you.',
  },
  task_due: {
    title: 'Task Due Soon',
    body: 'A task is approaching its due date.',
  },
  property_inquiry: {
    title: 'Property Inquiry',
    body: 'Someone has inquired about a property.',
  },
  system_alert: {
    title: 'System Alert',
    body: 'There is a system notification that requires attention.',
  },
};

// ---------------------------------------------------------------------------
// NotificationService
// ---------------------------------------------------------------------------

/**
 * Centralized notification dispatcher.
 *
 * Routes notifications through the user's preferred channels:
 * - In-app (in-memory store for MVP)
 * - Email (via Resend)
 * - WhatsApp, SMS, Push (stub — ready for integration)
 */
export class NotificationService {
  // ─── Send single notification ───────────────────────────────────────────

  /**
   * Send a notification to a single user via their preferred channels.
   *
   * @param params - Notification parameters
   * @returns Array of results per channel
   */
  async sendNotification(
    params: SendNotificationParams,
  ): Promise<Array<{ channel: NotificationChannel; success: boolean; error?: string }>> {
    const channels = params.channels ?? ['in_app', 'email'];
    const results: Array<{
      channel: NotificationChannel;
      success: boolean;
      error?: string;
    }> = [];

    for (const channel of channels) {
      try {
        switch (channel) {
          case 'in_app':
            await this.deliverInApp(params);
            results.push({ channel: 'in_app', success: true });
            break;
          case 'email':
            if (params.email?.to) {
              await this.deliverEmail(params);
              results.push({ channel: 'email', success: true });
            } else {
              results.push({
                channel: 'email',
                success: false,
                error: 'No recipient email provided',
              });
            }
            break;
          case 'whatsapp':
            await this.deliverWhatsApp(params);
            results.push({ channel: 'whatsapp', success: true });
            break;
          case 'sms':
            await this.deliverSms(params);
            results.push({ channel: 'sms', success: true });
            break;
          case 'push':
            await this.deliverPush(params);
            results.push({ channel: 'push', success: true });
            break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        results.push({ channel, success: false, error: message });
      }
    }

    return results;
  }

  // ─── Send bulk notification ─────────────────────────────────────────────

  /**
   * Send a notification to multiple users.
   *
   * @param params - Bulk notification parameters
   * @returns Map of userId → delivery results per channel
   */
  async sendBulkNotification(
    params: SendBulkNotificationParams,
  ): Promise<Record<string, Array<{ channel: NotificationChannel; success: boolean; error?: string }>>> {
    const results: Record<
      string,
      Array<{ channel: NotificationChannel; success: boolean; error?: string }>
    > = {};

    for (const userId of params.userIds) {
      results[userId] = await this.sendNotification({
        ...params,
        userId,
        email: undefined, // Bulk emails need per-user email addresses
      });
    }

    return results;
  }

  // ─── Helpers: retrieve notifications ────────────────────────────────────

  /**
   * Get in-app notifications for a user.
   *
   * @param userId - User UUID
   * @param options - Optional filtering/pagination
   * @returns List of notifications
   */
  async getNotifications(
    userId: string,
    options?: { limit?: number; offset?: number; unreadOnly?: boolean },
  ): Promise<{ data: Notification[]; total: number }> {
    let filtered = notificationStore.filter((n) => n.user_id === userId);

    if (options?.unreadOnly) {
      filtered = filtered.filter((n) => !n.read);
    }

    // Sort newest first
    filtered.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const total = filtered.length;
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;

    return {
      data: filtered.slice(offset, offset + limit),
      total,
    };
  }

  /**
   * Get unread notification count for a user.
   *
   * @param userId - User UUID
   * @returns Unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return notificationStore.filter(
      (n) => n.user_id === userId && !n.read,
    ).length;
  }

  /**
   * Mark a notification as read.
   *
   * @param notificationId - Notification UUID
   * @param userId - User UUID (for authorization)
   * @returns True if updated, false if not found
   */
  async markAsRead(
    notificationId: string,
    userId: string,
  ): Promise<boolean> {
    const notification = notificationStore.find(
      (n) => n.id === notificationId && n.user_id === userId,
    );
    if (!notification) return false;

    notification.read = true;
    notification.read_at = new Date().toISOString();
    return true;
  }

  /**
   * Mark all notifications as read for a user.
   *
   * @param userId - User UUID
   * @returns Number of notifications marked as read
   */
  async markAllAsRead(userId: string): Promise<number> {
    let count = 0;
    for (const notification of notificationStore) {
      if (notification.user_id === userId && !notification.read) {
        notification.read = true;
        notification.read_at = new Date().toISOString();
        count++;
      }
    }
    return count;
  }

  // ─── Channel deliverers ─────────────────────────────────────────────────

  /**
   * Deliver an in-app notification (store in memory).
   */
  private async deliverInApp(
    params: SendNotificationParams,
  ): Promise<Notification> {
    const notification: Notification = {
      id: crypto.randomUUID(),
      tenant_id: params.tenantId,
      user_id: params.userId,
      type: params.type,
      channel: 'in_app',
      title: params.title,
      body: params.body,
      data: params.data ?? null,
      read: false,
      created_at: new Date().toISOString(),
      read_at: null,
    };

    notificationStore.push(notification);
    return notification;
  }

  /**
   * Deliver an email notification via Resend.
   */
  private async deliverEmail(
    params: SendNotificationParams,
  ): Promise<void> {
    if (!params.email?.to) {
      throw new Error('Email channel requires a recipient address');
    }

    const provider = getResendProvider();
    const html =
      params.email?.reactComponent
        ? await renderWithBranding(
            params.email.reactComponent,
            params.tenantConfig ?? null,
          )
        : await this.renderFallbackEmail(
            params.title,
            params.body,
            params.tenantConfig ?? null,
          );

    await provider.sendEmail({
      to: params.email.to,
      subject: params.title,
      html,
      from: params.email.from,
      replyTo: params.email.replyTo,
    });
  }

  /**
   * Render a fallback plain-HTML email for notifications without a custom template.
   */
  private async renderFallbackEmail(
    title: string,
    body: string,
    config: WhiteLabelConfig | null,
  ): Promise<string> {
    const companyName = config?.company_name ?? 'EstateFlow CRM';
    const primary = config?.primary_color ?? '#1e40af';

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px 48px;">
              <h1 style="color:${primary};font-size:22px;margin:0 0 16px;">${title}</h1>
              <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 16px;">${body}</p>
              ${config?.is_white_label ? '' : '<hr style="border:none;border-top:1px solid #eee;margin:24px 0;"><p style="color:#8898aa;font-size:12px;text-align:center;">Powered by EstateFlow CRM</p>'}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /**
   * Deliver a WhatsApp notification.
   * Stub — integrate with WhatsApp Business API / Twilio.
   */
  private async deliverWhatsApp(
    _params: SendNotificationParams,
  ): Promise<void> {
    // TODO: Integrate with WhatsApp Business API (Twilio / 360dialog)
    console.debug('[Notifications] WhatsApp channel — stub');
  }

  /**
   * Deliver an SMS notification.
   * Stub — integrate with Twilio / AWS SNS.
   */
  private async deliverSms(
    _params: SendNotificationParams,
  ): Promise<void> {
    // TODO: Integrate with Twilio SMS or AWS SNS
    console.debug('[Notifications] SMS channel — stub');
  }

  /**
   * Deliver a push notification.
   * Stub — integrate with Firebase Cloud Messaging / Web Push API.
   */
  private async deliverPush(
    _params: SendNotificationParams,
  ): Promise<void> {
    // TODO: Integrate with Firebase Cloud Messaging or Web Push
    console.debug('[Notifications] Push notification channel — stub');
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _notifInstance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!_notifInstance) {
    _notifInstance = new NotificationService();
  }
  return _notifInstance;
}

export function resetNotificationService(): void {
  _notifInstance = null;
}
