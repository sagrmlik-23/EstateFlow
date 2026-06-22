// ============================================================================
// EstateFlow CRM — LLM Transcript Analysis
// Phase 3 — AI Voice Agent (AGENT-3-4-ANALYTICS-INSIGHTS)
// ============================================================================
//
// Provides LLM-powered transcript analysis using OpenRouter or Groq:
//   - analyzeTranscript   — Full sentiment, intent, and insight extraction
//   - extractKeyPhrases   — Location, budget, timeline phrase extraction
//   - detectObjections    — Categorize objections from transcript
//   - summarizeCall       — 2–3 line call summary
// ============================================================================

import type { TranscriptEntry } from '@/types/ai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export type TimelineLabel = 'immediate' | '3mo' | '6mo' | '1yr' | 'unsure';

export type NextAction =
  | 'site_visit'
  | 'follow_up'
  | 'send_details'
  | 'transfer';

export type ObjectionCategory =
  | 'price'
  | 'location'
  | 'size'
  | 'timing'
  | 'financing'
  | 'other';

export interface TranscriptAnalysis {
  sentiment: SentimentLabel;
  budget: number | null;
  budgetCurrency: string | null;
  timeline: TimelineLabel;
  propertyType: string | null;
  locationPreference: string | null;
  objections: ObjectionCategory[];
  interestLevel: number; // 0–100
  nextAction: NextAction;
  summary: string;
}

export interface KeyPhrases {
  locations: string[];
  budgetPhrases: string[];
  timelinePhrases: string[];
}

export interface ObjectionResult {
  categories: ObjectionCategory[];
  details: string[];
}

// ---------------------------------------------------------------------------
// LLM API call helper — tries OpenRouter first, then Groq
// ---------------------------------------------------------------------------

interface LLMRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  response_format?: { type: 'json_object' };
  max_tokens?: number;
  temperature?: number;
}

async function callLLM(
  prompt: string,
  systemPrompt: string,
  jsonMode: boolean = true,
): Promise<string> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ];

  // Try OpenRouter first
  if (openRouterKey) {
    try {
      const body: LLMRequest = {
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
        messages,
        max_tokens: 1024,
        temperature: 0.1,
      };
      if (jsonMode) body.response_format = { type: 'json_object' };

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openRouterKey}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'EstateFlow-CRM',
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          choices: Array<{ message: { content: string } }>;
        };
        return data.choices?.[0]?.message?.content || '';
      }

      console.warn('[transcriptAnalysis] OpenRouter returned', res.status, '- falling back to Groq');
    } catch (err) {
      console.warn('[transcriptAnalysis] OpenRouter error:', err);
    }
  }

  // Fallback to Groq
  if (groqKey) {
    try {
      const body: LLMRequest = {
        model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
        messages,
        max_tokens: 1024,
        temperature: 0.1,
      };
      if (jsonMode) body.response_format = { type: 'json_object' };

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          choices: Array<{ message: { content: string } }>;
        };
        return data.choices?.[0]?.message?.content || '';
      }

      console.error('[transcriptAnalysis] Groq returned', res.status);
      throw new Error(`Groq API error: ${res.status}`);
    } catch (err) {
      console.error('[transcriptAnalysis] Groq error:', err);
      throw new Error('LLM API unavailable for transcript analysis');
    }
  }

  throw new Error(
    'No LLM API key configured. Set OPENROUTER_API_KEY or GROQ_API_KEY.',
  );
}

// ---------------------------------------------------------------------------
// Helper: format transcript for LLM
// ---------------------------------------------------------------------------

function formatTranscript(
  transcript: string | TranscriptEntry[],
): string {
  if (typeof transcript === 'string') return transcript;

  return transcript
    .map((entry) => `[${entry.role.toUpperCase()}]: ${entry.text}`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// 1. analyzeTranscript — Full LLM analysis of a call transcript
// ---------------------------------------------------------------------------

const ANALYZE_SYSTEM_PROMPT = `You are an expert real estate call analyst. Analyze the following sales call transcript and return a JSON object with exactly these fields:

{
  "sentiment": "positive" | "neutral" | "negative",
  "budget": number | null,
  "budgetCurrency": string | null,
  "timeline": "immediate" | "3mo" | "6mo" | "1yr" | "unsure",
  "propertyType": string | null,
  "locationPreference": string | null,
  "objections": ["price" | "location" | "size" | "timing" | "financing" | "other"],
  "interestLevel": number (0-100),
  "nextAction": "site_visit" | "follow_up" | "send_details" | "transfer",
  "summary": string (2-3 sentences)
}

Rules:
- sentiment: overall tone of the conversation
- budget: numeric budget mentioned, or null if none mentioned
- timeline: when the lead intends to buy
- propertyType: what type of property they're looking for (apartment, villa, plot, etc.)
- locationPreference: which area/locality they prefer
- objections: list ALL objection categories raised
- interestLevel: 0 (completely disinterested) to 100 (ready to buy)
- nextAction: the best next step based on the conversation
- summary: 2-3 line concise summary of the call outcome`;

export async function analyzeTranscript(
  transcript: string | TranscriptEntry[],
): Promise<TranscriptAnalysis> {
  const formatted = formatTranscript(transcript);
  const content = await callLLM(formatted, ANALYZE_SYSTEM_PROMPT, true);

  try {
    const parsed = JSON.parse(content) as Partial<TranscriptAnalysis>;
    return {
      sentiment: parsed.sentiment || 'neutral',
      budget: parsed.budget ?? null,
      budgetCurrency: parsed.budgetCurrency || null,
      timeline: parsed.timeline || 'unsure',
      propertyType: parsed.propertyType || null,
      locationPreference: parsed.locationPreference || null,
      objections: parsed.objections || [],
      interestLevel:
        parsed.interestLevel !== undefined
          ? Math.max(0, Math.min(100, parsed.interestLevel))
          : 50,
      nextAction: parsed.nextAction || 'follow_up',
      summary: parsed.summary || 'Call analyzed but no summary available.',
    };
  } catch (err) {
    console.error('[transcriptAnalysis] Failed to parse LLM response:', err);
    // Return safe defaults on parse failure
    return {
      sentiment: 'neutral',
      budget: null,
      budgetCurrency: null,
      timeline: 'unsure',
      propertyType: null,
      locationPreference: null,
      objections: [],
      interestLevel: 50,
      nextAction: 'follow_up',
      summary: 'Unable to analyze transcript.',
    };
  }
}

// ---------------------------------------------------------------------------
// 2. extractKeyPhrases — Extract location, budget, and timeline phrases
// ---------------------------------------------------------------------------

const PHRASES_SYSTEM_PROMPT = `You are a real estate transcript analyst. Extract key phrases from the call transcript and return a JSON object with exactly these fields:

{
  "locations": ["list of location/area names mentioned"],
  "budgetPhrases": ["budget-related phrases or amounts"],
  "timelinePhrases": ["time-related phrases about when they want to buy"]
}

Return empty arrays if no relevant phrases found.`;

export async function extractKeyPhrases(
  transcript: string | TranscriptEntry[],
): Promise<KeyPhrases> {
  const formatted = formatTranscript(transcript);
  const content = await callLLM(formatted, PHRASES_SYSTEM_PROMPT, true);

  try {
    const parsed = JSON.parse(content) as Partial<KeyPhrases>;
    return {
      locations: Array.isArray(parsed.locations) ? parsed.locations : [],
      budgetPhrases: Array.isArray(parsed.budgetPhrases) ? parsed.budgetPhrases : [],
      timelinePhrases: Array.isArray(parsed.timelinePhrases) ? parsed.timelinePhrases : [],
    };
  } catch {
    return { locations: [], budgetPhrases: [], timelinePhrases: [] };
  }
}

// ---------------------------------------------------------------------------
// 3. detectObjections — Categorize objections from transcript
// ---------------------------------------------------------------------------

const OBJECTIONS_SYSTEM_PROMPT = `You are a real estate call analyst. Analyze the transcript for objections raised by the lead. Return a JSON object with exactly these fields:

{
  "categories": ["price" | "location" | "size" | "timing" | "financing" | "other"],
  "details": ["specific objection quotes or descriptions"]
}

If no objections found, return empty arrays. Be thorough — identify ALL objections.`;

export async function detectObjections(
  transcript: string | TranscriptEntry[],
): Promise<ObjectionResult> {
  const formatted = formatTranscript(transcript);
  const content = await callLLM(formatted, OBJECTIONS_SYSTEM_PROMPT, true);

  try {
    const parsed = JSON.parse(content) as Partial<ObjectionResult>;
    return {
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      details: Array.isArray(parsed.details) ? parsed.details : [],
    };
  } catch {
    return { categories: [], details: [] };
  }
}

// ---------------------------------------------------------------------------
// 4. summarizeCall — 2–3 line call summary
// ---------------------------------------------------------------------------

const SUMMARIZE_SYSTEM_PROMPT = `You are a real estate call summarizer. Summarize the following sales call transcript in 2-3 concise sentences. Focus on:
- What the lead is looking for (property type, location, budget)
- Their level of interest
- Key objections or concerns
- Recommended next action

Return ONLY the summary text — no JSON, no formatting, no extra explanation.`;

export async function summarizeCall(
  transcript: string | TranscriptEntry[],
): Promise<string> {
  const formatted = formatTranscript(transcript);
  const content = await callLLM(
    formatted,
    SUMMARIZE_SYSTEM_PROMPT,
    false, // Not JSON mode — plain text
  );

  return content.trim() || 'No summary available.';
}
