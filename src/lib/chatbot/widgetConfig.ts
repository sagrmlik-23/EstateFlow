// ============================================================================
// EstateFlow CRM — Chatbot Widget Configuration Library
// Phase 5 — AI Chatbot (AGENT-5-2-WEBSITE-WIDGET)
// ============================================================================

import type {
  WidgetConfig,
  EmbedScriptConfig,
  EmbedScriptResult,
} from '@/types/chatbot';

// ---------------------------------------------------------------------------
// Default Widget Configuration
// ---------------------------------------------------------------------------

export const DEFAULT_WIDGET_CONFIG: Omit<WidgetConfig, 'tenantId'> = {
  botName: 'EstateFlow Assistant',
  themeColor: '#2563eb',
  welcomeMessage: 'Hi there! 👋 How can I help you find your dream property?',
  position: 'right',
  icon: 'chat',
  allowedPages: ['*'],
  enabled: true,
};

// ---------------------------------------------------------------------------
// Simulated widget config storage (replace with DB in production)
// ---------------------------------------------------------------------------

const widgetConfigStore = new Map<string, WidgetConfig>();

export function setWidgetConfig(
  tenantId: string,
  config: Partial<Omit<WidgetConfig, 'tenantId'>>,
): WidgetConfig {
  const existing = widgetConfigStore.get(tenantId);
  const updated: WidgetConfig = {
    ...DEFAULT_WIDGET_CONFIG,
    ...existing,
    ...config,
    tenantId,
  };
  widgetConfigStore.set(tenantId, updated);
  return updated;
}

export function getWidgetConfigSync(tenantId: string): WidgetConfig | null {
  return widgetConfigStore.get(tenantId) ?? null;
}

// ---------------------------------------------------------------------------
// fetchWidgetConfig — fetches widget config from the public API endpoint
// Used by the embedded script / client-side widget to load config
// ---------------------------------------------------------------------------

export async function fetchWidgetConfig(
  tenantId: string,
  baseUrl?: string,
): Promise<WidgetConfig | null> {
  const origin = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
  try {
    const res = await fetch(
      `${origin}/api/chatbot/widget-config?tenantId=${encodeURIComponent(tenantId)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data as WidgetConfig;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// getWidgetConfig — async version for server-side usage
// ---------------------------------------------------------------------------

export async function getWidgetConfig(tenantId: string): Promise<WidgetConfig | null> {
  // In production, replace with DB lookup
  return getWidgetConfigSync(tenantId);
}

// ---------------------------------------------------------------------------
// generateEmbedScript — generates a <script> tag for embedding
// The embedded script loads the chatbot widget on the client website
// ---------------------------------------------------------------------------

export function generateEmbedScript(config: EmbedScriptConfig): string {
  const baseUrl = config.baseUrl ?? 'https://app.estateflowcrm.com';
  const escapedConfig = encodeURIComponent(JSON.stringify(config));

  return `<script>
(function() {
  var widget = document.createElement('div');
  widget.id = 'estateflow-chat-widget';
  document.body.appendChild(widget);

  var script = document.createElement('script');
  script.src = '${baseUrl}/embed/chatbot.js';
  script.setAttribute('data-config', '${escapedConfig}');
  script.setAttribute('data-tenant', '${config.tenantId}');
  script.async = true;
  document.head.appendChild(script);
})();
</script>`;
}

// ---------------------------------------------------------------------------
// generateEmbedHTML — generates full embed HTML (iframe alternative)
// ---------------------------------------------------------------------------

export function generateEmbedHTML(config: EmbedScriptConfig): string {
  const baseUrl = config.baseUrl ?? 'https://app.estateflowcrm.com';

  return `<!-- EstateFlow Chatbot Widget -->
<div id="estateflow-chatbot-root"></div>
<iframe
  id="estateflow-chatbot-frame"
  src="${baseUrl}/embed/chatbot?tenantId=${encodeURIComponent(config.tenantId)}&themeColor=${encodeURIComponent(config.themeColor)}&botName=${encodeURIComponent(config.botName)}"
  style="position:fixed;bottom:20px;${config.position}:20px;width:380px;height:560px;border:none;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.18);z-index:999999;display:none;"
  title="${config.botName}"
></iframe>
<script>
(function() {
  var iframe = document.getElementById('estateflow-chatbot-frame');
  var btn = document.createElement('button');
  btn.id = 'estateflow-chatbot-btn';
  btn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  btn.style.cssText = 'position:fixed;bottom:20px;${config.position}:20px;width:60px;height:60px;border-radius:50%;background:${config.themeColor};border:none;cursor:pointer;z-index:999998;box-shadow:0 4px 16px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;';
  btn.setAttribute('aria-label', 'Open ${config.botName} chat');
  document.body.appendChild(btn);

  var open = false;
  btn.addEventListener('click', function() {
    open = !open;
    iframe.style.display = open ? 'block' : 'none';
    btn.style.display = open ? 'none' : 'flex';
  });
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'close-chatbot') {
      open = false;
      iframe.style.display = 'none';
      btn.style.display = 'flex';
    }
  });
})();
</script>
<!-- End EstateFlow Chatbot Widget -->`;
}

// ---------------------------------------------------------------------------
// generateEmbedCode — convenience function returning both script and HTML
// ---------------------------------------------------------------------------

export function generateEmbedCode(config: EmbedScriptConfig): EmbedScriptResult {
  const iframeCode = generateEmbedHTML(config);
  const scriptTag = generateEmbedScript(config);
  const htmlCode = iframeCode; // HTML embed is the iframe version

  return { scriptTag, htmlCode, iframeCode };
}

// ---------------------------------------------------------------------------
// validateWidgetConfig
// ---------------------------------------------------------------------------

export function validateWidgetConfig(
  config: Partial<WidgetConfig>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.botName !== undefined && (config.botName.length < 2 || config.botName.length > 100)) {
    errors.push('Bot name must be between 2 and 100 characters');
  }
  if (config.themeColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(config.themeColor)) {
    errors.push('Theme color must be a valid hex color (e.g., #2563eb)');
  }
  if (config.welcomeMessage !== undefined && config.welcomeMessage.length > 500) {
    errors.push('Welcome message must be 500 characters or less');
  }
  if (config.position !== undefined && !['right', 'left'].includes(config.position)) {
    errors.push('Position must be "right" or "left"');
  }

  return { valid: errors.length === 0, errors };
}
