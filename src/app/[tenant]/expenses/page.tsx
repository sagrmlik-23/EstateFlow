'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Plus,
  RefreshCw,
  AlertCircle,
  DollarSign,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  UserRound,
  CalendarDays,
  PieChart,
  Receipt,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { cn, formatPrice, formatDate } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  description?: string;
  submitted_by: string;
  submitted_at: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_by?: string;
  approved_at?: string;
  receipt_url?: string;
}

interface CategoryStat {
  category: string;
  total: number;
  count: number;
  percentage: number;
  color: string;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getExpenses(): Expense[] {
  return [
    { id: 'e1', title: 'Client Lunch Meeting', amount: 2500, category: 'food', description: 'Lunch with Rajesh Kumar at Olive Garden', submitted_by: 'Rahul Sharma', submitted_at: '2026-06-20T12:30:00Z', status: 'pending' },
    { id: 'e2', title: 'Fuel for Site Visit', amount: 1800, category: 'travel', description: 'Round trip to Green Valley project', submitted_by: 'Priya Patel', submitted_at: '2026-06-19T16:00:00Z', status: 'approved', approved_by: 'Manager', approved_at: '2026-06-20T10:00:00Z' },
    { id: 'e3', title: 'Printing Brochures', amount: 3500, category: 'office', description: 'Color brochures for Lakeview property', submitted_by: 'Amit Singh', submitted_at: '2026-06-18T11:00:00Z', status: 'approved', approved_by: 'Manager', approved_at: '2026-06-19T09:00:00Z' },
    { id: 'e4', title: 'Client Gift - Diwali Hamper', amount: 5000, category: 'client_gifts', description: 'Diwali gift for top 3 clients', submitted_by: 'Sneha Gupta', submitted_at: '2026-06-17T14:30:00Z', status: 'pending' },
    { id: 'e5', title: 'Office Stationery', amount: 1200, category: 'office', description: 'Pens, notepads, folders', submitted_by: 'Sneha Gupta', submitted_at: '2026-06-16T10:00:00Z', status: 'approved', approved_by: 'Manager', approved_at: '2026-06-17T11:00:00Z' },
    { id: 'e6', title: 'Taxi Fare - Airport Pickup', amount: 2200, category: 'travel', description: 'Airport pickup for client from outstation', submitted_by: 'Rahul Sharma', submitted_at: '2026-06-15T08:00:00Z', status: 'rejected', approved_by: 'Manager', approved_at: '2026-06-16T09:00:00Z' },
    { id: 'e7', title: 'Advertisement - Social Media', amount: 8000, category: 'marketing', description: 'Facebook & Instagram ads for June', submitted_by: 'Priya Patel', submitted_at: '2026-06-14T15:00:00Z', status: 'pending' },
    { id: 'e8', title: 'Team Lunch', amount: 4500, category: 'food', description: 'Monthly team lunch', submitted_by: 'Amit Singh', submitted_at: '2026-06-13T13:00:00Z', status: 'approved', approved_by: 'Manager', approved_at: '2026-06-14T10:00:00Z' },
  ];
}

function getCategoryStats(expenses: Expense[]): CategoryStat[] {
  const categoryTotals: Record<string, { total: number; count: number }> = {};
  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  expenses.forEach((e) => {
    const existing = categoryTotals[e.category];
    if (existing) {
      existing.total += e.amount;
      existing.count += 1;
    } else {
      categoryTotals[e.category] = { total: e.amount, count: 1 };
    }
  });

  const colors: Record<string, string> = {
    food: 'bg-orange-500',
    travel: 'bg-blue-500',
    office: 'bg-gray-500',
    client_gifts: 'bg-purple-500',
    marketing: 'bg-pink-500',
  };

  return Object.entries(categoryTotals).map(([category, data]) => ({
    category,
    total: data.total,
    count: data.count,
    percentage: totalAmount > 0 ? Math.round((data.total / totalAmount) * 100) : 0,
    color: colors[category] || 'bg-primary',
  }));
}

const CATEGORY_LABELS: Record<string, string> = {
  food: 'Food & Dining',
  travel: 'Travel',
  office: 'Office Supplies',
  client_gifts: 'Client Gifts',
  marketing: 'Marketing & Ads',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
  rejected: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------
export default function ExpensesPage() {
  const params = useParams<{ tenant: string }>();
  const tenant = params?.tenant ?? '';

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState<Expense | null>(null);

  // New expense form
  const [newExpense, setNewExpense] = useState({
    title: '',
    amount: '',
    category: 'food',
    description: '',
  });

  const fetchExpenses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 500));
      setExpenses(getExpenses());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load expenses');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const filteredExpenses = expenses.filter((e) => {
    const matchesSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || e.status === statusFilter;
    const matchesCategory = !categoryFilter || e.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const categoryStats = getCategoryStats(expenses);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const pendingCount = expenses.filter((e) => e.status === 'pending').length;
  const approvedAmount = expenses.filter((e) => e.status === 'approved').reduce((sum, e) => sum + e.amount, 0);

  const handleCreateExpense = async () => {
    await new Promise((r) => setTimeout(r, 300));
    setShowCreateDialog(false);
    setNewExpense({ title: '', amount: '', category: 'food', description: '' });
    fetchExpenses();
  };

  const handleApprove = async (expenseId: string) => {
    setExpenses((prev) =>
      prev.map((e) =>
        e.id === expenseId
          ? { ...e, status: 'approved' as const, approved_by: 'Manager', approved_at: new Date().toISOString() }
          : e
      )
    );
  };

  const handleReject = async (expenseId: string) => {
    setExpenses((prev) =>
      prev.map((e) =>
        e.id === expenseId ? { ...e, status: 'rejected' as const } : e
      )
    );
  };

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-pulse">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-muted" />
            ))}
          </div>
          <div className="h-64 rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-4 inline-block">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Failed to load expenses</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={fetchExpenses}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Receipt className="h-6 w-6" />
              Expenses
            </h1>
            <p className="text-sm text-muted-foreground">
              Track and manage team expenses
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" />
                {pendingCount} pending approval
              </Badge>
            )}
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Expense
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatPrice(totalExpenses)}</p>
              <p className="text-xs text-muted-foreground mt-1">{expenses.length} submissions</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-600">{formatPrice(approvedAmount)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {expenses.filter((e) => e.status === 'approved').length} items
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-600">
                {formatPrice(expenses.filter((e) => e.status === 'pending').reduce((s, e) => s + e.amount, 0))}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{pendingCount} awaiting review</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Rejected</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">
                {formatPrice(expenses.filter((e) => e.status === 'rejected').reduce((s, e) => s + e.amount, 0))}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {expenses.filter((e) => e.status === 'rejected').length} items
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Stats by Category */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-4 w-4" />
              Expenses by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {categoryStats.map((stat) => (
                <div key={stat.category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{CATEGORY_LABELS[stat.category] || stat.category}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{formatPrice(stat.total)}</span>
                      <span className="text-xs text-muted-foreground w-8 text-right">
                        {stat.percentage}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', stat.color)}
                      style={{ width: `${stat.percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{stat.count} items</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search expenses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Categories</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Expenses List */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">All Expenses</CardTitle>
              <Badge variant="secondary">{filteredExpenses.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {filteredExpenses.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-base font-medium mb-1">No expenses found</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery || statusFilter || categoryFilter
                    ? 'Try adjusting your filters'
                    : 'Submit your first expense to get started'}
                </p>
                {!searchQuery && !statusFilter && !categoryFilter && (
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Expense
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y">
                {filteredExpenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="flex items-center gap-4 py-3 first:pt-0 last:pb-0 hover:bg-accent/30 -mx-2 px-2 rounded transition-colors cursor-pointer"
                    onClick={() => setShowDetailDialog(expense)}
                  >
                    <div className="rounded p-2 bg-muted shrink-0">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{expense.title}</p>
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] h-5 capitalize', STATUS_STYLES[expense.status])}
                        >
                          {expense.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{CATEGORY_LABELS[expense.category] || expense.category}</span>
                        <span>·</span>
                        <span>{expense.submitted_by}</span>
                        <span>·</span>
                        <span>{formatDate(expense.submitted_at)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{formatPrice(expense.amount)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDetailDialog(expense);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Expense Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Expense</DialogTitle>
              <DialogDescription>
                Submit an expense for approval
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="expTitle">Expense Title</Label>
                <Input
                  id="expTitle"
                  placeholder="e.g. Client Lunch Meeting"
                  value={newExpense.title}
                  onChange={(e) => setNewExpense((p) => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="expAmount">Amount (₹)</Label>
                  <Input
                    id="expAmount"
                    type="number"
                    placeholder="0"
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense((p) => ({ ...p, amount: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expCategory">Category</Label>
                  <Select
                    value={newExpense.category}
                    onValueChange={(v) => setNewExpense((p) => ({ ...p, category: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="food">Food & Dining</SelectItem>
                      <SelectItem value="travel">Travel</SelectItem>
                      <SelectItem value="office">Office Supplies</SelectItem>
                      <SelectItem value="client_gifts">Client Gifts</SelectItem>
                      <SelectItem value="marketing">Marketing & Ads</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expDesc">Description (optional)</Label>
                <Textarea
                  id="expDesc"
                  placeholder="Add details about this expense..."
                  value={newExpense.description}
                  onChange={(e) => setNewExpense((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Receipt (optional)</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-accent/50 transition-colors cursor-pointer">
                  <UploadIcon className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Upload receipt image or PDF</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateExpense} disabled={!newExpense.title || !newExpense.amount}>
                Submit for Approval
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Expense Detail Dialog */}
        <Dialog open={!!showDetailDialog} onOpenChange={(o) => !o && setShowDetailDialog(null)}>
          {showDetailDialog && (
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  {showDetailDialog.title}
                </DialogTitle>
                <DialogDescription>
                  <Badge
                    variant="outline"
                    className={cn('mt-1 capitalize', STATUS_STYLES[showDetailDialog.status])}
                  >
                    {showDetailDialog.status}
                  </Badge>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="font-semibold text-lg">{formatPrice(showDetailDialog.amount)}</p>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center gap-2 text-sm">
                  <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>Category: {CATEGORY_LABELS[showDetailDialog.category] || showDetailDialog.category}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>Submitted by: {showDetailDialog.submitted_by}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>Date: {formatDate(showDetailDialog.submitted_at)}</span>
                </div>
                {showDetailDialog.description && (
                  <div className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <span>{showDetailDialog.description}</span>
                  </div>
                )}
                {showDetailDialog.approved_by && (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>
                      {showDetailDialog.status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                      {showDetailDialog.approved_by}
                      {showDetailDialog.approved_at && ` on ${formatDate(showDetailDialog.approved_at)}`}
                    </span>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDetailDialog(null)}>
                  Close
                </Button>
                {showDetailDialog.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        handleReject(showDetailDialog.id);
                        setShowDetailDialog(null);
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        handleApprove(showDetailDialog.id);
                        setShowDetailDialog(null);
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                  </div>
                )}
              </DialogFooter>
            </DialogContent>
          )}
        </Dialog>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simple Upload Icon component (inline SVG to avoid import)
// ---------------------------------------------------------------------------
function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}
