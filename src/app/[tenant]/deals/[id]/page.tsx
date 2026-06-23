'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  DollarSign,
  UserRound,
  TrendingUp,
  Clock,
  Building,
  Phone,
  FileText,
  CheckCircle2,
  Circle,
  Target,
  AlertCircle,
  Percent,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatPrice, formatDate } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DealDetail {
  id: string;
  title: string;
  value: number;
  stage: string;
  agent: string;
  agent_id: string;
  lead: string;
  lead_id: string;
  lead_phone: string;
  property_type: string;
  probability: number;
  days_in_stage: number;
  created_at: string;
  expected_close: string;
  commission_rate: number;
  commission_amount: number;
  notes?: string;
}

interface StageTimelineItem {
  stage: string;
  label: string;
  date: string;
  active: boolean;
  completed: boolean;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getDealDetail(): DealDetail {
  return {
    id: 'd1',
    title: '3BHK Apartment - Green Park',
    value: 7500000,
    stage: 'meeting_scheduled',
    agent: 'Rahul Sharma',
    agent_id: 'agent_001',
    lead: 'Rajesh Kumar',
    lead_id: 'lead_001',
    lead_phone: '+91-9876543210',
    property_type: 'Apartment',
    probability: 45,
    days_in_stage: 3,
    created_at: '2026-06-10T00:00:00Z',
    expected_close: '2026-07-15T00:00:00Z',
    commission_rate: 2.5,
    commission_amount: 187500,
    notes: 'Client interested in 3BHK with sea view. Prefers higher floor.',
  };
}

function getStageTimeline(): StageTimelineItem[] {
  return [
    { stage: 'lead_in', label: 'Lead In', date: '2026-06-10', active: false, completed: true },
    { stage: 'contacted', label: 'Contacted', date: '2026-06-12', active: false, completed: true },
    { stage: 'meeting_scheduled', label: 'Meeting Scheduled', date: '2026-06-15', active: true, completed: false },
    { stage: 'negotiation', label: 'Negotiation', date: '', active: false, completed: false },
    { stage: 'closed_won', label: 'Closed Won', date: '', active: false, completed: false },
  ];
}

function getRelatedDocuments() {
  return [
    { id: 'doc1', name: 'Property Brochure.pdf', type: 'pdf', date: '2026-06-14' },
    { id: 'doc2', name: 'Offer Letter.docx', type: 'doc', date: '2026-06-15' },
    { id: 'doc3', name: 'Site Visit Report.pdf', type: 'pdf', date: '2026-06-16' },
  ];
}

const STAGE_LABELS: Record<string, string> = {
  lead_in: 'Lead In',
  contacted: 'Contacted',
  meeting_scheduled: 'Meeting Scheduled',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

const STAGE_COLORS: Record<string, string> = {
  lead_in: 'border-blue-500 bg-blue-100 dark:bg-blue-900/30',
  contacted: 'border-purple-500 bg-purple-100 dark:bg-purple-900/30',
  meeting_scheduled: 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900/30',
  negotiation: 'border-amber-500 bg-amber-100 dark:bg-amber-900/30',
  closed_won: 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/30',
  closed_lost: 'border-red-500 bg-red-100 dark:bg-red-900/30',
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------
export default function DealDetailPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}) {
  const router = useRouter();

  const [tenant, setTenant] = useState('');
  const [dealId, setDealId] = useState('');
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [timeline, setTimeline] = useState<StageTimelineItem[]>([]);
  const [documents, setDocuments] = useState<{ id: string; name: string; type: string; date: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => {
      setTenant(p.tenant);
      setDealId(p.id);
    });
  }, [params]);

  const fetchDeal = useCallback(async () => {
    if (!dealId || !tenant) return;
    setIsLoading(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 600));
      setDeal(getDealDetail());
      setTimeline(getStageTimeline());
      setDocuments(getRelatedDocuments());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deal');
    } finally {
      setIsLoading(false);
    }
  }, [dealId, tenant]);

  useEffect(() => {
    fetchDeal();
  }, [fetchDeal]);

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6 animate-pulse">
          <div className="h-8 w-32 rounded bg-muted" />
          <div className="h-48 rounded-lg bg-muted" />
          <div className="h-40 rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  // Error
  if (error || !deal) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-4 inline-block">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">
            {error || 'Deal not found'}
          </h2>
          <p className="text-muted-foreground mb-4">
            {error
              ? 'Something went wrong while loading this deal.'
              : 'The deal you are looking for does not exist.'}
          </p>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Back */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Deals
        </button>

        {/* Deal Info Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-2xl">{deal.title}</CardTitle>
                  <Badge
                    variant="outline"
                    className={cn(
                      'capitalize',
                      deal.stage === 'closed_won' && 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
                      deal.stage === 'closed_lost' && 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400',
                      deal.stage === 'negotiation' && 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
                      deal.stage === 'meeting_scheduled' && 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400',
                    )}
                  >
                    {STAGE_LABELS[deal.stage] || deal.stage}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Deal ID: {deal.id.slice(0, 8)}...
                </p>
              </div>
              <Button variant="outline" size="sm">
                Edit Deal
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Value */}
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Deal Value</p>
                  <p className="font-semibold">{formatPrice(deal.value)}</p>
                </div>
              </div>

              {/* Agent */}
              <div className="flex items-center gap-2 text-sm">
                <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Agent</p>
                  <p>{deal.agent}</p>
                </div>
              </div>

              {/* Lead */}
              <div className="flex items-center gap-2 text-sm">
                <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Lead</p>
                  <p>{deal.lead}</p>
                </div>
              </div>

              {/* Lead Phone */}
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Lead Phone</p>
                  <p>{deal.lead_phone}</p>
                </div>
              </div>

              {/* Property Type */}
              <div className="flex items-center gap-2 text-sm">
                <Building className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Property Type</p>
                  <p>{deal.property_type}</p>
                </div>
              </div>

              {/* Probability */}
              <div className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Probability</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{deal.probability}%</p>
                    <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          deal.probability >= 80 ? 'bg-emerald-500' : deal.probability >= 50 ? 'bg-amber-500' : 'bg-blue-500'
                        )}
                        style={{ width: `${deal.probability}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Created */}
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p>{formatDate(deal.created_at)}</p>
                </div>
              </div>

              {/* Days in Stage */}
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Days in Stage</p>
                  <p className="font-medium">{deal.days_in_stage} days</p>
                </div>
              </div>

              {/* Expected Close */}
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Expected Close</p>
                  <p>{formatDate(deal.expected_close)}</p>
                </div>
              </div>
            </div>

            {/* Notes */}
            {deal.notes && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                <p className="text-sm">{deal.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stage Progression Timeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Stage Progression
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {timeline.map((item, index) => {
                const isLast = index === timeline.length - 1;
                const stageColor = STAGE_COLORS[item.stage] || 'border-gray-300 bg-gray-100';

                return (
                  <div key={item.stage} className="relative pb-6 last:pb-0">
                    {/* Timeline line */}
                    {!isLast && (
                      <div
                        className={cn(
                          'absolute left-[15px] top-8 bottom-0 w-0.5',
                          item.completed ? 'bg-emerald-300' : 'bg-border'
                        )}
                      />
                    )}

                    <div className="flex items-start gap-3">
                      {/* Status icon */}
                      <div className="relative z-10 mt-0.5">
                        {item.completed ? (
                          <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                        ) : item.active ? (
                          <div className="h-7 w-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center ring-2 ring-indigo-500">
                            <Circle className="h-3 w-3 text-indigo-600" />
                          </div>
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                            <Circle className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p
                            className={cn(
                              'text-sm font-medium',
                              item.completed && 'text-emerald-700 dark:text-emerald-400',
                              item.active && 'text-indigo-700 dark:text-indigo-400'
                            )}
                          >
                            {item.label}
                          </p>
                          {item.date && (
                            <span className="text-xs text-muted-foreground">
                              {formatDate(item.date)}
                            </span>
                          )}
                        </div>
                        {item.active && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Current stage — {deal.days_in_stage} days
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Commission Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Percent className="h-4 w-4" />
              Commission Info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground mb-1">Commission Rate</p>
                <p className="text-xl font-bold">{deal.commission_rate}%</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground mb-1">Estimated Commission</p>
                <p className="text-xl font-bold text-emerald-600">{formatPrice(deal.commission_amount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Related Documents */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Related Documents
            </CardTitle>
            <CardDescription>{documents.length} documents attached</CardDescription>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No documents attached</p>
              </div>
            ) : (
              <div className="divide-y">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded p-1.5 bg-muted">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(doc.date)}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
