'use client';

import { useRouter } from 'next/navigation';
import {
  Phone,
  MessageSquare,
  User,
  CalendarDays,
  Eye,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ScoreBar } from '@/components/ui/ScoreBar';
import { Button } from '@/components/ui/button';
import { cn, maskPhone, formatDate } from '@/lib/utils';
import type { LeadRow } from '@/lib/leads/queries';

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

interface LeadCardProps {
  lead: LeadRow;
  isSelected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
}

export function LeadCard({ lead, isSelected = false, onSelect: _onSelect }: LeadCardProps) {
  const router = useRouter();

  return (
    <Card
      className={cn(
        'transition-all hover:shadow-md cursor-pointer',
        isSelected && 'ring-2 ring-primary'
      )}
      onClick={() => router.push(`./leads/${lead.id}`)}
    >
      <CardContent className="p-4">
        {/* Header Row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-foreground truncate">
                {lead.full_name}
              </h3>
              <StatusBadge status={lead.status} size="sm" />
            </div>
            <p className="text-sm text-muted-foreground font-mono">
              {maskPhone(lead.phone)}
            </p>
          </div>

          {/* Quick Action Icons */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => window.open(`tel:${lead.phone}`, '_blank')}
            >
              <Phone className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                window.open(
                  `https://wa.me/${lead.phone?.replace(/[^0-9]/g, '')}`,
                  '_blank'
                )
              }
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => router.push(`./leads/${lead.id}`)}
            >
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {lead.source
                ? SOURCE_LABELS[lead.source] || lead.source
                : 'Unknown source'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span>{formatDate(lead.created_at)}</span>
          </div>
        </div>

        {/* Score & Agent Row */}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1">
            <ScoreBar score={lead.ai_score} size="sm" />
          </div>
          {lead.assigned_agent_id && (
            <span className="text-xs text-muted-foreground truncate max-w-[100px]">
              Agent: {lead.assigned_agent_id.slice(0, 8)}...
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
