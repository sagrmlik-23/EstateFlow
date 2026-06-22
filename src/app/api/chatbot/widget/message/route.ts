// ============================================================================
// EstateFlow CRM — Chatbot Widget Message API (Public)
// POST /api/chatbot/widget/message
// Phase 5 — AI Chatbot (AGENT-5-2-WEBSITE-WIDGET)
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { WidgetBotResponse, WidgetChatMessage } from '@/types/chatbot';

// ---------------------------------------------------------------------------
// Rate limiting — simple in-memory store
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 messages per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Session store — in-memory (replace with DB in production)
// ---------------------------------------------------------------------------

const sessionStore = new Map<
  string,
  { sessionId: string; tenantId: string; createdAt: number; messageCount: number }
>();

function createSession(tenantId: string): string {
  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  sessionStore.set(sessionId, {
    sessionId,
    tenantId,
    createdAt: Date.now(),
    messageCount: 0,
  });
  return sessionId;
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const messageSchema = z.object({
  sessionId: z.string().max(200).optional(),
  tenantId: z.string().min(1).max(100),
  message: z.string().min(1).max(2000),
  visitorId: z.string().max(200).optional(),
});

// ---------------------------------------------------------------------------
// Bot response engine
// ---------------------------------------------------------------------------

function generateBotResponse(message: string): WidgetBotResponse {
  const lower = message.toLowerCase();

  // Property search intent
  if (
    lower.includes('property') ||
    lower.includes('apartment') ||
    lower.includes('house') ||
    lower.includes('villa') ||
    lower.includes('buy') ||
    lower.includes('rent') ||
    lower.includes('flat')
  ) {
    return {
      message:
        'Great! Let me show you some available properties. We have several options that might interest you.',
      richCard: {
        type: 'property',
        data: {
          propertyId: 'prop-001',
          title: 'Luxury 3BHK Apartment in Whitefield',
          price: 8500000,
          location: 'Whitefield, Bangalore',
          type: 'apartment',
          imageUrl: '',
          bedrooms: 3,
          area: 1450,
          status: 'available',
        },
      },
      quickReplies: [
        'Show more options',
        'Price range?',
        'Schedule a visit',
        'Contact agent',
      ],
      suggestedActions: [
        {
          label: 'View All Properties',
          action: '/properties',
          type: 'url',
          data: { page: 'listing' },
        },
      ],
    };
  }

  // Contact / call intent
  if (
    lower.includes('contact') ||
    lower.includes('call') ||
    lower.includes('phone') ||
    lower.includes('reach') ||
    lower.includes('talk')
  ) {
    return {
      message:
        'You can reach our team directly:\n\n📞 **Phone:** +91 1800-123-4567\n📧 **Email:** support@estateflowcrm.com\n\nWould you like me to schedule a callback?',
      quickReplies: ['Schedule callback', 'Send me details', 'Back to menu'],
      suggestedActions: [
        {
          label: 'Call Now',
          action: '+9118001234567',
          type: 'phone',
        },
      ],
    };
  }

  // Schedule / visit intent
  if (
    lower.includes('schedule') ||
    lower.includes('visit') ||
    lower.includes('appointment') ||
    lower.includes('meeting') ||
    lower.includes('tour')
  ) {
    return {
      message:
        'I\'d be happy to schedule a site visit for you! 🏠\n\nPlease let me know:\n1. Which property are you interested in?\n2. Preferred date and time\n3. Any specific requirements',
      quickReplies: [
        'This weekend',
        'Next week',
        'Today if possible',
      ],
    };
  }

  // Price / budget intent
  if (
    lower.includes('price') ||
    lower.includes('budget') ||
    lower.includes('cost') ||
    lower.includes('afford') ||
    lower.includes('emi')
  ) {
    return {
      message:
        'Our properties range from **₹25 Lakhs** to **₹5 Crore+**. What\'s your budget range? I can find the best options for you!',
      quickReplies: [
        'Under ₹50 Lakhs',
        '₹50L - ₹1 Cr',
        '₹1 Cr - ₹2 Cr',
        'Above ₹2 Cr',
      ],
    };
  }

  // Greeting
  if (
    lower.includes('hi') ||
    lower.includes('hello') ||
    lower.includes('hey') ||
    lower.includes('good morning') ||
    lower.includes('good evening')
  ) {
    return {
      message:
        'Hello! 👋 Welcome to **EstateFlow**. How can I assist you today?\n\nHere are some things I can help with:\n• 🔍 Find properties\n• 💰 Check prices\n• 📅 Schedule visits\n• 📞 Connect with an agent',
      quickReplies: [
        'Show me properties',
        'I want to buy',
        'I want to rent',
        'Contact me',
      ],
    };
  }

  // Default / fallback
  return {
    message:
      'Thanks for your message! I\'m here to help you find the perfect property. 😊\n\nCould you please tell me more about what you\'re looking for? For example:\n• Type of property (Apartment, Villa, Plot)\n• Budget range\n• Location preference\n• Purpose (Buy/Rent)',
    quickReplies: [
      'I want to buy',
      'I want to rent',
      'Show me options',
      'Talk to an agent',
    ],
  };
}

// ---------------------------------------------------------------------------
// POST — Send message from widget
// Public endpoint — rate limited, no auth required
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // Rate limiting by IP
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': '60',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }

    // Parse body
    const body = await request.json();
    const parsed = messageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { sessionId: existingSessionId, tenantId, message } = parsed.data;

    // Create or reuse session
    let sessionId = existingSessionId;
    if (!sessionId || !sessionStore.has(sessionId)) {
      sessionId = createSession(tenantId);
    }

    // Get session
    const session = sessionStore.get(sessionId)!;
    session.messageCount++;

    // Generate bot response
    const botResponse = generateBotResponse(message);

    // Build response
    const response = {
      sessionId,
      response: botResponse,
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Error processing widget message:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    },
  );
}
