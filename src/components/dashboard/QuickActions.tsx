'use client';

import {
  Plus,
  Users,
  Phone,
  ArrowRight,
  Building2,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────

interface QuickAction {
  label: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  colorClass: string;
  iconBg: string;
}

// ─── Quick Actions ────────────────────────────────────────────────────────

const actions: QuickAction[] = [
  {
    label: 'Add Lead',
    description: 'Create a new lead record',
    icon: <Plus className="h-6 w-6" />,
    href: '/leads/new',
    colorClass: 'text-blue-600',
    iconBg: 'bg-blue-100 group-hover:bg-blue-200',
  },
  {
    label: 'Add Property',
    description: 'List a new property',
    icon: <Building2 className="h-6 w-6" />,
    href: '/properties/new',
    colorClass: 'text-emerald-600',
    iconBg: 'bg-emerald-100 group-hover:bg-emerald-200',
  },
  {
    label: 'View All Leads',
    description: 'Browse and manage leads',
    icon: <Users className="h-6 w-6" />,
    href: '/leads',
    colorClass: 'text-purple-600',
    iconBg: 'bg-purple-100 group-hover:bg-purple-200',
  },
  {
    label: 'Call Agent',
    description: 'Start an AI-powered call',
    icon: <Phone className="h-6 w-6" />,
    href: '/calls',
    colorClass: 'text-orange-600',
    iconBg: 'bg-orange-100 group-hover:bg-orange-200',
  },
];

// ─── QuickActions Component ───────────────────────────────────────────────

export function QuickActions() {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Quick Actions
        </h3>
      </div>

      {/* Action Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
        {actions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="group flex flex-col items-center gap-3 rounded-xl border-2 border-transparent bg-card p-5 text-center transition-all hover:border-primary/20 hover:shadow-md active:scale-[0.98]"
          >
            {/* Icon */}
            <div
              className={`rounded-xl p-3 transition-colors ${action.iconBg} ${action.colorClass}`}
            >
              {action.icon}
            </div>

            {/* Label */}
            <div>
              <p className="text-sm font-semibold group-hover:text-primary transition-colors">
                {action.label}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
                {action.description}
              </p>
            </div>

            {/* Hint */}
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all -ml-2 group-hover:ml-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
