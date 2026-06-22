'use client';

import type { ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────

interface DashboardLayoutProps {
  children: ReactNode;
  className?: string;
}

// ─── DashboardLayout Component ────────────────────────────────────────────

/**
 * Responsive grid layout wrapper for dashboard widgets.
 *
 * Layout:
 *   - Mobile (default): 1 column
 *   - Tablet (sm):      2 columns
 *   - Desktop (lg):     3 columns
 *
 * Child elements control their span via col-span-* classes.
 * Full-width items use `col-span-full`.
 */
export function DashboardLayout({ children, className = '' }: DashboardLayoutProps) {
  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6 p-4 sm:p-6 lg:p-8 ${className}`}
    >
      {children}
    </div>
  );
}
