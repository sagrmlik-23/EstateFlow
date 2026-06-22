'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
  UserRound,
  Plus,
  RefreshCw,
  AlertCircle,
  Home,
  Phone,
  FileText,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isToday, addMonths, subMonths } from 'date-fns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SiteVisit {
  id: string;
  title: string;
  date: string;
  time: string;
  client_name: string;
  client_phone: string;
  property_address: string;
  agent: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getSiteVisits(): SiteVisit[] {
  return [
    {
      id: '1',
      title: 'Visit to Lakeview Apartment',
      date: '2026-06-21',
      time: '10:00 AM',
      client_name: 'Rajesh Kumar',
      client_phone: '+91-9876543210',
      property_address: 'Lakeview Apartments, Sector 62, Noida',
      agent: 'Rahul Sharma',
      status: 'scheduled',
    },
    {
      id: '2',
      title: 'Villa Tour - Green Valley',
      date: '2026-06-21',
      time: '02:00 PM',
      client_name: 'Anita Desai',
      client_phone: '+91-9876543211',
      property_address: 'Green Valley Villas, Gurgaon',
      agent: 'Priya Patel',
      status: 'scheduled',
    },
    {
      id: '3',
      title: 'Office Space Inspection',
      date: '2026-06-22',
      time: '11:30 AM',
      client_name: 'Vikram Singh',
      client_phone: '+91-9876543212',
      property_address: 'Business Hub, Connaught Place, Delhi',
      agent: 'Amit Singh',
      status: 'scheduled',
    },
    {
      id: '4',
      title: 'Penthouse Showing',
      date: '2026-06-20',
      time: '04:00 PM',
      client_name: 'Sneha Gupta',
      client_phone: '+91-9876543213',
      property_address: 'Skyline Towers, Mumbai',
      agent: 'Rahul Sharma',
      status: 'completed',
    },
  ];
}

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------
function getDaysInMonth(year: number, month: number) {
  const start = startOfMonth(new Date(year, month));
  const end = endOfMonth(new Date(year, month));
  return eachDayOfInterval({ start, end });
}

const VISIT_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------
export default function CalendarPage() {
  const params = useParams<{ tenant: string }>();
  const router = useRouter();
  const tenant = params?.tenant ?? '';

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showVisitDetail, setShowVisitDetail] = useState<SiteVisit | null>(null);

  // Create visit form state
  const [newVisit, setNewVisit] = useState({
    title: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '10:00',
    client_name: '',
    client_phone: '',
    property_address: '',
    notes: '',
  });

  const fetchVisits = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 500));
      setVisits(getSiteVisits());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load visits');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  const days = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const firstDayOfWeek = getDay(days[0]!);
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const todayVisits = visits.filter((v) => isSameDay(new Date(v.date), new Date()));

  const getVisitsForDay = (day: Date) =>
    visits.filter((v) => isSameDay(new Date(v.date), day));

  const handleDayClick = (day: Date) => {
    setSelectedDay(day);
    const dayVisits = getVisitsForDay(day);
    if (dayVisits.length > 0) {
      setShowVisitDetail(dayVisits[0]!);
    }
  };

  const handleCreateVisit = async () => {
    // Mock creation
    await new Promise((r) => setTimeout(r, 500));
    setShowCreateDialog(false);
    setNewVisit({
      title: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      time: '10:00',
      client_name: '',
      client_phone: '',
      property_address: '',
      notes: '',
    });
    fetchVisits();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-pulse">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-6 w-64 rounded bg-muted" />
          <div className="h-[400px] rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-4 inline-block">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Failed to load calendar</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={fetchVisits}>
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
            <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
            <p className="text-sm text-muted-foreground">
              Schedule and manage site visits
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Visit
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar View */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    {format(currentDate, 'MMMM yyyy')}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setCurrentDate(new Date())}
                    >
                      Today
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {dayNames.map((name) => (
                    <div
                      key={name}
                      className="text-center text-xs font-medium text-muted-foreground py-1"
                    >
                      {name}
                    </div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                    <div key={`empty-${i}`} className="min-h-[70px] sm:min-h-[90px]" />
                  ))}

                  {days.map((day) => {
                    const dayVisits = getVisitsForDay(day);
                    const isTodayDate = isToday(day);
                    const isSelected = selectedDay && isSameDay(day, selectedDay);

                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => handleDayClick(day)}
                        className={cn(
                          'min-h-[70px] sm:min-h-[90px] rounded-md border border-transparent p-1 text-left text-sm transition-colors relative',
                          'hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-ring',
                          isTodayDate && 'border-primary/50 bg-primary/5',
                          isSelected && 'ring-2 ring-primary'
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex items-center justify-center h-6 w-6 rounded-full text-xs',
                            isTodayDate && 'bg-primary text-primary-foreground font-bold'
                          )}
                        >
                          {format(day, 'd')}
                        </span>
                        <div className="mt-1 space-y-0.5">
                          {dayVisits.slice(0, 2).map((v) => (
                            <div
                              key={v.id}
                              className={cn(
                                'text-[10px] leading-tight px-1 py-0.5 rounded truncate',
                                VISIT_STATUS_COLORS[v.status]
                              )}
                            >
                              {v.time} {v.client_name.split(' ')[0]}
                            </div>
                          ))}
                          {dayVisits.length > 2 && (
                            <div className="text-[10px] text-muted-foreground px-1">
                              +{dayVisits.length - 2} more
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Today's Visits Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Today&apos;s Visits
                </CardTitle>
                <CardDescription>
                  {format(new Date(), 'EEEE, MMMM d')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {todayVisits.length === 0 ? (
                  <div className="text-center py-8">
                    <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No visits scheduled today</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {todayVisits.map((visit) => (
                      <button
                        key={visit.id}
                        onClick={() => setShowVisitDetail(visit)}
                        className="w-full text-left rounded-lg border p-3 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm font-medium leading-tight">{visit.title}</p>
                          <Badge
                            variant="outline"
                            className={cn('text-[10px] capitalize', VISIT_STATUS_COLORS[visit.status])}
                          >
                            {visit.status}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {visit.time}
                          </div>
                          <div className="flex items-center gap-1">
                            <UserRound className="h-3 w-3" />
                            {visit.client_name}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{visit.property_address}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Summary Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">This Month</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">
                      {visits.filter((v) => v.status === 'scheduled').length}
                    </p>
                    <p className="text-xs text-muted-foreground">Scheduled</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-600">
                      {visits.filter((v) => v.status === 'completed').length}
                    </p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Create Visit Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Schedule Site Visit</DialogTitle>
              <DialogDescription>
                Fill in the details to create a new site visit
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="title">Visit Title</Label>
                <Input
                  id="title"
                  placeholder="e.g. Visit to Lakeview Apartment"
                  value={newVisit.title}
                  onChange={(e) => setNewVisit((p) => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={newVisit.date}
                    onChange={(e) => setNewVisit((p) => ({ ...p, date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={newVisit.time}
                    onChange={(e) => setNewVisit((p) => ({ ...p, time: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client">Client Name</Label>
                <Input
                  id="client"
                  placeholder="Full name"
                  value={newVisit.client_name}
                  onChange={(e) => setNewVisit((p) => ({ ...p, client_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Client Phone</Label>
                <Input
                  id="phone"
                  placeholder="+91-XXXXXXXXXX"
                  value={newVisit.client_phone}
                  onChange={(e) => setNewVisit((p) => ({ ...p, client_phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Property Address</Label>
                <Input
                  id="address"
                  placeholder="Full property address"
                  value={newVisit.property_address}
                  onChange={(e) => setNewVisit((p) => ({ ...p, property_address: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional notes..."
                  value={newVisit.notes}
                  onChange={(e) => setNewVisit((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateVisit}>Create Visit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Visit Detail Dialog */}
        <Dialog open={!!showVisitDetail} onOpenChange={(o) => !o && setShowVisitDetail(null)}>
          {showVisitDetail && (
            <DialogContent className="sm:max-w-[450px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  {showVisitDetail.title}
                </DialogTitle>
                <DialogDescription>
                  <Badge
                    variant="outline"
                    className={cn('mt-1 capitalize', VISIT_STATUS_COLORS[showVisitDetail.status])}
                  >
                    {showVisitDetail.status}
                  </Badge>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{format(new Date(showVisitDetail.date), 'MMMM d, yyyy')}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{showVisitDetail.time}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{showVisitDetail.client_name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{showVisitDetail.client_phone}</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span>{showVisitDetail.property_address}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>Agent: {showVisitDetail.agent}</span>
                </div>
                {showVisitDetail.notes && (
                  <div className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <span>{showVisitDetail.notes}</span>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowVisitDetail(null)}>
                  Close
                </Button>
                <Button variant="default">Mark as Completed</Button>
              </DialogFooter>
            </DialogContent>
          )}
        </Dialog>
      </div>
    </div>
  );
}
