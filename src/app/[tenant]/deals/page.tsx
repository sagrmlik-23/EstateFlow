'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Plus,
  RefreshCw,
  AlertCircle,
  DollarSign,
  UserRound,
  TrendingUp,
  TrendingDown,
  Clock,
  GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatPrice } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DealCard {
  id: string;
  title: string;
  value: number;
  agent: string;
  lead: string;
  days_in_stage: number;
  property_type: string;
  probability: number;
}

interface DealStage {
  id: string;
  title: string;
  deals: DealCard[];
  total_value: number;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getDealStages(): DealStage[] {
  return [
    {
      id: 'lead_in',
      title: 'Lead In',
      deals: [
        { id: 'd1', title: '3BHK Apartment - Green Park', value: 7500000, agent: 'Rahul Sharma', lead: 'Rajesh Kumar', days_in_stage: 3, property_type: 'Apartment', probability: 20 },
        { id: 'd2', title: 'Commercial Space - MG Road', value: 15000000, agent: 'Priya Patel', lead: 'Anita Desai', days_in_stage: 5, property_type: 'Commercial', probability: 15 },
      ],
      total_value: 22500000,
    },
    {
      id: 'contacted',
      title: 'Contacted',
      deals: [
        { id: 'd3', title: 'Villa - Palm Meadows', value: 25000000, agent: 'Amit Singh', lead: 'Vikram Singh', days_in_stage: 7, property_type: 'Villa', probability: 30 },
      ],
      total_value: 25000000,
    },
    {
      id: 'meeting_scheduled',
      title: 'Meeting Scheduled',
      deals: [
        { id: 'd4', title: 'Penthouse - Skyline Tower', value: 35000000, agent: 'Rahul Sharma', lead: 'Sneha Gupta', days_in_stage: 2, property_type: 'Penthouse', probability: 45 },
        { id: 'd5', title: 'Plot - Eco Valley', value: 5000000, agent: 'Priya Patel', lead: 'Amit Verma', days_in_stage: 4, property_type: 'Plot', probability: 40 },
      ],
      total_value: 40000000,
    },
    {
      id: 'negotiation',
      title: 'Negotiation',
      deals: [
        { id: 'd6', title: 'Duplex - Garden Estate', value: 18000000, agent: 'Amit Singh', lead: 'Priya Sharma', days_in_stage: 10, property_type: 'Villa', probability: 65 },
      ],
      total_value: 18000000,
    },
    {
      id: 'closed_won',
      title: 'Closed Won',
      deals: [
        { id: 'd7', title: 'Studio - Downtown', value: 4500000, agent: 'Rahul Sharma', lead: 'Neha Kapoor', days_in_stage: 0, property_type: 'Apartment', probability: 100 },
      ],
      total_value: 4500000,
    },
    {
      id: 'closed_lost',
      title: 'Closed Lost',
      deals: [],
      total_value: 0,
    },
  ];
}

// ---------------------------------------------------------------------------
// Stage color mapping
// ---------------------------------------------------------------------------
const STAGE_COLORS: Record<string, string> = {
  lead_in: 'border-l-blue-500',
  contacted: 'border-l-purple-500',
  meeting_scheduled: 'border-l-indigo-500',
  negotiation: 'border-l-amber-500',
  closed_won: 'border-l-emerald-500',
  closed_lost: 'border-l-red-500',
};

const STAGE_BG: Record<string, string> = {
  lead_in: 'bg-blue-50/50 dark:bg-blue-950/20',
  contacted: 'bg-purple-50/50 dark:bg-purple-950/20',
  meeting_scheduled: 'bg-indigo-50/50 dark:bg-indigo-950/20',
  negotiation: 'bg-amber-50/50 dark:bg-amber-950/20',
  closed_won: 'bg-emerald-50/50 dark:bg-emerald-950/20',
  closed_lost: 'bg-red-50/50 dark:bg-red-950/20',
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------
export default function DealsPage() {
  const params = useParams<{ tenant: string }>();
  const router = useRouter();
  const tenant = params?.tenant ?? '';

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<DealStage[]>([]);
  const [dragStageId, setDragStageId] = useState<string | null>(null);

  const fetchDeals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 600));
      setStages(getDealStages());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deals');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  // Pipeline stats
  const totalPipeline = stages.reduce((sum, s) => sum + s.total_value, 0);
  const totalDeals = stages.reduce((sum, s) => sum + s.deals.length, 0);
  const wonDeals = stages.find((s) => s.id === 'closed_won')?.deals.length ?? 0;
  const wonValue = stages.find((s) => s.id === 'closed_won')?.total_value ?? 0;

  // Simple drag simulation
  const handleDragStart = (dealId: string, stageId: string) => {
    setDragStageId(stageId);
  };

  const handleDrop = (targetStageId: string) => {
    if (!dragStageId || dragStageId === targetStageId) return;
    setDragStageId(null);
  };

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-pulse">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-muted" />
            ))}
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="min-w-[280px] h-[400px] rounded-lg bg-muted shrink-0" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-4 inline-block">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Failed to load deals</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={fetchDeals}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Deals Pipeline</h1>
            <p className="text-sm text-muted-foreground">
              Track deals through your pipeline stages
            </p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-1" />
            Add Deal
          </Button>
        </div>

        {/* Pipeline Stats Header */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-xl font-bold">{formatPrice(totalPipeline)}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Deals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span className="text-xl font-bold">{totalDeals}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Closed Won</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <span className="text-xl font-bold">{wonDeals}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{formatPrice(wonValue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-amber-500" />
                <span className="text-xl font-bold">
                  {totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0}%
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Kanban Board */}
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
          {stages.map((stage) => (
            <div
              key={stage.id}
              className="min-w-[280px] w-[280px] shrink-0"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(stage.id)}
            >
              {/* Stage Header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{stage.title}</h3>
                  <Badge variant="secondary" className="text-xs">
                    {stage.deals.length}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatPrice(stage.total_value)}
                </span>
              </div>

              {/* Stage Cards */}
              <div
                className={cn(
                  'rounded-lg border p-2 space-y-2 min-h-[200px]',
                  STAGE_BG[stage.id] || 'bg-muted/30'
                )}
              >
                {stage.deals.length === 0 ? (
                  <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
                    No deals in this stage
                  </div>
                ) : (
                  stage.deals.map((deal) => (
                    <button
                      key={deal.id}
                      draggable
                      onDragStart={() => handleDragStart(deal.id, stage.id)}
                      onClick={() => router.push(`/${tenant}/deals/${deal.id}`)}
                      className={cn(
                        'w-full text-left rounded-lg border bg-card p-3 transition-all hover:shadow-md active:shadow-sm',
                        'cursor-grab active:cursor-grabbing',
                        STAGE_COLORS[stage.id] && `border-l-4 ${STAGE_COLORS[stage.id]}`
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium leading-tight">{deal.title}</p>
                        <GripVertical className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <DollarSign className="h-3 w-3" />
                          <span className="font-medium text-foreground">
                            {formatPrice(deal.value)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <UserRound className="h-3 w-3" />
                          <span>{deal.agent}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{deal.days_in_stage}d in stage</span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">{deal.lead}</span>
                        <span className="text-[10px] font-medium">
                          {deal.probability}%
                        </span>
                      </div>
                      {/* Probability bar */}
                      <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            deal.probability >= 80
                              ? 'bg-emerald-500'
                              : deal.probability >= 50
                                ? 'bg-amber-500'
                                : 'bg-blue-500'
                          )}
                          style={{ width: `${deal.probability}%` }}
                        />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
