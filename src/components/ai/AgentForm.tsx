'use client';

import { useState, useCallback } from 'react';
import {
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import ScriptEditor from '@/components/ai/ScriptEditor';
import type {
  ClientAIAgent,
  CreateAgentInput,
  ScriptTemplateSet,
  AgentBehavior,
  TransferToHumanConfig,
  OffersConfig,
} from '@/types/ai';

// ---------------------------------------------------------------------------
// Voice options
// ---------------------------------------------------------------------------
const VOICE_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'nova', label: 'Nova — Warm & Empathetic' },
  { value: 'alloy', label: 'Alloy — Balanced & Professional' },
  { value: 'echo', label: 'Echo — Deep & Authoritative' },
  { value: 'fable', label: 'Fable — Bright & Energetic' },
  { value: 'onyx', label: 'Onyx — Deep & Calm' },
  { value: 'shimmer', label: 'Shimmer — Soft & Soothing' },
];

// ---------------------------------------------------------------------------
// Language options
// ---------------------------------------------------------------------------
const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'es', label: 'Spanish' },
  { value: 'ar', label: 'Arabic' },
  { value: 'fr', label: 'French' },
  { value: 'bn', label: 'Bengali' },
  { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'kn', label: 'Kannada' },
];

// ---------------------------------------------------------------------------
// Purpose options
// ---------------------------------------------------------------------------
const PURPOSE_OPTIONS = [
  { value: 'lead_qualification', label: 'Lead Qualification' },
  { value: 'follow_up', label: 'Follow-Up' },
  { value: 'survey', label: 'Survey & Feedback' },
  { value: 'reminder', label: 'Reminder & Confirmation' },
  { value: 'negotiation', label: 'Negotiation Support' },
  { value: 're_engagement', label: 'Re-Engagement' },
  { value: 'general', label: 'General Outreach' },
];

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
const DEFAULT_SCRIPTS: ScriptTemplateSet = {
  firstContact: '',
  followUp: '',
  siteVisitConfirm: '',
  postVisit: '',
  negotiation: '',
  reEngagement: '',
};

const DEFAULT_BEHAVIOR: AgentBehavior = {
  callDelayMinutes: 0,
  maxCallDuration: 300,
  maxRetries: 3,
  transferToHuman: {
    budgetThreshold: 0,
    angerDetected: false,
    complexQuestion: false,
  },
  offers: {
    maxDiscount: 0,
    canOfferParking: false,
    canOfferFurniture: false,
    canOfferMaintenance: false,
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface AgentFormProps {
  mode: 'create' | 'edit';
  initialData?: ClientAIAgent;
  onSave: (
    data: CreateAgentInput & { status?: ClientAIAgent['status'] }
  ) => Promise<void>;
  onCancel?: () => void;
  tenantId?: string;
}

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------
interface ValidationErrors {
  name?: string;
  purpose?: string;
  maxConcurrentCalls?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AgentForm({
  mode,
  initialData,
  onSave,
  onCancel,
}: AgentFormProps) {
  const [activeTab, setActiveTab] = useState('basic-info');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});

  // Form state
  const [name, setName] = useState(initialData?.name || '');
  const [voice, setVoice] = useState(initialData?.voice || 'default');
  const [language, setLanguage] = useState(initialData?.language || 'en');
  const [purpose, setPurpose] = useState(initialData?.greeting || '');
  const [purposeCategory, setPurposeCategory] = useState('');
  const [maxConcurrentCalls, setMaxConcurrentCalls] = useState(
    initialData?.behavior?.maxCallDuration?.toString() || '5'
  );
  const [scripts, setScripts] = useState<ScriptTemplateSet>(
    initialData?.scriptTemplates || DEFAULT_SCRIPTS
  );
  const [behavior, setBehavior] = useState<AgentBehavior>(
    initialData?.behavior || DEFAULT_BEHAVIOR
  );
  const [status, setStatus] = useState<ClientAIAgent['status']>(
    initialData?.status || 'active'
  );

  // Transfer rules
  const [transferBudget, setTransferBudget] = useState(
    behavior.transferToHuman.budgetThreshold.toString()
  );
  const [transferAnger, setTransferAnger] = useState(
    behavior.transferToHuman.angerDetected
  );
  const [transferComplex, setTransferComplex] = useState(
    behavior.transferToHuman.complexQuestion
  );

  // Offers
  const [maxDiscount, setMaxDiscount] = useState(
    behavior.offers.maxDiscount.toString()
  );
  const [offerParking, setOfferParking] = useState(
    behavior.offers.canOfferParking
  );
  const [offerFurniture, setOfferFurniture] = useState(
    behavior.offers.canOfferFurniture
  );
  const [offerMaintenance, setOfferMaintenance] = useState(
    behavior.offers.canOfferMaintenance
  );

  // --- Validation ---
  const validate = useCallback((): boolean => {
    const newErrors: ValidationErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Agent name is required';
    }

    if (purpose.trim().length > 500) {
      newErrors.purpose = 'Purpose must be under 500 characters';
    }

    const maxCalls = parseInt(maxConcurrentCalls, 10);
    if (isNaN(maxCalls) || maxCalls < 1 || maxCalls > 100) {
      newErrors.maxConcurrentCalls = 'Must be between 1 and 100';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, purpose, maxConcurrentCalls]);

  // --- Save handler ---
  const handleSave = async () => {
    if (!validate()) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const updatedBehavior: AgentBehavior = {
        ...behavior,
        transferToHuman: {
          budgetThreshold: parseInt(transferBudget, 10) || 0,
          angerDetected: transferAnger,
          complexQuestion: transferComplex,
        },
        offers: {
          maxDiscount: parseInt(maxDiscount, 10) || 0,
          canOfferParking: offerParking,
          canOfferFurniture: offerFurniture,
          canOfferMaintenance: offerMaintenance,
        },
      };

      await onSave({
        name: name.trim(),
        voice,
        language,
        greeting: purpose.trim(),
        purpose: purposeCategory || undefined,
        maxConcurrentCalls: parseInt(maxConcurrentCalls, 10),
        scriptTemplates: scripts,
        behavior: updatedBehavior,
        status: mode === 'create' ? 'active' : status,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save agent';
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const isEdit = mode === 'edit';

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="basic-info">Basic Info</TabsTrigger>
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
          <TabsTrigger value="behavior">Behavior</TabsTrigger>
          {isEdit && (
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          )}
        </TabsList>

        {/* ============================================= */}
        {/* TAB 1: Basic Info */}
        {/* ============================================= */}
        <TabsContent value="basic-info" className="space-y-6 pt-4">
          {/* Status toggle (edit mode only) */}
          {isEdit && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="text-sm font-medium">Agent Status</Label>
                <p className="text-xs text-muted-foreground">
                  {status === 'active'
                    ? 'Agent is active and accepting calls'
                    : status === 'paused'
                      ? 'Agent is paused — no new calls will be routed'
                      : `Agent is ${status}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {status === 'active' ? 'Active' : 'Paused'}
                </span>
                <Switch
                  checked={status === 'active'}
                  onCheckedChange={(checked) =>
                    setStatus(checked ? 'active' : 'paused')
                  }
                />
              </div>
            </div>
          )}

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="agent-name">
              Agent Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Priya — Lead Qualifier"
              disabled={isSaving}
            />
            {errors.name && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.name}
              </p>
            )}
          </div>

          {/* Voice */}
          <div className="space-y-2">
            <Label htmlFor="agent-voice">Voice</Label>
            <Select
              value={voice}
              onValueChange={setVoice}
              disabled={isSaving}
            >
              <SelectTrigger id="agent-voice">
                <SelectValue placeholder="Select a voice" />
              </SelectTrigger>
              <SelectContent>
                {VOICE_OPTIONS.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <Label htmlFor="agent-language">Language</Label>
            <Select
              value={language}
              onValueChange={setLanguage}
              disabled={isSaving}
            >
              <SelectTrigger id="agent-language">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Purpose Category */}
          <div className="space-y-2">
            <Label htmlFor="agent-purpose-category">Purpose Category</Label>
            <Select
              value={purposeCategory}
              onValueChange={setPurposeCategory}
              disabled={isSaving}
            >
              <SelectTrigger id="agent-purpose-category">
                <SelectValue placeholder="Select a purpose category (optional)" />
              </SelectTrigger>
              <SelectContent>
                {PURPOSE_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Purpose / Greeting */}
          <div className="space-y-2">
            <Label htmlFor="agent-purpose">Purpose / Greeting Message</Label>
            <Textarea
              id="agent-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Describe what this agent does and its greeting message..."
              rows={3}
              disabled={isSaving}
            />
            {errors.purpose && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.purpose}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {purpose.length}/500 characters
            </p>
          </div>

          {/* Max Concurrent Calls */}
          <div className="space-y-2">
            <Label htmlFor="agent-max-calls">
              Max Concurrent Calls
            </Label>
            <Input
              id="agent-max-calls"
              type="number"
              min={1}
              max={100}
              value={maxConcurrentCalls}
              onChange={(e) => setMaxConcurrentCalls(e.target.value)}
              disabled={isSaving}
            />
            {errors.maxConcurrentCalls && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.maxConcurrentCalls}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Maximum number of simultaneous calls this agent can handle
            </p>
          </div>
        </TabsContent>

        {/* ============================================= */}
        {/* TAB 2: Scripts */}
        {/* ============================================= */}
        <TabsContent value="scripts" className="space-y-4 pt-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-sm text-muted-foreground">
              Define the script templates the AI agent will use for different
              scenarios. Use variables like{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                {`{{lead_name}}`}
              </code>{' '}
              to personalize the conversation.
            </p>
          </div>
          <ScriptEditor value={scripts} onChange={setScripts} disabled={isSaving} />
        </TabsContent>

        {/* ============================================= */}
        {/* TAB 3: Behavior */}
        {/* ============================================= */}
        <TabsContent value="behavior" className="space-y-6 pt-4">
          {/* Call Delay */}
          <div className="space-y-2">
            <Label htmlFor="call-delay">Call Delay (minutes)</Label>
            <Input
              id="call-delay"
              type="number"
              min={0}
              max={1440}
              value={behavior.callDelayMinutes.toString()}
              onChange={(e) =>
                setBehavior({
                  ...behavior,
                  callDelayMinutes: parseInt(e.target.value, 10) || 0,
                })
              }
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Delay between scheduling and initiating the call (0 = immediate)
            </p>
          </div>

          {/* Max Call Duration */}
          <div className="space-y-2">
            <Label htmlFor="max-duration">Max Call Duration (seconds)</Label>
            <Input
              id="max-duration"
              type="number"
              min={30}
              max={3600}
              value={behavior.maxCallDuration.toString()}
              onChange={(e) =>
                setBehavior({
                  ...behavior,
                  maxCallDuration: parseInt(e.target.value, 10) || 300,
                })
              }
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Maximum length of a single call in seconds (30–3600)
            </p>
          </div>

          {/* Max Retries */}
          <div className="space-y-2">
            <Label htmlFor="max-retries">Max Retries</Label>
            <Input
              id="max-retries"
              type="number"
              min={0}
              max={10}
              value={behavior.maxRetries.toString()}
              onChange={(e) =>
                setBehavior({
                  ...behavior,
                  maxRetries: parseInt(e.target.value, 10) || 3,
                })
              }
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Number of times to retry the call if unanswered or failed
            </p>
          </div>

          <Separator />

          {/* Transfer Rules */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Transfer to Human Rules</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="transfer-budget">
                  Budget Threshold (₹)
                </Label>
                <Input
                  id="transfer-budget"
                  type="number"
                  min={0}
                  value={transferBudget}
                  onChange={(e) => setTransferBudget(e.target.value)}
                  disabled={isSaving}
                />
                <p className="text-xs text-muted-foreground">
                  Transfer to human if the deal exceeds this budget amount (0 = no threshold)
                </p>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm">Anger Detection</Label>
                  <p className="text-xs text-muted-foreground">
                    Transfer to human if the lead shows signs of anger
                  </p>
                </div>
                <Switch
                  checked={transferAnger}
                  onCheckedChange={setTransferAnger}
                  disabled={isSaving}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm">Complex Questions</Label>
                  <p className="text-xs text-muted-foreground">
                    Transfer to human if the lead asks complex questions
                  </p>
                </div>
                <Switch
                  checked={transferComplex}
                  onCheckedChange={setTransferComplex}
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Offers */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Offer Configuration</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="max-discount">Max Discount (%)</Label>
                <Input
                  id="max-discount"
                  type="number"
                  min={0}
                  max={100}
                  value={maxDiscount}
                  onChange={(e) => setMaxDiscount(e.target.value)}
                  disabled={isSaving}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum discount percentage the AI can offer (0 = no discount)
                </p>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm">Free Parking</Label>
                  <p className="text-xs text-muted-foreground">
                    AI can offer free parking as an incentive
                  </p>
                </div>
                <Switch
                  checked={offerParking}
                  onCheckedChange={setOfferParking}
                  disabled={isSaving}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm">Furniture Package</Label>
                  <p className="text-xs text-muted-foreground">
                    AI can offer furniture package as an incentive
                  </p>
                </div>
                <Switch
                  checked={offerFurniture}
                  onCheckedChange={setOfferFurniture}
                  disabled={isSaving}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm">Free Maintenance</Label>
                  <p className="text-xs text-muted-foreground">
                    AI can offer free maintenance as an incentive
                  </p>
                </div>
                <Switch
                  checked={offerMaintenance}
                  onCheckedChange={setOfferMaintenance}
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ============================================= */}
        {/* TAB 4: Analytics (edit only) */}
        {/* ============================================= */}
        {isEdit && initialData?.stats && (
          <TabsContent value="analytics" className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total Calls Made</p>
                <p className="text-2xl font-bold mt-1">
                  {initialData.stats.totalCallsMade.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Calls Connected</p>
                <p className="text-2xl font-bold mt-1">
                  {initialData.stats.totalCallsConnected.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Avg Duration</p>
                <p className="text-2xl font-bold mt-1">
                  {initialData.stats.avgCallDuration !== null
                    ? `${Math.round(initialData.stats.avgCallDuration / 60)} min`
                    : '—'}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Conversion Rate</p>
                <p className="text-2xl font-bold mt-1">
                  {initialData.stats.conversionRate !== null
                    ? `${(initialData.stats.conversionRate * 100).toFixed(1)}%`
                    : '—'}
                </p>
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Current Calls</p>
              <p className="text-2xl font-bold mt-1">
                {initialData.currentCalls} / {initialData.behavior?.maxCallDuration || '—'}
              </p>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Action bar */}
      <div className="flex items-center justify-between border-t pt-4">
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Saved successfully
            </span>
          )}
          {saveError && (
            <span className="flex items-center gap-1 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {saveError}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1" />
                {isEdit ? 'Save Changes' : 'Create Agent'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
