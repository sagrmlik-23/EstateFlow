import { cn, getScoreBgColor } from '@/lib/utils';

interface ScoreBarProps {
  score: number | null | undefined;
  maxScore?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ScoreBar({
  score,
  maxScore = 100,
  showLabel = true,
  size = 'md',
  className,
}: ScoreBarProps) {
  if (score === null || score === undefined) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="h-2 w-full rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-gray-300" style={{ width: '0%' }} />
        </div>
        {showLabel && <span className="text-xs text-gray-400 w-8 text-right">—</span>}
      </div>
    );
  }

  const pct = Math.min(100, Math.max(0, (score / maxScore) * 100));
  const color = getScoreBgColor(score);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'w-full rounded-full bg-gray-200',
          size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2'
        )}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className={cn(
          'font-semibold w-8 text-right',
          size === 'sm' ? 'text-[10px]' : 'text-xs',
          pct < 40 ? 'text-red-600' : pct < 60 ? 'text-yellow-600' : 'text-green-600'
        )}>
          {score}
        </span>
      )}
    </div>
  );
}
