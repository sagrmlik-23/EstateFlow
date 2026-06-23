import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { LEAD_STATUSES } from '@/lib/constants';

const STATUS_LABELS: Record<string, string> = {
  [LEAD_STATUSES.NEW]: 'New',
  [LEAD_STATUSES.CONTACTED]: 'Contacted',
  [LEAD_STATUSES.QUALIFIED]: 'Qualified',
  [LEAD_STATUSES.PROPOSAL]: 'Proposal',
  [LEAD_STATUSES.NEGOTIATION]: 'Negotiation',
  [LEAD_STATUSES.CLOSED_WON]: 'Won',
  [LEAD_STATUSES.CLOSED_LOST]: 'Lost',
  [LEAD_STATUSES.ARCHIVED]: 'Archived',
};

const STATUS_VARIANTS: Record<string, 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost' | 'archived'> = {
  [LEAD_STATUSES.NEW]: 'new',
  [LEAD_STATUSES.CONTACTED]: 'contacted',
  [LEAD_STATUSES.QUALIFIED]: 'qualified',
  [LEAD_STATUSES.PROPOSAL]: 'proposal',
  [LEAD_STATUSES.NEGOTIATION]: 'negotiation',
  [LEAD_STATUSES.CLOSED_WON]: 'won',
  [LEAD_STATUSES.CLOSED_LOST]: 'lost',
  [LEAD_STATUSES.ARCHIVED]: 'archived',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
  size?: 'sm' | 'default';
}

export function StatusBadge({ status, className, size = 'default' }: StatusBadgeProps) {
  const variant = STATUS_VARIANTS[status] || 'default';
  const label = STATUS_LABELS[status] || status;

  return (
    <Badge
      variant={variant}
      className={cn(
        'font-medium capitalize whitespace-nowrap',
        size === 'sm' && 'text-[10px] px-1.5 py-0',
        className
      )}
    >
      {label}
    </Badge>
  );
}
