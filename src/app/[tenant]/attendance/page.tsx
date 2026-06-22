'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Clock,
  MapPin,
  Camera,
  CheckCircle2,
  XCircle,
  CalendarDays,
  Users,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  LogIn,
  LogOut,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isToday } from 'date-fns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AttendanceRecord {
  id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: 'present' | 'absent' | 'late' | 'half_day';
  notes?: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  today_status: 'present' | 'absent' | 'late' | 'not_marked';
}

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------
function getTodayStatus(): { status: 'checked_in' | 'checked_out' | 'not_marked'; time?: string } {
  return { status: 'checked_in', time: '09:15 AM' };
}

function getMonthlyAttendance(): AttendanceRecord[] {
  return [
    { id: '1', date: '2026-06-01', check_in: '09:00 AM', check_out: '06:00 PM', status: 'present' },
    { id: '2', date: '2026-06-02', check_in: '09:15 AM', check_out: '06:30 PM', status: 'present' },
    { id: '3', date: '2026-06-03', check_in: '10:00 AM', check_out: '06:15 PM', status: 'late' },
    { id: '4', date: '2026-06-04', check_in: null, check_out: null, status: 'absent' },
    { id: '5', date: '2026-06-07', check_in: '08:45 AM', check_out: '05:30 PM', status: 'present' },
  ];
}

function getTeamAttendance(): TeamMember[] {
  return [
    { id: '1', name: 'Rahul Sharma', role: 'Senior Agent', today_status: 'present' },
    { id: '2', name: 'Priya Patel', role: 'Agent', today_status: 'present' },
    { id: '3', name: 'Amit Singh', role: 'Agent', today_status: 'late' },
    { id: '4', name: 'Sneha Gupta', role: 'Junior Agent', today_status: 'absent' },
    { id: '5', name: 'Vikram Joshi', role: 'Agent', today_status: 'not_marked' },
  ];
}

// ---------------------------------------------------------------------------
// Calendar helper
// ---------------------------------------------------------------------------
function getDaysInMonth(year: number, month: number) {
  const start = startOfMonth(new Date(year, month));
  const end = endOfMonth(new Date(year, month));
  return eachDayOfInterval({ start, end });
}

// ---------------------------------------------------------------------------
// Local cn
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------
export default function AttendancePage() {
  const params = useParams<{ tenant: string }>();
  const tenant = params?.tenant ?? '';

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [todayStatus, setTodayStatus] = useState(getTodayStatus());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [gpsLocation, setGpsLocation] = useState('');

  // Simulate data fetch
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Simulate API call
      await new Promise((r) => setTimeout(r, 600));
      setAttendance(getMonthlyAttendance());
      setTeam(getTeamAttendance());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attendance data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Get current GPS on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsLocation(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
        },
        () => {
          setGpsLocation('Location unavailable');
        }
      );
    } else {
      setGpsLocation('GPS not supported');
    }
  }, []);

  const handleCheckInOut = async () => {
    setIsCheckingIn(true);
    await new Promise((r) => setTimeout(r, 1000));
    if (todayStatus.status === 'checked_in') {
      setTodayStatus({ status: 'checked_out', time: format(new Date(), 'hh:mm a') });
    } else {
      setTodayStatus({ status: 'checked_in', time: format(new Date(), 'hh:mm a') });
    }
    setIsCheckingIn(false);
  };

  const days = getDaysInMonth(currentYear, currentMonth);
  const firstDayOfWeek = getDay(days[0]!);
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-pulse">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-6 w-64 rounded bg-muted" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 rounded-lg bg-muted" />
            ))}
          </div>
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
          <h2 className="text-xl font-semibold mb-2">Failed to load attendance</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    present: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    absent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    late: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    half_day: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">
            Mark your attendance and view team records
          </p>
        </div>

        {/* Today's Status Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Today&apos;s Attendance
            </CardTitle>
            <CardDescription>{format(new Date(), 'EEEE, MMMM d, yyyy')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div
                  className={cn(
                    'rounded-full p-3',
                    todayStatus.status === 'checked_in'
                      ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : todayStatus.status === 'checked_out'
                        ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {todayStatus.status === 'checked_in' ? (
                    <LogIn className="h-6 w-6" />
                  ) : todayStatus.status === 'checked_out' ? (
                    <LogOut className="h-6 w-6" />
                  ) : (
                    <Clock className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <p className="font-medium">
                    {todayStatus.status === 'checked_in'
                      ? 'Checked In'
                      : todayStatus.status === 'checked_out'
                        ? 'Checked Out'
                        : 'Not Marked'}
                  </p>
                  {todayStatus.time && (
                    <p className="text-sm text-muted-foreground">
                      {todayStatus.status === 'checked_in'
                        ? `Since ${todayStatus.time}`
                        : `At ${todayStatus.time}`}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                {gpsLocation && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span className="max-w-[180px] truncate">{gpsLocation}</span>
                  </div>
                )}
                <Button
                  size="sm"
                  variant={todayStatus.status === 'checked_in' ? 'destructive' : 'default'}
                  onClick={handleCheckInOut}
                  disabled={isCheckingIn}
                  className="gap-2"
                >
                  {isCheckingIn ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    todayStatus.status === 'checked_in' ? (
                      <LogOut className="h-4 w-4" />
                    ) : (
                      <LogIn className="h-4 w-4" />
                    )
                  )}
                  {todayStatus.status === 'checked_in' ? 'Check Out' : 'Check In'}
                </Button>
              </div>
            </div>

            {/* Selfie / Camera */}
            <div className="mt-4 pt-4 border-t flex items-center gap-3">
              <Button variant="outline" size="sm" className="gap-2">
                <Camera className="h-4 w-4" />
                {todayStatus.status === 'checked_in' ? 'Upload Selfie' : 'Take Selfie'}
              </Button>
              <span className="text-xs text-muted-foreground">
                GPS location-based check-in for verification
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Calendar View */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Monthly Attendance
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[120px] text-center">
                  {format(new Date(currentYear, currentMonth), 'MMMM yyyy')}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
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
              {/* Empty cells for days before month start */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}

              {days.map((day) => {
                const record = attendance.find((a) =>
                  isSameDay(new Date(a.date), day)
                );
                const status = record?.status;
                const isTodayDate = isToday(day);

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'aspect-square rounded-md flex flex-col items-center justify-center text-sm relative',
                      isTodayDate && 'ring-2 ring-primary ring-offset-1',
                      status === 'present' && 'bg-emerald-50 dark:bg-emerald-900/20',
                      status === 'absent' && 'bg-red-50 dark:bg-red-900/20',
                      status === 'late' && 'bg-amber-50 dark:bg-amber-900/20',
                      !status && 'hover:bg-accent/50'
                    )}
                  >
                    <span
                      className={cn(
                        'text-xs',
                        isTodayDate && 'font-bold'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    {status && (
                      <div className="mt-0.5">
                        {status === 'present' && (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        )}
                        {status === 'absent' && (
                          <XCircle className="h-3 w-3 text-red-500" />
                        )}
                        {status === 'late' && (
                          <Clock className="h-3 w-3 text-amber-500" />
                        )}
                        {status === 'half_day' && (
                          <Clock className="h-3 w-3 text-orange-500" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Present</span>
              </div>
              <div className="flex items-center gap-1.5">
                <XCircle className="h-3 w-3 text-red-500" />
                <span className="text-xs text-muted-foreground">Absent</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-amber-500" />
                <span className="text-xs text-muted-foreground">Late</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team Attendance (Manager View) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Attendance — Today
            </CardTitle>
            <CardDescription>
              {team.filter((t) => t.today_status === 'present').length} of {team.length} present
            </CardDescription>
          </CardHeader>
          <CardContent>
            {team.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No team data available</p>
              </div>
            ) : (
              <div className="divide-y">
                {team.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        {member.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.role}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs capitalize',
                        member.today_status === 'present' &&
                          'border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:bg-emerald-900/20',
                        member.today_status === 'absent' &&
                          'border-red-200 text-red-700 bg-red-50 dark:border-red-800 dark:text-red-400 dark:bg-red-900/20',
                        member.today_status === 'late' &&
                          'border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:bg-amber-900/20',
                        member.today_status === 'not_marked' &&
                          'border-gray-200 text-gray-500 bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:bg-gray-900/20'
                      )}
                    >
                      {member.today_status === 'present' && 'Present'}
                      {member.today_status === 'absent' && 'Absent'}
                      {member.today_status === 'late' && 'Late'}
                      {member.today_status === 'not_marked' && 'Not Marked'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
