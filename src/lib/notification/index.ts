// ============================================================================
// EstateFlow CRM — Notification Module Barrel Export
// Agent-4-6-Notification-Preferences v1.0.0
// ============================================================================

export {
  NotificationPreferencesService,
  getNotificationPreferencesService,
  resetNotificationPreferencesService,
} from './preferences';

export type {
  NotificationChannel,
  QuietHours,
  ChannelPreference,
  NotificationPreference,
} from './preferences';

export {
  ALL_CHANNELS,
  DEFAULT_QUIET_HOURS,
} from './preferences';

export {
  PushNotificationService,
  getPushNotificationService,
  resetPushNotificationService,
  getVapidKeys,
} from './pwaPush';

export type {
  PushSubscriptionRecord,
  PushNotificationPayload,
} from './pwaPush';
