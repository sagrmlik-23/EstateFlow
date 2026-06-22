'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  CalendarDays,
  UserRound,
  Filter,
  Search,
  Flag,
  ListTodo,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { cn, formatDate, timeAgo } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee: string;
  due_date: string;
  created_at: string;
  completed_at?: string;
  is_overdue: boolean;
  related_to?: string;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getTasks(): Task[] {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  return [
    { id: 't1', title: 'Follow up with Rajesh Kumar regarding site visit', status: 'pending' as const, priority: 'high' as const, assignee: 'Rahul Sharma', due_date: today.toISOString(), created_at: new Date(today.getTime() - 3 * 86400000).toISOString(), is_overdue: false, related_to: 'Lead: Rajesh Kumar' },
    { id: 't2', title: 'Prepare offer letter for Green Park apartment', status: 'in_progress' as const, priority: 'urgent' as const, assignee: 'Priya Patel', due_date: today.toISOString(), created_at: new Date(today.getTime() - 2 * 86400000).toISOString(), is_overdue: false, related_to: 'Deal: 3BHK - Green Park' },
    { id: 't3', title: 'Upload property photos to listing', status: 'pending' as const, priority: 'medium' as const, assignee: 'Amit Singh', due_date: tomorrow.toISOString(), created_at: new Date(today.getTime() - 5 * 86400000).toISOString(), is_overdue: false, related_to: 'Property: Lakeview Apartment' },
    { id: 't4', title: 'Send KYC documents to Anita Desai', status: 'pending' as const, priority: 'medium' as const, assignee: 'Rahul Sharma', due_date: nextWeek.toISOString(), created_at: new Date(today.getTime() - 1 * 86400000).toISOString(), is_overdue: false, related_to: 'Lead: Anita Desai' },
    { id: 't5', title: 'Call Vikram Singh - property inquiry follow-up', status: 'pending' as const, priority: 'high' as const, assignee: 'Amit Singh', due_date: yesterday.toISOString(), created_at: new Date(today.getTime() - 7 * 86400000).toISOString(), is_overdue: true, related_to: 'Lead: Vikram Singh' },
    { id: 't6', title: 'Review monthly expense report', status: 'pending' as const, priority: 'low' as const, assignee: 'Sneha Gupta', due_date: nextWeek.toISOString(), created_at: new Date(today.getTime() - 4 * 86400000).toISOString(), is_overdue: false },
    { id: 't7', title: 'Update property listings on website', status: 'completed' as const, priority: 'medium' as const, assignee: 'Priya Patel', due_date: yesterday.toISOString(), created_at: new Date(today.getTime() - 10 * 86400000).toISOString(), completed_at: yesterday.toISOString(), is_overdue: false },
    { id: 't8', title: 'Schedule team meeting for weekly review', status: 'completed' as const, priority: 'low' as const, assignee: 'Rahul Sharma', due_date: new Date(today.getTime() - 2 * 86400000).toISOString(), created_at: new Date(today.getTime() - 14 * 86400000).toISOString(), completed_at: new Date(today.getTime() - 2 * 86400000).toISOString(), is_overdue: false },
  ];
}

function getAssignees(): string[] {
  return ['Rahul Sharma', 'Priya Patel', 'Amit Singh', 'Sneha Gupta', 'Vikram Joshi'];
}

// ---------------------------------------------------------------------------
// Priority styling
// ---------------------------------------------------------------------------
const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'border-red-400 bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800',
  high: 'border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-800',
  medium: 'border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-800',
  low: 'border-gray-300 bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-700',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400',
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------
export default function TasksPage() {
  const params = useParams<{ tenant: string }>();
  const tenant = params?.tenant ?? '';

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState('my_tasks');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // New task form
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium',
    assignee: '',
    due_date: '',
  });

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 500));
      setTasks(getTasks());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || task.status === statusFilter;
    const matchesPriority = !priorityFilter || task.priority === priorityFilter;
    const matchesAssignee = !assigneeFilter || task.assignee === assigneeFilter;

    // Tab logic
    if (activeTab === 'my_tasks') {
      return matchesSearch && matchesStatus && matchesPriority && matchesAssignee && task.status !== 'completed' && task.status !== 'cancelled';
    }
    return matchesSearch && matchesStatus && matchesPriority && matchesAssignee;
  });

  const overdueCount = tasks.filter((t) => t.is_overdue && t.status !== 'completed').length;
  const pendingCount = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress').length;

  const handleToggleStatus = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          if (t.status === 'completed') {
            return { ...t, status: 'pending', completed_at: undefined };
          }
          return { ...t, status: 'completed', completed_at: new Date().toISOString() };
        }
        return t;
      })
    );
  };

  const handleCreateTask = async () => {
    await new Promise((r) => setTimeout(r, 300));
    setShowCreateDialog(false);
    setNewTask({ title: '', description: '', priority: 'medium', assignee: '', due_date: '' });
    fetchTasks();
  };

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-pulse">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="flex gap-3">
            <div className="h-10 w-32 rounded bg-muted" />
            <div className="h-10 w-32 rounded bg-muted" />
            <div className="h-10 w-32 rounded bg-muted" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-muted" />
            ))}
          </div>
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
          <h2 className="text-xl font-semibold mb-2">Failed to load tasks</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={fetchTasks}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ListTodo className="h-6 w-6" />
              Tasks
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage your tasks and to-dos
            </p>
          </div>
          <div className="flex items-center gap-2">
            {overdueCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {overdueCount} overdue
              </Badge>
            )}
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Task
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="my_tasks" className="relative">
                My Tasks
                {pendingCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="all_tasks">All Tasks</TabsTrigger>
            </TabsList>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 w-[160px] text-xs"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-[120px] text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="h-9 w-[120px] text-xs">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Priority</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger className="h-9 w-[130px] text-xs">
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Assignees</SelectItem>
                  {getAssignees().map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator className="my-4" />

          {/* My Tasks */}
          <TabsContent value="my_tasks" className="space-y-2 mt-0">
            {filteredTasks.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                <h3 className="text-base font-medium mb-1">All caught up!</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery || statusFilter || priorityFilter
                    ? 'No tasks match your filters'
                    : 'No pending tasks. Create a new one to get started.'}
                </p>
                {!searchQuery && !statusFilter && !priorityFilter && (
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    New Task
                  </Button>
                )}
              </div>
            ) : (
              filteredTasks.map((task) => (
                <TaskRow key={task.id} task={task} onToggleStatus={handleToggleStatus} />
              ))
            )}
          </TabsContent>

          {/* All Tasks */}
          <TabsContent value="all_tasks" className="space-y-2 mt-0">
            {filteredTasks.length === 0 ? (
              <div className="text-center py-12">
                <ListTodo className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-base font-medium mb-1">No tasks found</h3>
                <p className="text-sm text-muted-foreground">
                  {searchQuery || statusFilter || priorityFilter || assigneeFilter
                    ? 'Try adjusting your filters'
                    : 'Create your first task'}
                </p>
              </div>
            ) : (
              filteredTasks.map((task) => (
                <TaskRow key={task.id} task={task} onToggleStatus={handleToggleStatus} />
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Create Task Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
              <DialogDescription>
                Add a new task to keep track of your work
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="taskTitle">Task Title</Label>
                <Input
                  id="taskTitle"
                  placeholder="Enter task title"
                  value={newTask.title}
                  onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="taskDesc">Description (optional)</Label>
                <Textarea
                  id="taskDesc"
                  placeholder="Add more details..."
                  value={newTask.description}
                  onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="taskPriority">Priority</Label>
                  <Select
                    value={newTask.priority}
                    onValueChange={(v) => setNewTask((p) => ({ ...p, priority: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taskAssignee">Assignee</Label>
                  <Select
                    value={newTask.assignee}
                    onValueChange={(v) => setNewTask((p) => ({ ...p, assignee: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAssignees().map((name) => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="taskDue">Due Date</Label>
                <Input
                  id="taskDue"
                  type="date"
                  value={newTask.due_date}
                  onChange={(e) => setNewTask((p) => ({ ...p, due_date: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTask} disabled={!newTask.title}>
                Create Task
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task Row Component
// ---------------------------------------------------------------------------
function TaskRow({
  task,
  onToggleStatus,
}: {
  task: Task;
  onToggleStatus: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/30',
        task.is_overdue && 'border-red-200 dark:border-red-900/50'
      )}
    >
      <div className="pt-0.5">
        <Checkbox
          checked={task.status === 'completed'}
          onCheckedChange={() => onToggleStatus(task.id)}
          className={cn(
            task.status === 'completed' && 'text-emerald-500 border-emerald-500'
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              'text-sm font-medium leading-tight',
              task.status === 'completed' && 'line-through text-muted-foreground'
            )}
          >
            {task.title}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {task.is_overdue && task.status !== 'completed' && (
              <Badge variant="destructive" className="text-[10px] h-5 gap-0.5">
                <AlertTriangle className="h-3 w-3" />
                Overdue
              </Badge>
            )}
            <Badge
              variant="outline"
              className={cn('text-[10px] h-5 capitalize', PRIORITY_STYLES[task.priority])}
            >
              <Flag className="h-2.5 w-2.5 mr-0.5" />
              {task.priority}
            </Badge>
            <Badge
              variant="outline"
              className={cn('text-[10px] h-5 capitalize', STATUS_STYLES[task.status])}
            >
              {task.status === 'in_progress' ? 'In Progress' : task.status}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <UserRound className="h-3 w-3" />
            {task.assignee}
          </div>
          <div className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            Due {formatDate(task.due_date)}
          </div>
          {task.related_to && <span className="text-xs">· {task.related_to}</span>}
        </div>
      </div>
    </div>
  );
}
