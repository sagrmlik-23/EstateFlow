import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format price in Indian Rupee format: ₹ XX,XX,XXX
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * Format date to readable string
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

/**
 * Format date with time
 */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

/**
 * Get relative time string
 */
export function timeAgo(date: string | Date): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(date);
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '…';
}

/**
 * Status badge color mapping
 */
export function getStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    available: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    sold: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    rented: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    under_offer: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    off_market: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    // Lead statuses
    new: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    contacted: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    qualified: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
    proposal: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    negotiation: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    closed_won: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    closed_lost: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    archived: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  };
  return colorMap[status] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
}

/**
 * Property type label mapping
 */
export function getPropertyTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    apartment: 'Apartment',
    house: 'House',
    villa: 'Villa',
    commercial: 'Commercial',
    land: 'Land',
    penthouse: 'Penthouse',
    studio: 'Studio',
  };
  return labels[type] ?? type;
}

/**
 * Activity type icon name mapping
 */
export function getActivityIconName(type: string): string {
  const icons: Record<string, string> = {
    lead_created: 'UserPlus',
    lead_updated: 'UserCheck',
    lead_assigned: 'UserCog',
    lead_status_changed: 'ArrowRightCircle',
    call_scheduled: 'Phone',
    call_completed: 'PhoneCall',
    call_missed: 'PhoneMissed',
    message_sent: 'MessageSquare',
    deal_closed: 'Award',
    deal_lost: 'XCircle',
    note_added: 'FileText',
    task_completed: 'CheckCircle',
    property_added: 'Home',
    property_updated: 'Edit3',
    property_sold: 'CheckCircle',
    agent_login: 'LogIn',
    webhook_received: 'Webhook',
  };
  return icons[type] ?? 'Circle';
}

/**
 * Mask phone number for display: +91XXXXXX00
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  if (phone.length >= 10) {
    return phone.slice(0, 5) + 'XXXX' + phone.slice(-2);
  }
  return phone;
}

/**
 * Get CSS text color class based on AI score
 */
export function getScoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'text-gray-400';
  if (score >= 81) return 'text-emerald-600';
  if (score >= 61) return 'text-green-600';
  if (score >= 41) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Get CSS background color class based on AI score
 */
export function getScoreBgColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'bg-gray-200';
  if (score >= 81) return 'bg-emerald-500';
  if (score >= 61) return 'bg-green-500';
  if (score >= 41) return 'bg-yellow-500';
  return 'bg-red-500';
}

/**
 * Format lead source for display
 */
export function formatSource(source: string | null | undefined): string {
  if (!source) return '—';
  const labels: Record<string, string> = {
    website: 'Website',
    referral: 'Referral',
    whatsapp: 'WhatsApp',
    facebook: 'Facebook',
    instagram: 'Instagram',
    cold_call: 'Cold Call',
    walk_in: 'Walk-In',
    other: 'Other',
  };
  return labels[source] ?? source;
}
