'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ScriptTemplateSet } from '@/types/ai';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface ScriptEditorProps {
  value: ScriptTemplateSet;
  onChange: (scripts: ScriptTemplateSet) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Variable definitions
// ---------------------------------------------------------------------------
interface ScriptVariable {
  label: string;
  value: string;
  description: string;
}

const SCRIPT_VARIABLES: ScriptVariable[] = [
  { label: 'Lead Name', value: '{{lead_name}}', description: 'Full name of the lead' },
  { label: 'Company Name', value: '{{company_name}}', description: 'Your company/brokerage name' },
  { label: 'Agent Name', value: '{{agent_name}}', description: 'Name of the assigned agent' },
  { label: 'Property Title', value: '{{property_title}}', description: 'Title of the property' },
  { label: 'Property Type', value: '{{property_type}}', description: 'Type of property (apartment, villa, etc.)' },
  { label: 'Location', value: '{{location}}', description: 'Property location area' },
  { label: 'Price', value: '{{price}}', description: 'Listing price' },
  { label: 'Visit Date', value: '{{visit_date}}', description: 'Scheduled site visit date' },
  { label: 'Visit Time', value: '{{visit_time}}', description: 'Scheduled site visit time' },
  { label: 'Offer Amount', value: '{{offer_amount}}', description: 'Offered amount during negotiation' },
  { label: 'Call Duration', value: '{{call_duration}}', description: 'Call duration in minutes' },
  { label: 'Last Contact', value: '{{last_contact}}', description: 'Date of last contact' },
];

// ---------------------------------------------------------------------------
// Script scenario metadata
// ---------------------------------------------------------------------------
interface ScenarioInfo {
  id: keyof ScriptTemplateSet;
  label: string;
  description: string;
  placeholder: string;
  minLength: number;
  maxLength: number;
}

const SCENARIOS: ScenarioInfo[] = [
  {
    id: 'firstContact',
    label: 'First Contact',
    description: 'Initial outreach to a new lead. Introduce yourself and the purpose of the call.',
    placeholder:
      'Hello {{lead_name}}, this is {{agent_name}} from {{company_name}}. I understand you are interested in {{property_type}} properties in {{location}}. I would love to tell you more about what we have available.',
    minLength: 50,
    maxLength: 2000,
  },
  {
    id: 'followUp',
    label: 'Follow-Up',
    description: 'Follow-up with a lead who has been contacted before but has not yet taken action.',
    placeholder:
      'Hi {{lead_name}}, this is {{agent_name}} from {{company_name}} again. We spoke a few days ago about {{property_type}} options in {{location}}. I wanted to follow up and see if you had any questions.',
    minLength: 50,
    maxLength: 2000,
  },
  {
    id: 'siteVisitConfirm',
    label: 'Site Visit Confirmation',
    description: 'Confirm an upcoming site visit or property tour.',
    placeholder:
      'Hello {{lead_name}}, this is {{agent_name}} from {{company_name}}. I am calling to confirm your site visit for {{property_title}} on {{visit_date}} at {{visit_time}}. Please let me know if you need any directions.',
    minLength: 50,
    maxLength: 1000,
  },
  {
    id: 'postVisit',
    label: 'Post-Visit Follow-Up',
    description: 'Follow up after a site visit to gauge interest and next steps.',
    placeholder:
      'Hi {{lead_name}}, {{agent_name}} here from {{company_name}}. I hope you enjoyed viewing {{property_title}} today. I wanted to check in and see if you had any thoughts or questions.',
    minLength: 50,
    maxLength: 2000,
  },
  {
    id: 'negotiation',
    label: 'Negotiation',
    description: 'Discuss pricing, offers, and deal terms with an interested lead.',
    placeholder:
      'Hello {{lead_name}}, this is {{agent_name}} from {{company_name}}. I am reaching out regarding your interest in {{property_title}}. We have received your offer of {{offer_amount}} and I would like to discuss the next steps.',
    minLength: 50,
    maxLength: 2000,
  },
  {
    id: 'reEngagement',
    label: 'Re-Engagement',
    description: 'Re-engage cold or inactive leads who have not responded in a while.',
    placeholder:
      'Hi {{lead_name}}, this is {{agent_name}} from {{company_name}}. It has been a while since we last spoke about finding you the perfect {{property_type}} in {{location}}. I wanted to check in and see if you are still looking.',
    minLength: 50,
    maxLength: 2000,
  },
];

// ---------------------------------------------------------------------------
// Character count helpers
// ---------------------------------------------------------------------------
function getCharLevel(
  count: number,
  min: number,
  max: number
): 'empty' | 'too-short' | 'ok' | 'near-limit' | 'over' {
  if (count === 0) return 'empty';
  if (count < min) return 'too-short';
  if (count > max) return 'over';
  if (count > max * 0.9) return 'near-limit';
  return 'ok';
}

function getCharLevelStyles(level: ReturnType<typeof getCharLevel>): string {
  switch (level) {
    case 'empty':
      return 'text-muted-foreground';
    case 'too-short':
      return 'text-yellow-600';
    case 'ok':
      return 'text-green-600';
    case 'near-limit':
      return 'text-orange-600';
    case 'over':
      return 'text-red-600';
  }
}

// ---------------------------------------------------------------------------
// Sample data for preview mode
// ---------------------------------------------------------------------------
const SAMPLE_DATA: Record<string, string> = {
  lead_name: 'Rajesh Kumar',
  company_name: 'EstateFlow Realty',
  agent_name: 'Priya Sharma',
  property_title: 'Sunset Villas, 3BHK Apartment',
  property_type: 'apartment',
  location: 'Whitefield, Bangalore',
  price: '₹ 85,00,000',
  visit_date: 'Monday, 15 June',
  visit_time: '11:00 AM',
  offer_amount: '₹ 82,00,000',
  call_duration: '5 minutes',
  last_contact: '2 weeks ago',
};

function interpolateVariables(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || `{{${key}}}`);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ScriptEditor({
  value,
  onChange,
  disabled = false,
}: ScriptEditorProps) {
  const [activeTab, setActiveTab] = useState<keyof ScriptTemplateSet>('firstContact');
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeScript = value[activeTab] || '';
  const activeScenario = SCENARIOS.find((s) => s.id === activeTab)!;

  const charCount = activeScript.length;
  const charLevel = getCharLevel(charCount, activeScenario.minLength, activeScenario.maxLength);

  // Preview text
  const previewText = useMemo(() => {
    if (!showPreview) return '';
    return interpolateVariables(activeScript, SAMPLE_DATA);
  }, [activeScript, showPreview]);

  // Insert variable at cursor or end
  const insertVariable = useCallback(
    (variable: string) => {
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = activeScript.slice(0, start);
        const after = activeScript.slice(end);
        const newText = before + variable + after;
        onChange({ ...value, [activeTab]: newText });
        // Restore cursor position after React re-render
        requestAnimationFrame(() => {
          textarea.focus();
          textarea.setSelectionRange(
            start + variable.length,
            start + variable.length
          );
        });
      } else {
        // Fallback: append to end
        onChange({ ...value, [activeTab]: activeScript + variable });
      }
    },
    [activeScript, activeTab, onChange, value]
  );

  return (
    <div className="space-y-4">
      {/* Scenario tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as keyof ScriptTemplateSet);
          setShowPreview(false);
        }}
      >
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          {SCENARIOS.map((scenario) => (
            <TabsTrigger
              key={scenario.id}
              value={scenario.id}
              className="text-xs whitespace-nowrap"
            >
              {scenario.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {SCENARIOS.map((scenario) => (
          <TabsContent key={scenario.id} value={scenario.id} className="space-y-3">
            {/* Scenario description */}
            <p className="text-xs text-muted-foreground">{scenario.description}</p>

            {/* Variable insertion buttons */}
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted-foreground mr-1 self-center">
                Variables:
              </span>
              {SCRIPT_VARIABLES.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  disabled={disabled}
                  className="inline-flex items-center rounded-md border bg-background px-2 py-0.5 text-xs font-mono text-primary hover:bg-accent transition-colors disabled:opacity-50"
                  onClick={() => insertVariable(v.value)}
                  title={v.description}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {/* Textarea */}
            <div className="relative">
              <Textarea
                ref={textareaRef}
                id={`script-${scenario.id}`}
                value={value[scenario.id]}
                onChange={(e) =>
                  onChange({ ...value, [scenario.id]: e.target.value })
                }
                placeholder={scenario.placeholder}
                disabled={disabled}
                className="min-h-[200px] font-mono text-sm leading-relaxed resize-y"
              />
            </div>

            {/* Character count */}
            <div className="flex items-center justify-between text-xs">
              <span className={getCharLevelStyles(charLevel)}>
                {charLevel === 'empty' && 'Enter a script template above'}
                {charLevel === 'too-short' &&
                  `${charCount} chars — minimum ${scenario.minLength} recommended`}
                {charLevel === 'ok' && `${charCount} characters`}
                {charLevel === 'near-limit' &&
                  `${charCount} chars — approaching ${scenario.maxLength} limit`}
                {charLevel === 'over' &&
                  `${charCount} chars — exceeds ${scenario.maxLength} limit`}
              </span>
              <span className="text-muted-foreground">
                {scenario.minLength}–{scenario.maxLength} chars
              </span>
            </div>

            {/* Preview toggle */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                disabled={disabled || !activeScript.trim()}
              >
                {showPreview ? 'Edit Mode' : 'Preview Mode'}
              </Button>
            </div>

            {/* Preview */}
            {showPreview && previewText && (
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="text-xs">
                    Preview
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Simulated with sample data
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {previewText}
                </p>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
