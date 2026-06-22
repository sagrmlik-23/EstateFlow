// ============================================================================
// EstateFlow CRM — Notification Preferences Service
// Agent-4-6-Notification-Preferences v1.0.0
// ============================================================================

import { z } from 'zod';

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

/** All notification channels */
export const ALL_CHANNELS: NotificationChannel[] = [
  'in_app',
  'email',
  'whatsapp',
  'sms',
  'push',
];

/** Quiet hours configuration */
export interface QuietHours {
  /** Quiet hours enabled */
  enabled: boolean;
  /** Start time in 24h format HH:mm (e.g. "22:00") */
  start: string;
  /** End time in 24h format HH:mm (e.g. "08:00") */
  end: string;
  /** Timezone (e.g. "Asia/Kolkata") */
  timezone: string;
}

/** Default quiet hours (22:00–08:00 IST) */
export const DEFAULT_QUIET_HOURS: QuietHours = {
  enabled: false,
  start: '22:00',
  end: '08:00',
  timezone: 'Asia/Kolkata',
};

/** Per-channel preference */
export interface ChannelPreference {
  channel: NotificationChannel;
  enabled: boolean;
}

/** Full user notification preference record */
export interface NotificationPreference {
  id: string;
  userId: string;
  tenantId: string;
  channels: ChannelPreference[];
  quietHours: QuietHours;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const quietHoursSchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:mm)'),
  end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:mm)'),
  timezone: z.string().min(1),
});

const channelPreferenceSchema = z.object({
  channel: z.enum(['in_app', 'email', 'whatsapp', 'sms', 'push']),
  enabled: z.boolean(),
});

const updatePreferenceSchema = z.object({
  channel: z.enum(['in_app', 'email', 'whatsapp', 'sms', 'push']),
  enabled: z.boolean(),
});

const setQuietHoursSchema = quietHoursSchema;

// ---------------------------------------------------------------------------
// In-memory store (MVP)
// ---------------------------------------------------------------------------

/**
 * In-memory store for notification preferences.
 * In production, replace with a PostgreSQL table (notification_preferences).
 */
const preferencesStore: Map<string, NotificationPreference> = new Map();
let prefIdCounter = 0;

// ---------------------------------------------------------------------------
// NotificationPreferencesService
// ---------------------------------------------------------------------------

/**
 * Service for managing user notification preferences.
 *
 * Handles per-channel toggles and quiet hours configuration.
 */
export class NotificationPreferencesService {
  // ─── Get preferences ──────────────────────────────────────────────────────

  /**
   * Get notification preferences for a user.
   * Returns defaults if no preferences exist yet.
   *
   * @param userId - User UUID
   * @param tenantId - Tenant UUID
   * @returns User's notification preferences
   */
  async getPreferences(
    userId: string,
    tenantId: string,
  ): Promise<NotificationPreference> {
    const existing = preferencesStore.get(userId);

    if (existing) {
      return { ...existing };
    }

    // Create default preferences
    const defaults: NotificationPreference = {
      id: crypto.randomUUID(),
      userId,
      tenantId,
      channels: ALL_CHANNELS.map((channel) => ({
        channel,
        enabled: channel === 'in_app' || channel === 'email', // in_app + email enabled by default
      })),
      quietHours: { ...DEFAULT_QUIET_HOURS },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    preferencesStore.set(userId, defaults);
    return { ...defaults };
  }

  // ─── Update channel preference ────────────────────────────────────────────

  /**
   * Enable or disable a specific notification channel for a user.
   *
   * @param userId - User UUID
   * @param tenantId - Tenant UUID
   * @param channel - Notification channel to toggle
   * @param enabled - Whether the channel should be enabled
   * @returns Updated notification preferences
   */
  async updatePreference(
    userId: string,
    tenantId: string,
    channel: NotificationChannel,
    enabled: boolean,
  ): Promise<NotificationPreference> {
    const prefs = await this.getPreferences(userId, tenantId);

    const existingChannel = prefs.channels.find(
      (c) => c.channel === channel,
    );

    if (existingChannel) {
      existingChannel.enabled = enabled;
    } else {
      prefs.channels.push({ channel, enabled });
    }

    prefs.updated_at = new Date().toISOString();
    preferencesStore.set(userId, prefs);

    return { ...prefs };
  }

  // ─── Get quiet hours ──────────────────────────────────────────────────────

  /**
   * Get quiet hours configuration for a user.
   *
   * @param userId - User UUID
   * @param tenantId - Tenant UUID
   * @returns Quiet hours config
   */
  async getQuietHours(
    userId: string,
    tenantId: string,
  ): Promise<QuietHours> {
    const prefs = await this.getPreferences(userId, tenantId);
    return { ...prefs.quietHours };
  }

  // ─── Set quiet hours ──────────────────────────────────────────────────────

  /**
   * Configure quiet hours for a user.
   * During quiet hours, non-critical notifications are suppressed.
   *
   * @param userId - User UUID
   * @param tenantId - Tenant UUID
   * @param quietHours - Quiet hours configuration
   * @returns Updated notification preferences
   */
  async setQuietHours(
    userId: string,
    tenantId: string,
    quietHours: QuietHours,
  ): Promise<NotificationPreference> {
    const prefs = await this.getPreferences(userId, tenantId);
    prefs.quietHours = { ...quietHours };
    prefs.updated_at = new Date().toISOString();
    preferencesStore.set(userId, prefs);

    return { ...prefs };
  }

  // ─── Check if in quiet hours ──────────────────────────────────────────────

  /**
   * Check if the current time falls within quiet hours for a user.
   *
   * @param userId - User UUID
   * @param tenantId - Tenant UUID
   * @returns True if currently in quiet hours
   */
  async isInQuietHours(
    userId: string,
    tenantId: string,
  ): Promise<boolean> {
    const prefs = await this.getPreferences(userId, tenantId);

    if (!prefs.quietHours.enabled) {
      return false;
    }

    const { start, end } = prefs.quietHours;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH = 0, startM = 0] = start.split(':').map(Number);
    const [endH = 0, endM = 0] = end.split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // Same-day range (e.g., 00:00–08:00)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }

    // Overnight range (e.g., 22:00–08:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  // ─── Validation helpers ───────────────────────────────────────────────────

  /**
   * Validate update preference input.
   */
  validateUpdatePreference(data: unknown) {
    return updatePreferenceSchema.safeParse(data);
  }

  /**
   * Validate set quiet hours input.
   */
  validateSetQuietHours(data: unknown) {
    return setQuietHoursSchema.safeParse(data);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _prefsInstance: NotificationPreferencesService | null = null;

export function getNotificationPreferencesService(): NotificationPreferencesService {
  if (!_prefsInstance) {
    _prefsInstance = new NotificationPreferencesService();
  }
  return _prefsInstance;
}

export function resetNotificationPreferencesService(): void {
  _prefsInstance = null;
  preferencesStore.clear();
}
