'use client';

// ============================================================================
// EstateFlow CRM — Notification Settings Page
// Agent-4-6-Notification-Preferences v1.0.0
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Bell,
  BellRing,
  BellOff,
  Mail,
  Smartphone,
  MessageSquare,
  Globe,
  Moon,
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Volume2,
  Send,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

import type {
  NotificationChannel,
  NotificationPreference,
  QuietHours,
} from '@/lib/notification';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelInfo {
  channel: NotificationChannel;
  label: string;
  description: string;
  icon: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Channel Definitions
// ---------------------------------------------------------------------------

const CHANNELS: ChannelInfo[] = [
  {
    channel: 'in_app',
    label: 'In-App',
    description: 'Notifications inside the application',
    icon: <Bell className="h-5 w-5" />,
  },
  {
    channel: 'email',
    label: 'Email',
    description: 'Notifications sent to your email address',
    icon: <Mail className="h-5 w-5" />,
  },
  {
    channel: 'whatsapp',
    label: 'WhatsApp',
    description: 'Notifications via WhatsApp Business',
    icon: <MessageSquare className="h-5 w-5" />,
  },
  {
    channel: 'sms',
    label: 'SMS',
    description: 'Text message notifications',
    icon: <Smartphone className="h-5 w-5" />,
  },
  {
    channel: 'push',
    label: 'Push',
    description: 'Browser push notifications (PWA)',
    icon: <Globe className="h-5 w-5" />,
  },
];

// ---------------------------------------------------------------------------
// Channel Toggle Component
// ---------------------------------------------------------------------------

function ChannelToggle({
  channel,
  enabled,
  onToggle,
  loading,
}: {
  channel: ChannelInfo;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            enabled
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {channel.icon}
        </div>
        <div>
          <Label
            htmlFor={`channel-${channel.channel}`}
            className="text-sm font-medium cursor-pointer"
          >
            {channel.label}
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {channel.description}
          </p>
        </div>
      </div>
      <Switch
        id={`channel-${channel.channel}`}
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={loading}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quiet Hours Component
// ---------------------------------------------------------------------------

function QuietHoursCard({
  quietHours,
  onUpdate,
  loading,
}: {
  quietHours: QuietHours;
  onUpdate: (qh: QuietHours) => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Moon className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Quiet Hours</p>
            <p className="text-xs text-muted-foreground">
              Suppress non-critical notifications during specific hours
            </p>
          </div>
        </div>
        <Switch
          id="quiet-hours-toggle"
          checked={quietHours.enabled}
          onCheckedChange={(checked) =>
            onUpdate({ ...quietHours, enabled: checked })
          }
          disabled={loading}
        />
      </div>

      {quietHours.enabled && (
        <div className="grid grid-cols-2 gap-4 pl-7">
          <div className="space-y-2">
            <Label htmlFor="quiet-start" className="text-xs">
              Start Time
            </Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="quiet-start"
                type="time"
                value={quietHours.start}
                onChange={(e) =>
                  onUpdate({ ...quietHours, start: e.target.value })
                }
                className="pl-10"
                disabled={loading}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quiet-end" className="text-xs">
              End Time
            </Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="quiet-end"
                type="time"
                value={quietHours.end}
                onChange={(e) =>
                  onUpdate({ ...quietHours, end: e.target.value })
                }
                className="pl-10"
                disabled={loading}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function NotificationSettingsPage() {
  const params = useParams();
  const tenant = params.tenant as string;

  const [preferences, setPreferences] = useState<NotificationPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // channel being saved
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // ── Fetch preferences ────────────────────────────────────────────────────

  const fetchPreferences = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/notifications/preferences', {
        headers: {
          'x-user-id': 'current',
          'x-tenant-id': tenant,
        },
      });
      const json = await res.json();
      if (json.success) {
        setPreferences(json.data);
      } else {
        toast({
          title: 'Error',
          description: json.error || 'Failed to load preferences',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('Failed to fetch preferences:', err);
      toast({
        title: 'Error',
        description: 'Failed to load notification preferences',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    fetchPreferences();

    // Check if push is supported
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
      checkPushSubscription();
    }
  }, [fetchPreferences]);

  // ── Check existing push subscription ─────────────────────────────────────

  const checkPushSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setPushSubscribed(!!subscription);
    } catch {
      setPushSubscribed(false);
    }
  };

  // ── Toggle channel ───────────────────────────────────────────────────────

  const handleToggleChannel = async (
    channel: NotificationChannel,
    enabled: boolean,
  ) => {
    try {
      setSaving(channel);
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'current',
          'x-tenant-id': tenant,
        },
        body: JSON.stringify({ channel, enabled }),
      });
      const json = await res.json();
      if (json.success) {
        setPreferences(json.data);
        toast({
          title: `${channel.charAt(0).toUpperCase() + channel.slice(1)} ${enabled ? 'enabled' : 'disabled'}`,
          description: 'Notification preference updated',
          variant: 'default',
        });
      } else {
        toast({
          title: 'Error',
          description: json.error || 'Failed to update preference',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('Failed to update preference:', err);
      toast({
        title: 'Error',
        description: 'Failed to update notification preference',
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };

  // ── Update quiet hours ───────────────────────────────────────────────────

  const handleQuietHoursUpdate = async (quietHours: QuietHours) => {
    try {
      setSaving('quiet_hours');
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'current',
          'x-tenant-id': tenant,
        },
        body: JSON.stringify({ quietHours }),
      });
      const json = await res.json();
      if (json.success) {
        setPreferences(json.data);
        toast({
          title: 'Quiet hours updated',
          description: quietHours.enabled
            ? `Notifications will be suppressed from ${quietHours.start} to ${quietHours.end}`
            : 'Quiet hours disabled',
          variant: 'default',
        });
      } else {
        toast({
          title: 'Error',
          description: json.error || 'Failed to update quiet hours',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('Failed to update quiet hours:', err);
      toast({
        title: 'Error',
        description: 'Failed to update quiet hours',
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };

  // ── Toggle push subscription ─────────────────────────────────────────────

  const handlePushToggle = async () => {
    if (pushSubscribed) {
      // Unsubscribe
      try {
        setPushLoading(true);
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
          await fetch('/api/notifications/subscribe', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': 'current',
              'x-tenant-id': tenant,
            },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
        }
        setPushSubscribed(false);
        toast({
          title: 'Unsubscribed',
          description: 'Push notifications disabled',
        });
      } catch (err) {
        console.error('Failed to unsubscribe:', err);
        toast({
          title: 'Error',
          description: 'Failed to unsubscribe from push notifications',
          variant: 'destructive',
        });
      } finally {
        setPushLoading(false);
      }
    } else {
      // Subscribe
      try {
        setPushLoading(true);
        const registration = await navigator.serviceWorker.register('/sw.js');
        const existingSub = await registration.pushManager.getSubscription();
        if (existingSub) {
          await existingSub.unsubscribe();
        }

        // Get VAPID public key from server
        const vapidRes = await fetch('/api/notifications/vapid-public-key');
        const vapidJson = await vapidRes.json();
        const vapidPublicKey = vapidJson.publicKey;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
        });

        // Send subscription to server
        const res = await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': 'current',
            'x-tenant-id': tenant,
          },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            keys: {
              p256dh: btoa(
                String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))
              ),
              auth: btoa(
                String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))
              ),
            },
            userAgent: navigator.userAgent,
          }),
        });

        const json = await res.json();
        if (json.success) {
          setPushSubscribed(true);
          toast({
            title: 'Subscribed',
            description: 'Push notifications enabled',
          });
        } else {
          toast({
            title: 'Error',
            description: json.error || 'Failed to subscribe',
            variant: 'destructive',
          });
        }
      } catch (err) {
        console.error('Failed to subscribe:', err);
        toast({
          title: 'Error',
          description: 'Failed to enable push notifications',
          variant: 'destructive',
        });
      } finally {
        setPushLoading(false);
      }
    }
  };

  // ── Test notification ────────────────────────────────────────────────────

  const handleTestNotification = () => {
    if (!pushSupported || !pushSubscribed) {
      toast({
        title: 'Push not enabled',
        description: 'Enable push notifications to send a test',
        variant: 'default',
      });
      return;
    }

    // Request notification permission and show a test
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Test Notification', {
        body: 'This is a test notification from EstateFlow CRM!',
        icon: '/icon-192.png',
      });
      toast({
        title: 'Test sent',
        description: 'Check your notifications',
      });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new Notification('Test Notification', {
            body: 'This is a test notification from EstateFlow CRM!',
            icon: '/icon-192.png',
          });
        }
      });
    }
  };

  // ── Get channel state ────────────────────────────────────────────────────

  const getChannelEnabled = (channel: NotificationChannel): boolean => {
    return preferences?.channels.find((c) => c.channel === channel)?.enabled ?? false;
  };

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading preferences...</p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BellRing className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Notification Settings</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Choose how you want to receive notifications and when.
        </p>
      </div>

      {/* Notification Channels */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Channels
          </CardTitle>
          <CardDescription>
            Toggle notification delivery methods on or off
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {CHANNELS.map((channel) => (
              <ChannelToggle
                key={channel.channel}
                channel={channel}
                enabled={getChannelEnabled(channel.channel)}
                onToggle={(enabled) =>
                  handleToggleChannel(channel.channel, enabled)
                }
                loading={saving === channel.channel}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Push Notification Setup */}
      {pushSupported && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Push Notification (PWA)
            </CardTitle>
            <CardDescription>
              Browser-based push notifications even when the app is closed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    pushSubscribed
                      ? 'bg-green-100 text-green-600'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {pushSubscribed ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <AlertCircle className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {pushSubscribed ? 'Push Notifications Active' : 'Not Subscribed'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {pushSubscribed
                      ? 'You will receive push notifications'
                      : 'Click to enable push notifications'}
                  </p>
                </div>
              </div>
              <Switch
                id="push-subscription"
                checked={pushSubscribed}
                onCheckedChange={handlePushToggle}
                disabled={pushLoading}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quiet Hours */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Moon className="h-5 w-5" />
            Quiet Hours
          </CardTitle>
          <CardDescription>
            Set a time range when non-critical notifications are suppressed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {preferences && (
            <QuietHoursCard
              quietHours={preferences.quietHours}
              onUpdate={handleQuietHoursUpdate}
              loading={saving === 'quiet_hours'}
            />
          )}
        </CardContent>
      </Card>

      {/* Test Notification */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Test Notification
          </CardTitle>
          <CardDescription>
            Send a test notification to verify your setup
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={handleTestNotification}
              className="flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              Send Test Notification
            </Button>
            <p className="text-xs text-muted-foreground">
              {pushSupported && pushSubscribed
                ? 'A test notification will appear on your device'
                : 'Enable push notifications to test'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Footer info */}
      <p className="text-xs text-muted-foreground text-center">
        Notification preferences are saved in real-time. Changes apply immediately.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility: Convert URL-safe base64 to Uint8Array
// ---------------------------------------------------------------------------

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
