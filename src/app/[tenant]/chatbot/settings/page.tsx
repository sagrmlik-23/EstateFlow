'use client';

// ============================================================================
// EstateFlow CRM — Chatbot Widget Settings Page
// /[tenant]/chatbot/settings
// Phase 5 — AI Chatbot (AGENT-5-2-WEBSITE-WIDGET)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Save,
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCw,
  Settings,
  Smartphone,
  Monitor,
  Code,
  Palette,
  MessageSquare,
  Bot,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import ChatWidget from '@/components/chatbot/ChatWidget';
import {
  generateEmbedCode,
  validateWidgetConfig,
} from '@/lib/chatbot/widgetConfig';
import type {
  WidgetConfig,
  WidgetConfigInput,
  EmbedScriptResult,
} from '@/types/chatbot';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: Omit<WidgetConfig, 'tenantId'> = {
  botName: 'EstateFlow Assistant',
  themeColor: '#2563eb',
  welcomeMessage: 'Hi there! 👋 How can I help you find your dream property?',
  position: 'right',
  icon: 'chat',
  allowedPages: ['*'],
  enabled: true,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ChatbotSettingsPage() {
  const params = useParams();
  const tenant = (params?.tenant as string) ?? 'demo';

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  const [config, setConfig] = useState<WidgetConfig>({
    tenantId: tenant,
    ...DEFAULT_CONFIG,
  });
  const [embedResult, setEmbedResult] = useState<EmbedScriptResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // -----------------------------------------------------------------------
  // Load config
  // -----------------------------------------------------------------------

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch(`/api/chatbot/widget-config?tenantId=${tenant}`);
        if (res.ok) {
          const data = await res.json();
          setConfig((prev) => ({ ...prev, ...data }));
        }
      } catch {
        // Use defaults
      } finally {
        setIsLoading(false);
      }
    }
    loadConfig();
  }, [tenant]);

  // -----------------------------------------------------------------------
  // Generate embed code whenever config changes
  // -----------------------------------------------------------------------

  useEffect(() => {
    const result = generateEmbedCode({
      tenantId: tenant,
      botName: config.botName,
      themeColor: config.themeColor,
      welcomeMessage: config.welcomeMessage,
      position: config.position,
      icon: config.icon,
      baseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
    setEmbedResult(result);
  }, [tenant, config.botName, config.themeColor, config.welcomeMessage, config.position, config.icon]);

  // -----------------------------------------------------------------------
  // Validate
  // -----------------------------------------------------------------------

  useEffect(() => {
    const validation = validateWidgetConfig(config);
    setErrors(validation.errors);
  }, [config]);

  // -----------------------------------------------------------------------
  // Save
  // -----------------------------------------------------------------------

  const handleSave = useCallback(async () => {
    const validation = validateWidgetConfig(config);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const res = await fetch(`/api/chatbot/widget-config?tenantId=${tenant}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botName: config.botName,
          themeColor: config.themeColor,
          welcomeMessage: config.welcomeMessage,
          position: config.position,
          icon: config.icon,
          allowedPages: config.allowedPages,
          enabled: config.enabled,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to save: ${res.status}`);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setIsSaving(false);
    }
  }, [config, tenant]);

  // -----------------------------------------------------------------------
  // Copy to clipboard
  // -----------------------------------------------------------------------

  const handleCopy = useCallback(async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Update config helper
  // -----------------------------------------------------------------------

  const updateConfig = useCallback(
    (updates: Partial<WidgetConfigInput>) => {
      setConfig((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Preview toggle
  // -----------------------------------------------------------------------

  const togglePreview = () => {
    setPreviewVisible(!previewVisible);
  };

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading widget settings...</p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="container max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chatbot Widget</h1>
          <p className="text-muted-foreground mt-1">
            Customize your AI chatbot widget and get the embed code for your website.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={togglePreview}
            className="gap-2"
          >
            {previewVisible ? (
              <>
                <EyeOff className="h-4 w-4" />
                Hide Preview
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Preview Widget
              </>
            )}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || errors.length > 0}
            className="gap-2"
          >
            {isSaving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Save feedback */}
      {saveSuccess && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          Widget configuration saved successfully! 🎉
        </div>
      )}
      {saveError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          Error: {saveError}
        </div>
      )}

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-300">
          <p className="font-medium mb-1">Please fix the following:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Settings panels */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="appearance" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="appearance" className="gap-2">
                <Palette className="h-4 w-4" />
                Appearance
              </TabsTrigger>
              <TabsTrigger value="behavior" className="gap-2">
                <Settings className="h-4 w-4" />
                Behavior
              </TabsTrigger>
              <TabsTrigger value="embed" className="gap-2">
                <Code className="h-4 w-4" />
                Embed Code
              </TabsTrigger>
            </TabsList>

            {/* ================================================================ */}
            {/* TAB: Appearance */}
            {/* ================================================================ */}
            <TabsContent value="appearance" className="space-y-6 pt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Bot Identity</CardTitle>
                  <CardDescription>
                    Configure how your chatbot looks and identifies itself.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Bot Name */}
                  <div className="space-y-2">
                    <Label htmlFor="botName">Bot Name</Label>
                    <div className="relative">
                      <Bot className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="botName"
                        value={config.botName}
                        onChange={(e) => updateConfig({ botName: e.target.value })}
                        className="pl-9"
                        placeholder="EstateFlow Assistant"
                        maxLength={100}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Shown in the chat header. Max 100 characters.
                    </p>
                  </div>

                  {/* Bot Icon */}
                  <div className="space-y-2">
                    <Label>Bot Icon</Label>
                    <Select
                      value={config.icon}
                      onValueChange={(value: WidgetConfig['icon']) =>
                        updateConfig({ icon: value })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select icon" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chat">
                          <span className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Chat Bubble
                          </span>
                        </SelectItem>
                        <SelectItem value="bubble">
                          <span className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Speech Bubble
                          </span>
                        </SelectItem>
                        <SelectItem value="robot">
                          <span className="flex items-center gap-2">
                            <Bot className="h-4 w-4" />
                            Robot
                          </span>
                        </SelectItem>
                        <SelectItem value="message">
                          <span className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4" />
                            Sparkles
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Theme Color */}
                  <div className="space-y-2">
                    <Label htmlFor="themeColor">Theme Color</Label>
                    <div className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded-lg border shadow-sm shrink-0"
                        style={{ backgroundColor: config.themeColor }}
                      />
                      <Input
                        id="themeColor"
                        value={config.themeColor}
                        onChange={(e) => updateConfig({ themeColor: e.target.value })}
                        className="font-mono"
                        placeholder="#2563eb"
                        maxLength={7}
                      />
                      <input
                        type="color"
                        value={config.themeColor}
                        onChange={(e) => updateConfig({ themeColor: e.target.value })}
                        className="h-10 w-10 rounded-lg border cursor-pointer"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enter a hex color code or use the color picker.
                    </p>
                  </div>

                  {/* Welcome Message */}
                  <div className="space-y-2">
                    <Label htmlFor="welcomeMessage">Welcome Message</Label>
                    <Textarea
                      id="welcomeMessage"
                      value={config.welcomeMessage}
                      onChange={(e) => updateConfig({ welcomeMessage: e.target.value })}
                      placeholder="Hi there! 👋 How can I help you?"
                      className="min-h-[80px]"
                      maxLength={500}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>First message users see when they open the chat.</span>
                      <span>{config.welcomeMessage.length}/500</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ================================================================ */}
            {/* TAB: Behavior */}
            {/* ================================================================ */}
            <TabsContent value="behavior" className="space-y-6 pt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Widget Behavior</CardTitle>
                  <CardDescription>
                    Configure widget placement, permissions, and behavior.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Position */}
                  <div className="space-y-2">
                    <Label>Widget Position</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => updateConfig({ position: 'right' })}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all',
                          config.position === 'right'
                            ? 'border-primary bg-primary/5'
                            : 'border-muted hover:border-border',
                        )}
                      >
                        <Monitor className="h-6 w-6" />
                        <span className="text-sm font-medium">Bottom Right</span>
                      </button>
                      <button
                        onClick={() => updateConfig({ position: 'left' })}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all',
                          config.position === 'left'
                            ? 'border-primary bg-primary/5'
                            : 'border-muted hover:border-border',
                        )}
                      >
                        <Smartphone className="h-6 w-6" />
                        <span className="text-sm font-medium">Bottom Left</span>
                      </button>
                    </div>
                  </div>

                  {/* Enabled */}
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <Label className="text-base font-medium">Widget Enabled</Label>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Disable to hide the widget from your website.
                      </p>
                    </div>
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={(checked) =>
                        updateConfig({ enabled: checked })
                      }
                    />
                  </div>

                  {/* Allowed Pages */}
                  <div className="space-y-2">
                    <Label>Allowed Pages</Label>
                    <p className="text-xs text-muted-foreground">
                      Restrict which pages the widget appears on. Use * for all pages,
                      or enter comma-separated paths (e.g., /, /properties, /contact).
                    </p>
                    <Input
                      value={config.allowedPages.join(', ')}
                      onChange={(e) =>
                        updateConfig({
                          allowedPages: e.target.value
                            .split(',')
                            .map((p) => p.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="* (all pages)"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ================================================================ */}
            {/* TAB: Embed Code */}
            {/* ================================================================ */}
            <TabsContent value="embed" className="space-y-6 pt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Embed Code</CardTitle>
                  <CardDescription>
                    Copy and paste this code into your website to add the chatbot widget.
                    Two options are available.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Script Tag */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">
                        Option 1: JavaScript Snippet
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleCopy(embedResult?.scriptTag ?? '', 'script')
                        }
                        className="gap-1.5 h-8"
                      >
                        {copiedField === 'script' ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Recommended — loads the widget asynchronously.
                    </p>
                    <pre className="relative rounded-lg bg-muted p-4 text-xs overflow-x-auto max-h-[200px]">
                      <code>{embedResult?.scriptTag ?? 'Generating...'}</code>
                    </pre>
                  </div>

                  <Separator />

                  {/* Iframe + Button */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">
                        Option 2: HTML + Iframe
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleCopy(embedResult?.iframeCode ?? '', 'iframe')
                        }
                        className="gap-1.5 h-8"
                      >
                        {copiedField === 'iframe' ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Full HTML embed with iframe and toggle button.
                    </p>
                    <pre className="relative rounded-lg bg-muted p-4 text-xs overflow-x-auto max-h-[250px]">
                      <code>{embedResult?.iframeCode ?? 'Generating...'}</code>
                    </pre>
                  </div>

                  <Separator />

                  {/* Instructions */}
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
                    <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
                      📋 How to embed
                    </h4>
                    <ol className="text-xs text-blue-600 dark:text-blue-400 space-y-1.5 list-decimal list-inside">
                      <li>Copy one of the embed code options above.</li>
                      <li>Paste it just before the closing <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">&lt;/body&gt;</code> tag on your website.</li>
                      <li>Save and publish your website changes.</li>
                      <li>The chatbot widget will appear on your site automatically.</li>
                    </ol>
                  </div>

                  {/* Test Widget */}
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <Label className="text-base font-medium">Test Your Widget</Label>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Open a preview of how the widget will look on your website.
                      </p>
                    </div>
                    <Button variant="outline" onClick={togglePreview} className="gap-2">
                      <Eye className="h-4 w-4" />
                      {previewVisible ? 'Hide Preview' : 'Show Preview'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Preview panel */}
        <div className="lg:col-span-1">
          <div className="sticky top-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Live Preview</CardTitle>
                <CardDescription>
                  This is how your widget will appear.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative h-[500px] rounded-lg border bg-gradient-to-br from-muted/50 to-muted overflow-hidden">
                  {/* Simulated website content */}
                  <div className="p-4 space-y-3">
                    <div className="h-4 w-3/4 rounded bg-muted-foreground/10" />
                    <div className="h-3 w-1/2 rounded bg-muted-foreground/10" />
                    <div className="h-3 w-2/3 rounded bg-muted-foreground/10" />
                    <div className="h-20 rounded-lg bg-muted-foreground/5" />
                    <div className="h-3 w-4/5 rounded bg-muted-foreground/10" />
                    <div className="h-3 w-3/5 rounded bg-muted-foreground/10" />
                  </div>

                  {/* The actual widget preview */}
                  {config.enabled && (
                    <ChatWidget
                      tenantId={tenant}
                      botName={config.botName}
                      themeColor={config.themeColor}
                      welcomeMessage={config.welcomeMessage}
                      position={config.position}
                      icon={config.icon}
                      className="!relative !bottom-0 !right-0 !left-auto !top-auto"
                    />
                  )}

                  {!config.enabled && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <div className="text-center text-muted-foreground">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm font-medium">Widget Disabled</p>
                        <p className="text-xs">Enable it in the Behavior tab</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    <span
                      className={cn(
                        'font-medium',
                        config.enabled ? 'text-emerald-600' : 'text-muted-foreground',
                      )}
                    >
                      {config.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Bot Name</span>
                    <span className="font-medium">{config.botName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Position</span>
                    <span className="font-medium capitalize">
                      Bottom {config.position}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Theme</span>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-3 w-3 rounded-full border"
                        style={{ backgroundColor: config.themeColor }}
                      />
                      <span className="font-medium font-mono text-[10px]">
                        {config.themeColor}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
