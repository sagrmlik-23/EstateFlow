'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Phone,
  Globe,
  Activity,
  BarChart3,
  Edit3,
  PauseCircle,
  PlayCircle,
  Trash2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { ClientAIAgent } from '@/types/ai';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface AgentCardProps {
  agent: ClientAIAgent;
  onStatusToggle: (agentId: string, newStatus: ClientAIAgent['status']) => void;
  onDelete: (agentId: string) => void;
  isToggling?: boolean;
  tenant: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<ClientAIAgent['status'], string> = {
  active: 'bg-green-500',
  inactive: 'bg-gray-400',
  paused: 'bg-yellow-500',
  error: 'bg-red-500',
};

const STATUS_LABELS: Record<ClientAIAgent['status'], string> = {
  active: 'Active',
  inactive: 'Inactive',
  paused: 'Paused',
  error: 'Error',
};

const VOICE_LABELS: Record<string, string> = {
  default: 'Default',
  'nova': 'Nova',
  'alloy': 'Alloy',
  'echo': 'Echo',
  'fable': 'Fable',
  'onyx': 'Onyx',
  'shimmer': 'Shimmer',
};

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  es: 'Spanish',
  ar: 'Arabic',
  fr: 'French',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getStatusColor(status: ClientAIAgent['status']): string {
  return STATUS_COLORS[status] || 'bg-gray-400';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AgentCard({
  agent,
  onStatusToggle,
  onDelete,
  isToggling = false,
  tenant,
}: AgentCardProps) {
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const utilizationPercent =
    agent.currentCalls && agent.behavior?.maxCallDuration
      ? Math.min(
          100,
          Math.round(
            (agent.currentCalls / (agent.behavior?.maxCallDuration || 1)) * 100
          )
        )
      : 0;

  const conversionRate = agent.stats?.conversionRate ?? null;
  const isLoading = isToggling || isDeleting;

  const handleEdit = () => {
    router.push(`/${tenant}/ai/agents/${agent.id}`);
  };

  const handleToggleStatus = () => {
    const newStatus =
      agent.status === 'active' ? 'paused' : 'active';
    onStatusToggle(agent.id, newStatus);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(agent.id);
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <Card className="relative overflow-hidden transition-all hover:shadow-md">
      {/* Top gradient bar */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 h-1',
          agent.status === 'active' ? 'bg-green-500' : 'bg-gray-300'
        )}
      />

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Avatar with initials */}
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white',
                agent.status === 'active'
                  ? 'bg-primary'
                  : 'bg-muted-foreground'
              )}
            >
              {getInitials(agent.name)}
            </div>

            <div className="min-w-0">
              <h3 className="font-semibold truncate">{agent.name}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                {/* Status indicator */}
                <span
                  className={cn(
                    'inline-block h-2 w-2 rounded-full',
                    getStatusColor(agent.status)
                  )}
                />
                <span className="text-xs text-muted-foreground">
                  {STATUS_LABELS[agent.status]}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-3">
        {/* Voice & Language badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="text-xs gap-1">
            <Phone className="h-3 w-3" />
            {VOICE_LABELS[agent.voice] || agent.voice}
          </Badge>
          <Badge variant="secondary" className="text-xs gap-1">
            <Globe className="h-3 w-3" />
            {LANGUAGE_LABELS[agent.language] || agent.language}
          </Badge>
        </div>

        {/* Purpose */}
        {agent.greeting && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {agent.greeting}
          </p>
        )}

        {/* Workload bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Activity className="h-3 w-3" />
              Workload
            </span>
            <span className="font-medium">
              {agent.currentCalls} / {agent.behavior?.maxCallDuration || '—'}
            </span>
          </div>
          <Progress
            value={utilizationPercent}
            className={cn(
              'h-1.5',
              utilizationPercent > 80
                ? '[&>div]:bg-red-500'
                : utilizationPercent > 50
                  ? '[&>div]:bg-yellow-500'
                  : ''
            )}
          />
        </div>

        {/* Conversion rate */}
        {conversionRate !== null && conversionRate !== undefined && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <BarChart3 className="h-3 w-3" />
              Conversion Rate
            </span>
            <span className="font-semibold">
              {(conversionRate * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t px-4 py-2">
        <div className="flex w-full items-center justify-between gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={handleEdit}
            disabled={isLoading}
          >
            <Edit3 className="h-3 w-3" />
            Edit
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 gap-1 text-xs',
              agent.status === 'active'
                ? 'text-yellow-600 hover:text-yellow-700'
                : 'text-green-600 hover:text-green-700'
            )}
            onClick={handleToggleStatus}
            disabled={isLoading}
          >
            {isToggling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : agent.status === 'active' ? (
              <PauseCircle className="h-3 w-3" />
            ) : (
              <PlayCircle className="h-3 w-3" />
            )}
            {agent.status === 'active' ? 'Pause' : 'Activate'}
          </Button>

          <AlertDialog
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
          >
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs text-destructive hover:text-destructive"
                disabled={isLoading}
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete AI Agent</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete &ldquo;{agent.name}&rdquo;?
                  This will deactivate the agent and remove it from active call
                  routing. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardFooter>
    </Card>
  );
}
