// ============================================================================
// EstateFlow CRM — Chatbot Widget Config API (Public)
// GET /api/chatbot/widget-config?tenantId=xxx
// Phase 5 — AI Chatbot (AGENT-5-2-WEBSITE-WIDGET)
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getWidgetConfig, setWidgetConfig, validateWidgetConfig as validateConfig } from '@/lib/chatbot/widgetConfig';
import type { WidgetConfigResponse, WidgetConfig } from '@/types/chatbot';

// ---------------------------------------------------------------------------
// Zod schema for PUT body
// ---------------------------------------------------------------------------

const putSchema = z.object({
  botName: z.string().min(2).max(100).optional(),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  welcomeMessage: z.string().max(500).optional(),
  position: z.enum(['right', 'left']).optional(),
  icon: z.enum(['chat', 'bubble', 'robot', 'message']).optional(),
  allowedPages: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// GET — Fetch widget configuration for a tenant
// Public endpoint — no auth required (used by embedded script on client websites)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Missing tenantId query parameter', exists: false },
        { status: 400 },
      );
    }

    // Sanitize tenantId
    if (tenantId.length < 2 || tenantId.length > 100) {
      return NextResponse.json(
        { error: 'Invalid tenantId', exists: false },
        { status: 400 },
      );
    }

    const config = await getWidgetConfig(tenantId);

    if (!config) {
      // Return 404 with exists=false so the embed script knows it's missing
      return NextResponse.json(
        { exists: false, error: 'Widget not configured for this tenant' },
        { status: 404 },
      );
    }

    if (!config.enabled) {
      return NextResponse.json(
        { ...config, exists: true, enabled: false },
        { status: 200 },
      );
    }

    const response: WidgetConfigResponse = {
      ...config,
      exists: true,
    };

    // Allow CORS for embedding on external websites
    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Error fetching widget config:', error);
    return NextResponse.json(
      { error: 'Internal server error', exists: false },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// OPTIONS — CORS preflight
// ---------------------------------------------------------------------------

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    },
  );
}

// ---------------------------------------------------------------------------
// PUT — Save/Update widget configuration for a tenant
// Authenticated endpoint — should be protected in production
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Missing tenantId query parameter' },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = putSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid configuration',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    // Additional validation
    const validation = validateConfig(parsed.data as Partial<WidgetConfig>);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 },
      );
    }

    const config = setWidgetConfig(tenantId, parsed.data);

    return NextResponse.json(
      { ...config, exists: true },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      },
    );
  } catch (error) {
    console.error('Error saving widget config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
