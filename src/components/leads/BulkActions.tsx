'use client';

import { useState } from 'react';
import { Loader2, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LEAD_STATUSES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface BulkActionsProps {
  selectedIds: string[];
  onClear: () => void;
  onComplete?: () => void;
}

const STATUS_OPTIONS = [
  { value: LEAD_STATUSES.NEW, label: 'New' },
  { value: LEAD_STATUSES.CONTACTED, label: 'Contacted' },
  { value: LEAD_STATUSES.QUALIFIED, label: 'Qualified' },
  { value: LEAD_STATUSES.PROPOSAL, label: 'Proposal' },
  { value: LEAD_STATUSES.NEGOTIATION, label: 'Negotiation' },
  { value: LEAD_STATUSES.CLOSED_WON, label: 'Won' },
  { value: LEAD_STATUSES.CLOSED_LOST, label: 'Lost' },
  { value: LEAD_STATUSES.ARCHIVED, label: 'Archived' },
];

type BulkAction = 'status' | 'reassign' | 'delete' | null;

export function BulkActions({
  selectedIds,
  onClear,
  onComplete,
}: BulkActionsProps) {
  const [activeAction, setActiveAction] = useState<BulkAction>(null);
  const [newStatus, setNewStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);

  const count = selectedIds.length;

  if (count === 0) return null;

  const handleBulkStatusChange = async () => {
    if (!newStatus) return;
    setIsProcessing(true);
    setProgress(0);

    try {
      const res = await fetch('/api/leads/bulk', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'current-user',
          'x-tenant-id': 'current-tenant',
          'x-user-role': 'agent',
        },
        body: JSON.stringify({
          lead_ids: selectedIds,
          status: newStatus,
        }),
      });

      const response = await res.json();

      if (!res.ok) {
        throw new Error(response.error || 'Bulk update failed');
      }

      setProgress(100);
      toast({
        title: 'Status Updated',
        description: `${count} lead(s) updated to ${STATUS_OPTIONS.find((s) => s.value === newStatus)?.label || newStatus}.`,
        variant: 'success',
      });

      setActiveAction(null);
      setNewStatus('');
      onClear();
      onComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    setIsProcessing(true);
    setProgress(0);

    try {
      let successCount = 0;
      for (let i = 0; i < selectedIds.length; i++) {
        const res = await fetch(`/api/leads/${selectedIds[i]}`, {
          method: 'DELETE',
          headers: {
            'x-user-id': 'current-user',
            'x-tenant-id': 'current-tenant',
            'x-user-role': 'agent',
          },
        });

        if (res.ok) {
          successCount++;
        }
        setProgress(Math.round(((i + 1) / selectedIds.length) * 100));
      }

      toast({
        title: 'Leads Archived',
        description: `${successCount} of ${count} lead(s) archived.`,
        variant: successCount === count ? 'success' : 'destructive',
      });

      setShowConfirm(false);
      setActiveAction(null);
      onClear();
      onComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-muted/40 animate-in slide-in-from-bottom-2">
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            {count} selected
          </span>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Change Status Action */}
        {activeAction === 'status' ? (
          <div className="flex items-center gap-2">
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue placeholder="New status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleBulkStatusChange}
              disabled={!newStatus || isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Apply
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveAction(null);
                setNewStatus('');
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveAction('status')}
          >
            Change Status
          </Button>
        )}

        {/* Reassign Action */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            toast({
              title: 'Coming Soon',
              description: 'Agent reassignment will be available in a future update.',
            });
          }}
        >
          Reassign Agent
        </Button>

        {/* Delete Action */}
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setShowConfirm(true)}
        >
          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
          Archive
        </Button>

        {/* Progress indicator */}
        {isProcessing && (
          <div className="flex-1 max-w-[200px]">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Clear Button */}
        <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto">
          Clear selection
        </Button>
      </div>

      {/* Confirmation Dialog for Delete */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {count} Lead(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive {count} lead(s). Archived leads can be
              viewed by filtering by "Archived" status. This action can be
              reversed by changing the status back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Archive {count} Lead(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
