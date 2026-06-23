'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Phone,
  MessageSquare,
  UserRound,
  Edit3,
  Mail,
  MapPin,
  DollarSign,
  Building,
  CalendarDays,
  BarChart3,
  Activity,
  PhoneCall,
  MessageCircle,
  Home,
  FileText,
  Lightbulb,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/toaster';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ScoreBar } from '@/components/ui/ScoreBar';
import { LeadForm } from '@/components/leads/LeadForm';
import { formatDate, formatDateTime } from '@/lib/utils';
import type { LeadRow, LeadActivityItem } from '@/lib/leads/queries';
import type { ApiResponse } from '@/lib/types';

const SOURCE_LABELS: Record<string, string> = {
  website: 'Website',
  referral: 'Referral',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  cold_call: 'Cold Call',
  walk_in: 'Walk-In',
  other: 'Other',
};

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartment',
  villa: 'Villa',
  plot: 'Plot',
  commercial: 'Commercial',
  penthouse: 'Penthouse',
  other: 'Other',
};

function getActivityIcon(type: string) {
  switch (type) {
    case 'call':
      return <PhoneCall className="h-4 w-4" />;
    case 'message':
      return <MessageCircle className="h-4 w-4" />;
    case 'site_visit':
      return <Home className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
}

function getActivityColor(type: string) {
  switch (type) {
    case 'call':
      return 'bg-blue-100 text-blue-700';
    case 'message':
      return 'bg-purple-100 text-purple-700';
    case 'site_visit':
      return 'bg-green-100 text-green-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

// Local cn helper to avoid import issues
function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export default function LeadDetailPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tenant, setTenant] = useState('');
  const [leadId, setLeadId] = useState('');
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [activities, setActivities] = useState<LeadActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(
    searchParams.get('edit') === 'true'
  );

  // Resolve params
  useEffect(() => {
    params.then((p) => {
      setTenant(p.tenant);
      setLeadId(p.id);
    });
  }, [params]);

  // Fetch lead
  const fetchLead = useCallback(async () => {
    if (!leadId || !tenant) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        headers: {
          'x-user-id': 'current-user',
          'x-tenant-id': tenant,
          'x-user-role': 'agent',
        },
      });

      const response: ApiResponse<LeadRow> = await res.json();

      if (!res.ok) {
        throw new Error(response.error || 'Failed to fetch lead');
      }

      setLead(response.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [leadId, tenant]);

  // Fetch activities
  const fetchActivities = useCallback(async () => {
    if (!leadId || !tenant) return;

    try {
      const res = await fetch(`/api/leads/${leadId}/activities`, {
        headers: {
          'x-user-id': 'current-user',
          'x-tenant-id': tenant,
          'x-user-role': 'agent',
        },
      });

      if (res.ok) {
        const response: ApiResponse<LeadActivityItem[]> = await res.json();
        setActivities(response.data || []);
      }
    } catch {
      // Activities are optional — don't block the page
    }
  }, [leadId, tenant]);

  useEffect(() => {
    if (leadId && tenant) {
      fetchLead();
      fetchActivities();
    }
  }, [leadId, tenant, fetchLead, fetchActivities]);

  const handleEditSuccess = (updatedLead: LeadRow) => {
    setLead(updatedLead);
    setShowEditDialog(false);
  };

  // Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6 animate-pulse">
          <div className="h-8 w-32 rounded bg-muted" />
          <div className="h-48 rounded-lg bg-muted" />
          <div className="h-64 rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  // Error State
  if (error || !lead) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-4 inline-block">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">
            {error || 'Lead not found'}
          </h2>
          <p className="text-muted-foreground mb-4">
            {error
              ? 'Something went wrong while loading this lead.'
              : 'The lead you are looking for does not exist or has been removed.'}
          </p>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const aiScore = lead.ai_score;

  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Leads
        </button>

        {/* Lead Info Card */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <CardTitle className="text-2xl">{lead.full_name}</CardTitle>
                <StatusBadge status={lead.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                Lead ID: {lead.id.slice(0, 8)}...
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditDialog(true)}
            >
              <Edit3 className="h-4 w-4 mr-1" />
              Edit
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Phone */}
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{lead.phone || '—'}</span>
                {lead.phone && (
                  <div className="flex gap-1 ml-auto">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => window.open(`tel:${lead.phone}`, '_blank')}
                    >
                      <PhoneCall className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() =>
                        window.open(
                          `https://wa.me/${lead.phone?.replace(/[^0-9]/g, '')}`,
                          '_blank'
                        )
                      }
                    >
                      <MessageSquare className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Email */}
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{lead.email || '—'}</span>
              </div>

              {/* Source */}
              <div className="flex items-center gap-2 text-sm">
                <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>
                  {lead.source
                    ? SOURCE_LABELS[lead.source] || lead.source
                    : '—'}
                </span>
              </div>

              {/* Budget */}
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>
                  {lead.budget_min !== null || lead.budget_max !== null
                    ? `₹${(lead.budget_min || 0).toLocaleString('en-IN')} – ₹${(lead.budget_max || 0).toLocaleString('en-IN')}`
                    : '—'}
                </span>
              </div>

              {/* Location */}
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">
                  {lead.preferred_location || '—'}
                </span>
              </div>

              {/* Property Type */}
              <div className="flex items-center gap-2 text-sm">
                <Building className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>
                  {lead.property_type
                    ? PROPERTY_TYPE_LABELS[lead.property_type] || lead.property_type
                    : '—'}
                </span>
              </div>

              {/* Created Date */}
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{formatDate(lead.created_at)}</span>
              </div>

              {/* Assigned Agent */}
              <div className="flex items-center gap-2 text-sm">
                <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>
                  {lead.assigned_agent_id
                    ? `Agent #${lead.assigned_agent_id.slice(0, 8)}`
                    : 'Unassigned'}
                </span>
              </div>

              {/* Duplicate Flag */}
              {lead.is_duplicate && (
                <div className="flex items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />
                  <span className="text-yellow-600 font-medium">
                    Potential duplicate
                  </span>
                </div>
              )}
            </div>

            {/* AI Score */}
            {aiScore !== null && aiScore !== undefined && (
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">AI Score</span>
                </div>
                <ScoreBar score={aiScore} size="lg" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => lead.phone && window.open(`tel:${lead.phone}`, '_blank')}
                disabled={!lead.phone}
              >
                <Phone className="h-4 w-4 mr-1" />
                Call
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  lead.phone &&
                  window.open(
                    `https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}`,
                    '_blank'
                  )
                }
                disabled={!lead.phone}
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                WhatsApp
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEditDialog(true)}
              >
                <Edit3 className="h-4 w-4 mr-1" />
                Edit Lead
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notes Section */}
        {lead.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {lead.notes}
              </p>
            </CardContent>
          </Card>
        )}

        {/* AI Insights */}
        {aiScore !== null && aiScore !== undefined && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                AI Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Lead Quality Score</span>
                  <Badge
                    variant={
                      aiScore >= 60
                        ? 'default'
                        : aiScore >= 40
                          ? 'secondary'
                          : 'destructive'
                    }
                  >
                    {aiScore >= 60
                      ? 'High Potential'
                      : aiScore >= 40
                        ? 'Medium Potential'
                        : 'Low Priority'}
                  </Badge>
                </div>
                <ScoreBar score={aiScore} size="lg" />
                <p className="text-xs text-muted-foreground">
                  {aiScore >= 80
                    ? 'This lead shows strong buying signals and high engagement. Prioritize immediate follow-up.'
                    : aiScore >= 60
                      ? 'This lead shows positive signals. Continue nurturing with regular follow-ups.'
                      : aiScore >= 40
                        ? 'Average potential. Consider additional qualification before committing significant resources.'
                        : 'Low engagement score. This lead may need re-engagement or could be deprioritized.'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Activity Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Activity Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No activity yet for this lead
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                {activities.map((activity, index) => (
                  <div key={activity.id} className="relative pb-6 last:pb-0">
                    {/* Timeline line */}
                    {index < activities.length - 1 && (
                      <div className="absolute left-[13px] top-6 bottom-0 w-px bg-border" />
                    )}

                    <div className="flex gap-3">
                      {/* Icon */}
                      <div
                        className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                          getActivityColor(activity.type)
                        )}
                      >
                        {getActivityIcon(activity.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {activity.type === 'call'
                            ? 'Phone Call'
                            : activity.type === 'message'
                              ? 'Message'
                              : activity.type === 'site_visit'
                                ? 'Site Visit'
                                : 'Note'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {activity.description}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDateTime(activity.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Lead: {lead.full_name}</DialogTitle>
          </DialogHeader>
          <LeadForm
            lead={lead}
            tenantId={tenant}
            onSuccess={handleEditSuccess}
            onCancel={() => setShowEditDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
