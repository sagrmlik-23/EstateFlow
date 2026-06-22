'use client';

import { useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown, Users, UserPlus, Flame, BarChart3, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────

interface StatsCardsProps {
  totalLeads: number;
  newToday: number;
  hotLeads: number;
  conversionRate: number;
  newTodayChange?: number;
  conversionChange?: number;
}

interface StatCardData {
  label: string;
  value: number;
  icon: React.ReactNode;
  change: number;
  changeLabel: string;
  colorClass: string;
  iconBg: string;
}

// ─── Animated Counter ─────────────────────────────────────────────────────

function AnimatedCounter({ value, duration = 800 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    startRef.current = null;

    function animate(timestamp: number) {
      if (!mountedRef.current) return;
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <span>{display.toLocaleString('en-IN')}</span>;
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────

function StatsCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-2">
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="h-7 w-24 rounded bg-muted" />
        </div>
        <div className="h-10 w-10 rounded-lg bg-muted" />
      </div>
      <div className="h-4 w-28 rounded bg-muted" />
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, change, changeLabel, colorClass, iconBg }: StatCardData) {
  const isPositive = change >= 0;
  const isPercent = label === 'Conversion Rate';

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight">
            {isPercent ? (
              <AnimatedCounter value={value} />
            ) : (
              <AnimatedCounter value={value} />
            )}
            {isPercent && <span className="text-lg font-normal text-muted-foreground ml-0.5">%</span>}
          </p>
        </div>
        <div className={cn('rounded-lg p-2.5', iconBg)}>{icon}</div>
      </div>
      <div className="flex items-center gap-1.5">
        {isPositive ? (
          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5 text-red-500" />
        )}
        <span className={cn('text-xs font-medium', isPositive ? 'text-emerald-600' : 'text-red-600')}>
          {isPositive ? '+' : ''}{change}%
        </span>
        <span className="text-xs text-muted-foreground">{changeLabel}</span>
      </div>
    </div>
  );
}

// ─── StatsCards Component ─────────────────────────────────────────────────

export function StatsCards({
  totalLeads,
  newToday,
  hotLeads,
  conversionRate,
  newTodayChange = 0,
  conversionChange = 0,
}: StatsCardsProps) {
  const cards: StatCardData[] = [
    {
      label: 'Total Leads',
      value: totalLeads,
      icon: <Users className="h-5 w-5 text-blue-600" />,
      change: newTodayChange,
      changeLabel: 'vs yesterday',
      colorClass: 'text-blue-600',
      iconBg: 'bg-blue-100',
    },
    {
      label: 'New Today',
      value: newToday,
      icon: <UserPlus className="h-5 w-5 text-emerald-600" />,
      change: newTodayChange,
      changeLabel: 'vs yesterday',
      colorClass: 'text-emerald-600',
      iconBg: 'bg-emerald-100',
    },
    {
      label: 'Hot Leads',
      value: hotLeads,
      icon: <Flame className="h-5 w-5 text-orange-600" />,
      change: Math.round((hotLeads / Math.max(totalLeads, 1)) * 100),
      changeLabel: 'of total leads',
      colorClass: 'text-orange-600',
      iconBg: 'bg-orange-100',
    },
    {
      label: 'Conversion Rate',
      value: conversionRate,
      icon: <BarChart3 className="h-5 w-5 text-purple-600" />,
      change: conversionChange,
      changeLabel: 'vs last month',
      colorClass: 'text-purple-600',
      iconBg: 'bg-purple-100',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <StatCard key={card.label} {...card} />
      ))}
    </div>
  );
}

// ─── Loading State ────────────────────────────────────────────────────────

export function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <StatsCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ─── Error State ──────────────────────────────────────────────────────────

export function StatsCardsError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="rounded-xl border bg-card p-8 text-center">
      <RefreshCw className="h-8 w-8 text-destructive mx-auto mb-3" />
      <p className="text-sm font-medium text-muted-foreground mb-3">Failed to load stats</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
        >
          Try again
        </button>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────

export function StatsCardsEmpty() {
  return (
    <div className="rounded-xl border bg-card p-8 text-center">
      <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">No stats available yet</p>
    </div>
  );
}
