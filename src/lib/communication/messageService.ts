// ============================================================================
// EstateFlow CRM — Message Service
// Phase 4 — Communication (AGENT-4-2-WHATSAPP-SMS)
// ============================================================================
//
// The MessageService coordinates WhatsApp (WATI) and SMS (MSG91) messaging.
// It handles channel preference logic, template formatting, and fallback
// between WhatsApp and SMS.
//
// Channel preference: WhatsApp preferred, SMS fallback.
// ============================================================================

import { DryRunMessageAdapter } from './dryRun';
import type {
  MessageChannel,
  MessageRecord,
  NotificationType,
  LeadNotificationData,
  PropertyShareData,
  AppointmentReminderData,
  FollowUpData,
} from '@/types/communication';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChannelPreference = 'whatsapp' | 'sms';

export interface SendMessageOptions {
  channel?: ChannelPreference;
  templateParams?: Record<string, string>;
  dltTemplateId?: string;
  unicode?: boolean;
  dryRun?: boolean;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  channel: MessageChannel;
  error?: string;
  dryRun: boolean;
}

export interface MessageServiceConfig {
  /** Default channel preference */
  defaultChannel?: ChannelPreference;
  /** Force SMS-only mode */
  smsOnly?: boolean;
  /** Force WhatsApp-only mode */
  whatsappOnly?: boolean;
  /** Enable dry-run mode (overrides adapter) */
  dryRunEnabled?: boolean;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const TEMPLATES: Record<string, { whatsapp: string; sms: string }> = {
  lead_notification: {
    whatsapp: 'lead_notification', // WATI template name
    sms: 'New lead: {name} - {source} - {budget}', // SMS text template
  },
  property_share: {
    whatsapp: 'property_share',
    sms: 'Check out {title} at {price} in {location}. {url}',
  },
  appointment_reminder: {
    whatsapp: 'appointment_reminder',
    sms: 'Reminder: Site visit for {property} on {datetime} at {location}',
  },
  follow_up: {
    whatsapp: 'follow_up',
    sms: "Hi {name}, it's been {days} days. Still interested in properties? Reply or call us.",
  },
};

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(price);
}

function formatTemplate(template: string, params: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

// ---------------------------------------------------------------------------
// MessageService
// ---------------------------------------------------------------------------

export class MessageService {
  private readonly adapter: DryRunMessageAdapter;
  private readonly config: MessageServiceConfig;

  constructor(
    adapter?: DryRunMessageAdapter,
    config: MessageServiceConfig = {},
  ) {
    this.adapter = adapter ?? DryRunMessageAdapter.fromEnv();
    this.config = config;
  }

  // -----------------------------------------------------------------------
  // sendMessage — Low-level send
  // -----------------------------------------------------------------------

  async sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions = {},
  ): Promise<SendMessageResult> {
    const channel = this.resolveChannel(options.channel);

    if (channel === 'whatsapp') {
      // For WhatsApp, use a template or send as text
      const result = await this.adapter.sendMessage(
        to,
        options.templateParams?.templateName ?? 'custom_message',
        options.templateParams,
      );
      return { ...result, channel: 'whatsapp', dryRun: result.dryRun ?? this.adapter.active };
    }

    // SMS path
    const result = await this.adapter.sendSMS(to, content, {
      unicode: options.unicode,
      dltTemplateId: options.dltTemplateId,
    });
    return {
      success: result.success,
      messageId: result.messageId,
      channel: 'sms',
      error: result.error,
      dryRun: result.dryRun ?? this.adapter.active,
    };
  }

  // -----------------------------------------------------------------------
  // sendLeadNotification — Notify agent about new lead
  // -----------------------------------------------------------------------

  async sendLeadNotification(
    lead: LeadNotificationData,
    type: NotificationType = 'lead_notification',
  ): Promise<SendMessageResult> {
    const phone = lead.phone;
    if (!phone) {
      return { success: false, channel: 'whatsapp', error: 'No phone number', dryRun: false };
    }

    const channel = this.resolveChannel();

    const template = TEMPLATES[type];
    if (!template) {
      return { success: false, channel: 'whatsapp', error: `Unknown notification type: ${type}`, dryRun: false };
    }

    if (channel === 'whatsapp') {
      const templateName = template.whatsapp;
      const result = await this.adapter.sendMessage(phone, templateName, {
        name: lead.fullName,
        source: lead.source ?? 'website',
        budget: lead.budgetRange ?? 'N/A',
        location: lead.preferredLocation ?? 'N/A',
        propertyType: lead.propertyType ?? 'N/A',
        templateName,
      });

      return {
        success: result.success,
        messageId: result.messageId,
        channel: 'whatsapp',
        error: result.error,
        dryRun: result.dryRun ?? this.adapter.active,
      };
    }

    // SMS fallback
    const smsTemplate = template.sms;
    const message = formatTemplate(smsTemplate, {
      name: lead.fullName,
      source: lead.source ?? 'website',
      budget: lead.budgetRange ?? 'N/A',
    });

    const result = await this.adapter.sendSMS(phone, message);
    return {
      success: result.success,
      messageId: result.messageId,
      channel: 'sms',
      error: result.error,
      dryRun: result.dryRun ?? this.adapter.active,
    };
  }

  // -----------------------------------------------------------------------
  // sendPropertyShare — Share property details
  // -----------------------------------------------------------------------

  async sendPropertyShare(
    lead: LeadNotificationData,
    property: PropertyShareData,
    channel?: ChannelPreference,
  ): Promise<SendMessageResult> {
    const phone = lead.phone;
    if (!phone) {
      return { success: false, channel: 'whatsapp', error: 'No phone number', dryRun: false };
    }

    const resolvedChannel = this.resolveChannel(channel);

    const template = TEMPLATES.property_share;
    if (!template) {
      return { success: false, channel: 'whatsapp', error: 'Property share template not found', dryRun: false };
    }

    if (resolvedChannel === 'whatsapp') {
      const templateName = template.whatsapp;
      const result = await this.adapter.sendMessage(phone, templateName, {
        title: property.title,
        price: formatPrice(property.price),
        location: property.location,
        bedrooms: property.bedrooms?.toString() ?? 'N/A',
        area: property.area?.toString() ?? 'N/A',
        templateName,
      });

      if (result.success && property.imageUrl) {
        // Also send the property image
        await this.adapter.sendImage(phone, property.imageUrl, property.title).catch(() => {});
      }

      return {
        success: result.success,
        messageId: result.messageId,
        channel: 'whatsapp',
        error: result.error,
        dryRun: result.dryRun ?? this.adapter.active,
      };
    }

    // SMS fallback
    const smsText = template.sms;
    const message = formatTemplate(smsText, {
      title: property.title,
      price: formatPrice(property.price),
      location: property.location,
      bedrooms: property.bedrooms?.toString() ?? 'N/A',
      area: property.area?.toString() ?? 'N/A',
      url: property.imageUrl ?? '',
    });

    const result = await this.adapter.sendSMS(phone, message);
    return {
      success: result.success,
      messageId: result.messageId,
      channel: 'sms',
      error: result.error,
      dryRun: result.dryRun ?? this.adapter.active,
    };
  }

  // -----------------------------------------------------------------------
  // sendAppointmentReminder — Send appointment reminder
  // -----------------------------------------------------------------------

  async sendAppointmentReminder(
    lead: LeadNotificationData,
    appointment: AppointmentReminderData,
  ): Promise<SendMessageResult> {
    const phone = lead.phone;
    if (!phone) {
      return { success: false, channel: 'whatsapp', error: 'No phone number', dryRun: false };
    }

    const channel = this.resolveChannel();

    const template = TEMPLATES.appointment_reminder;
    if (!template) {
      return { success: false, channel: 'whatsapp', error: 'Appointment reminder template not found', dryRun: false };
    }

    if (channel === 'whatsapp') {
      const templateName = template.whatsapp;
      const result = await this.adapter.sendMessage(phone, templateName, {
        name: appointment.leadName,
        property: appointment.propertyTitle,
        datetime: appointment.dateTime,
        location: appointment.location,
        notes: appointment.notes ?? '',
        templateName,
      });

      // Send location if available
      if (result.success) {
        await this.adapter.sendLocation(
          phone,
          0, // lat — would come from property
          0, // lng — would come from property
          appointment.location,
        ).catch(() => {});
      }

      return {
        success: result.success,
        messageId: result.messageId,
        channel: 'whatsapp',
        error: result.error,
        dryRun: result.dryRun ?? this.adapter.active,
      };
    }

    // SMS fallback
    const smsText = template.sms;
    const message = formatTemplate(smsText, {
      name: appointment.leadName,
      property: appointment.propertyTitle,
      datetime: appointment.dateTime,
      location: appointment.location,
    });

    const result = await this.adapter.sendSMS(phone, message);
    return {
      success: result.success,
      messageId: result.messageId,
      channel: 'sms',
      error: result.error,
      dryRun: result.dryRun ?? this.adapter.active,
    };
  }

  // -----------------------------------------------------------------------
  // sendFollowUp — Send follow-up message
  // -----------------------------------------------------------------------

  async sendFollowUp(
    lead: LeadNotificationData,
    days: number,
  ): Promise<SendMessageResult> {
    const phone = lead.phone;
    if (!phone) {
      return { success: false, channel: 'whatsapp', error: 'No phone number', dryRun: false };
    }

    const channel = this.resolveChannel();

    const template = TEMPLATES.follow_up;
    if (!template) {
      return { success: false, channel: 'whatsapp', error: 'Follow-up template not found', dryRun: false };
    }

    if (channel === 'whatsapp') {
      const templateName = template.whatsapp;
      const result = await this.adapter.sendMessage(phone, templateName, {
        name: lead.fullName,
        days: days.toString(),
        templateName,
      });

      return {
        success: result.success,
        messageId: result.messageId,
        channel: 'whatsapp',
        error: result.error,
        dryRun: result.dryRun ?? this.adapter.active,
      };
    }

    // SMS fallback
    const smsText = template.sms;
    const message = formatTemplate(smsText, {
      name: lead.fullName,
      days: days.toString(),
    });

    const result = await this.adapter.sendSMS(phone, message);
    return {
      success: result.success,
      messageId: result.messageId,
      channel: 'sms',
      error: result.error,
      dryRun: result.dryRun ?? this.adapter.active,
    };
  }

  // -----------------------------------------------------------------------
  // Resolve channel based on config + preference
  // -----------------------------------------------------------------------

  private resolveChannel(preferred?: ChannelPreference): ChannelPreference {
    if (this.config.smsOnly) return 'sms';
    if (this.config.whatsappOnly) return 'whatsapp';
    return preferred ?? this.config.defaultChannel ?? 'whatsapp';
  }

  // -----------------------------------------------------------------------
  // Send an OTP via SMS
  // -----------------------------------------------------------------------

  async sendOTP(
    to: string,
    otp: string,
    options?: { unicode?: boolean; expiryMinutes?: number },
  ): Promise<SendMessageResult> {
    const result = await this.adapter.sendOTP(to, otp, options);
    return {
      success: result.success,
      messageId: result.sessionId,
      channel: 'sms',
      error: result.error,
      dryRun: result.dryRun ?? this.adapter.active,
    };
  }

  // -----------------------------------------------------------------------
  // Verify an OTP
  // -----------------------------------------------------------------------

  async verifyOTP(
    sessionId: string,
    otp: string,
  ): Promise<{ success: boolean; error?: string }> {
    return await this.adapter.verifyOTP(sessionId, otp);
  }

  // -----------------------------------------------------------------------
  // Static factory
  // -----------------------------------------------------------------------

  static create(
    config?: MessageServiceConfig,
  ): MessageService {
    return new MessageService(DryRunMessageAdapter.fromEnv(), config);
  }
}
