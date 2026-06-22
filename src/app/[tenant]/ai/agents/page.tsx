'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Plus,
  RefreshCw,
  AlertCircle,
  Bot,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/toaster';
import { toast } from '@/hooks/use-toast';
import AgentCard from '@/components/ai/AgentCard';
import AgentForm from '@/components/ai/AgentForm';
import type { ClientAIAgent, CreateAgentInput } from '@/types/ai';
import type { ApiResponse } from '@/lib/types';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AIAgentsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const [tenant, setTenant] = useState('');
  const [agents, setAgents] = useState<ClientAIAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const router = useRouter();
  const pathname = usePathname();

  // Resolve params
  useEffect(() => {
    params.then((p) => setTenant(p.tenant));
  }, [params]);

  // -------------------------------------------------------------------------
  // Fetch agents
  // -------------------------------------------------------------------------
  const fetchAgents = useCallback(async () => {
    if (!tenant) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/ai/agents?tenantId=${tenant}`, {
        headers: {
          'x-user-id': 'current-user',
          'x-tenant-id': tenant,
          'x-user-role': 'org_admin',
        },
      });

      const response: ApiResponse<ClientAIAgent[]> = await res.json();

      if (!res.ok) {
        throw new Error(response.error || 'Failed to fetch agents');
      }

      setAgents(response.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    if (tenant) {
      fetchAgents();
    }
  }, [tenant, fetchAgents]);

  // -------------------------------------------------------------------------
  // Toggle agent status (active / paused)
  // -------------------------------------------------------------------------
  const handleStatusToggle = useCallback(
    async (agentId: string, newStatus: ClientAIAgent['status']) => {
      setTogglingIds((prev) => new Set(prev).add(agentId));

      try {
        const res = await fetch(`/api/ai/agents/${agentId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': 'current-user',
            'x-tenant-id': tenant,
            'x-user-role': 'org_admin',
          },
          body: JSON.stringify({ status: newStatus }),
        });

        const response: ApiResponse<ClientAIAgent> = await res.json();

        if (!res.ok) {
          throw new Error(response.error || 'Failed to update agent status');
        }

        // Update local state
        setAgents((prev) =>
          prev.map((a) =>
            a.id === agentId ? { ...a, status: newStatus } : a
          )
        );

        toast({
          title: newStatus === 'active' ? 'Agent activated' : 'Agent paused',
          description: `Agent has been ${newStatus === 'active' ? 'activated' : 'paused'} successfully.`,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'An error occurred';
        toast({
          title: 'Failed to update status',
          description: message,
        });
      } finally {
        setTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(agentId);
          return next;
        });
      }
    },
    [tenant]
  );

  // -------------------------------------------------------------------------
  // Delete agent
  // -------------------------------------------------------------------------
  const handleDelete = useCallback(
    async (agentId: string) => {
      try {
        const res = await fetch(`/api/ai/agents/${agentId}`, {
          method: 'DELETE',
          headers: {
            'x-user-id': 'current-user',
            'x-tenant-id': tenant,
            'x-user-role': 'org_admin',
          },
        });

        if (!res.ok) {
          const response: ApiResponse<null> = await res.json();
          throw new Error(response.error || 'Failed to delete agent');
        }

        // Remove from local state
        setAgents((prev) => prev.filter((a) => a.id !== agentId));

        toast({
          title: 'Agent deleted',
          description: 'The agent has been deactivated successfully.',
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'An error occurred';
        toast({
          title: 'Failed to delete agent',
          description: message,
        });
      }
    },
    [tenant]
  );

  // -------------------------------------------------------------------------
  // Create agent
  // -------------------------------------------------------------------------
  const handleCreateAgent = useCallback(
    async (data: CreateAgentInput & { status?: ClientAIAgent['status'] }) => {
      try {
        const res = await fetch('/api/ai/agents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': 'current-user',
            'x-tenant-id': tenant,
            'x-user-role': 'org_admin',
          },
          body: JSON.stringify({ ...data, tenantId: tenant }),
        });

        const response: ApiResponse<ClientAIAgent> = await res.json();

        if (!res.ok) {
          throw new Error(response.error || 'Failed to create agent');
        }

        // Add new agent to list
        if (response.data) {
          setAgents((prev) => [response.data!, ...prev]);
        }

        setShowCreateDialog(false);

        toast({
          title: 'Agent created',
          description: `"${data.name}" has been created successfully.`,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'An error occurred';
        throw new Error(message);
      }
    },
    [tenant]
  );

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-8 w-48 rounded bg-muted" />
                <div className="h-4 w-32 rounded bg-muted mt-2" />
              </div>
              <div className="h-10 w-36 rounded bg-muted" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-64 rounded-lg border bg-muted" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-destructive/10 p-4 mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold mb-1">
              Failed to load AI agents
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              {error}
            </p>
            <Button variant="outline" onClick={fetchAgents}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Try Again
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Agents</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your AI voice agents and their configurations
              {agents.length > 0 && ` · ${agents.length} agent${agents.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={fetchAgents}
              disabled={isLoading}
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New AI Agent</DialogTitle>
                </DialogHeader>
                <AgentForm
                  mode="create"
                  onSave={handleCreateAgent}
                  onCancel={() => setShowCreateDialog(false)}
                  tenantId={tenant}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Empty state */}
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Bot className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No AI agents yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Create your first AI voice agent to automate lead qualification,
              follow-ups, and more.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create Your First Agent
            </Button>
          </div>
        ) : (
          /* Agent grid */
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onStatusToggle={handleStatusToggle}
                onDelete={handleDelete}
                isToggling={togglingIds.has(agent.id)}
                tenant={tenant}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
