'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Toaster } from '@/components/ui/toaster';
import { toast } from '@/hooks/use-toast';
import AgentForm from '@/components/ai/AgentForm';
import type { ClientAIAgent, CreateAgentInput, UpdateAgentInput } from '@/types/ai';
import type { ApiResponse } from '@/lib/types';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AIAgentDetailPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}) {
  const router = useRouter();
  const [tenant, setTenant] = useState('');
  const [agentId, setAgentId] = useState('');
  const [agent, setAgent] = useState<ClientAIAgent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Resolve params
  useEffect(() => {
    params.then((p) => {
      setTenant(p.tenant);
      setAgentId(p.id);
    });
  }, [params]);

  // -------------------------------------------------------------------------
  // Fetch agent
  // -------------------------------------------------------------------------
  const fetchAgent = useCallback(async () => {
    if (!agentId || !tenant) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/ai/agents/${agentId}`, {
        headers: {
          'x-user-id': 'current-user',
          'x-tenant-id': tenant,
          'x-user-role': 'org_admin',
        },
      });

      const response: ApiResponse<ClientAIAgent> = await res.json();

      if (!res.ok) {
        throw new Error(response.error || 'Failed to fetch agent');
      }

      if (!response.data) {
        throw new Error('Agent not found');
      }

      setAgent(response.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [agentId, tenant]);

  useEffect(() => {
    if (agentId && tenant) {
      fetchAgent();
    }
  }, [agentId, tenant, fetchAgent]);

  // -------------------------------------------------------------------------
  // Save handler
  // -------------------------------------------------------------------------
  const handleSave = useCallback(
    async (
      data: CreateAgentInput & { status?: ClientAIAgent['status'] }
    ) => {
      if (!agentId) return;
      setIsSaving(true);

      try {
        const updateData: UpdateAgentInput = {
          name: data.name,
          voice: data.voice,
          language: data.language,
          greeting: data.greeting,
          purpose: data.purpose,
          maxConcurrentCalls: data.maxConcurrentCalls,
          scriptTemplates: data.scriptTemplates,
          behavior: data.behavior,
          status: data.status,
        };

        const res = await fetch(`/api/ai/agents/${agentId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': 'current-user',
            'x-tenant-id': tenant,
            'x-user-role': 'org_admin',
          },
          body: JSON.stringify(updateData),
        });

        const response: ApiResponse<ClientAIAgent> = await res.json();

        if (!res.ok) {
          throw new Error(response.error || 'Failed to save agent');
        }

        if (response.data) {
          setAgent(response.data);
        }

        toast({
          title: 'Agent saved',
          description: 'Changes have been saved successfully.',
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'An error occurred';
        throw new Error(message);
      } finally {
        setIsSaving(false);
      }
    },
    [agentId, tenant]
  );

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-32 rounded bg-muted" />
            <div className="h-12 w-64 rounded bg-muted" />
            <div className="h-96 rounded-lg bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  if (error || !agent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="rounded-full bg-destructive/10 p-4 mb-4 inline-block">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">
            {error || 'Agent not found'}
          </h2>
          <p className="text-muted-foreground mb-4">
            {error
              ? 'Something went wrong while loading this agent.'
              : 'The AI agent you are looking for does not exist or has been removed.'}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Go Back
            </Button>
            <Button variant="outline" onClick={fetchAgent}>
              <Loader2 className="h-4 w-4 mr-1" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to AI Agents
        </button>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">{agent.name}</h1>
          <p className="text-sm text-muted-foreground">
            Configure your AI voice agent&apos;s behavior, scripts, and settings
          </p>
        </div>

        {/* Form card */}
        <Card>
          <CardHeader>
            <CardTitle>
              {agent.status === 'active' ? 'Edit Agent Configuration' : 'Agent Configuration (Paused)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AgentForm
              mode="edit"
              initialData={agent}
              onSave={handleSave}
              onCancel={() => router.back()}
              tenantId={tenant}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
