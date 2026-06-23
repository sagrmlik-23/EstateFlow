// ============================================================================
// EstateFlow CRM — Attendance Database Queries (GPS + Selfie)
// Agent-6-1-Attendance-Calendar v1.0.0
// ============================================================================
//
// All queries operate within a tenant context. Callers are expected to have
// set RLS session variables (via withTenantContext) before invoking these.
//
// Features:
//   - GPS validation — checks if check-in coordinates are within office radius
//   - Anti-fraud — selfie hash check to prevent image reuse
//   - Monthly stats with present/late/absent breakdown
//
// ============================================================================

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AttendanceRow {
  id: string;
  tenant_id: string;
  user_id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  latitude: number | null;
  longitude: number | null;
  selfie_url: string | null;
  selfie_hash: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarkAttendanceInput {
  date: string;             // ISO date YYYY-MM-DD
  checkIn?: string | null;  // ISO datetime
  checkOut?: string | null; // ISO datetime
  latitude?: number | null;
  longitude?: number | null;
  selfieUrl?: string | null;
  status?: string;          // present | absent | late | half_day | leave | holiday
  notes?: string | null;
}

export interface AttendanceStats {
  total_days: number;
  present: number;
  absent: number;
  late: number;
  half_day: number;
  leave: number;
  holiday: number;
  late_percentage: number;
  attendance_percentage: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default office location and radius for GPS-based attendance validation.
 *  These should be overridden per-tenant via tenant settings. */
const DEFAULT_OFFICE_LATITUDE = 19.0760;   // Mumbai reference
const DEFAULT_OFFICE_LONGITUDE = 72.8777;
const DEFAULT_OFFICE_RADIUS_METERS = 500;   // 500m geo-fence

// ---------------------------------------------------------------------------
// Supabase client helper
// ---------------------------------------------------------------------------

let _supabase: ReturnType<typeof createClient> | null = null;

function getDb() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.',
    );
  }

  _supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _supabase;
}

// ---------------------------------------------------------------------------
// GPS Validation
// ---------------------------------------------------------------------------

/**
 * Haversine distance between two GPS coordinates in meters.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Validate if the given GPS coordinates are within the office geo-fence radius.
 *
 * @param latitude  - User's check-in latitude
 * @param longitude - User's check-in longitude
 * @param officeLat - Office latitude (or null for default)
 * @param officeLng - Office longitude (or null for default)
 * @param radiusM   - Allowed radius in meters (or null for default)
 * @returns Object with `withinRange` boolean and `distanceMeters`
 */
export function validateGpsLocation(
  latitude: number,
  longitude: number,
  officeLat?: number | null,
  officeLng?: number | null,
  radiusM?: number | null,
): { withinRange: boolean; distanceMeters: number } {
  const lat = officeLat ?? DEFAULT_OFFICE_LATITUDE;
  const lng = officeLng ?? DEFAULT_OFFICE_LONGITUDE;
  const radius = radiusM ?? DEFAULT_OFFICE_RADIUS_METERS;

  const distance = haversineDistance(latitude, longitude, lat, lng);

  return {
    withinRange: distance <= radius,
    distanceMeters: Math.round(distance * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Selfie Anti-Fraud
// ---------------------------------------------------------------------------

/**
 * Simple hash function for selfie URLs to detect reuse.
 * Uses a substring-based approach — in production, use a proper hash (SHA-256).
 */
export function hashSelfieUrl(url: string): string {
  // Simple deterministic hash — replace with crypto.subtle.digest in production
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `selfie_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

/**
 * Check if a selfie hash has already been used (anti-fraud).
 *
 * @param tenantId  - Tenant UUID
 * @param selfieHash - Hash of the selfie URL
 * @returns True if the selfie hash already exists in another attendance record
 */
export async function isSelfieReused(
  tenantId: string,
  selfieHash: string,
): Promise<boolean> {
  const supabase = getDb();

  const { data, error } = await (supabase.from('attendance') as any)
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('selfie_hash', selfieHash)
    .limit(1);

  if (error) {
    console.error('[attendance/queries] isSelfieReused error:', error);
    return false; // Fail open — allow if check fails
  }

  return (data as unknown[])?.length > 0;
}

// ---------------------------------------------------------------------------
// 1. markAttendance — INSERT or UPSERT attendance for a given user + date
// ---------------------------------------------------------------------------

export async function markAttendance(
  tenantId: string,
  userId: string,
  data: MarkAttendanceInput,
): Promise<AttendanceRow> {
  const supabase = getDb();

  // --- GPS validation ---
  let gpsNotes: string | null = null;
  if (data.latitude != null && data.longitude != null) {
    const gpsResult = validateGpsLocation(data.latitude, data.longitude);
    if (!gpsResult.withinRange) {
      gpsNotes = `GPS_OUT_OF_RANGE: ${gpsResult.distanceMeters}m from office`;
    } else {
      gpsNotes = `GPS_OK: ${gpsResult.distanceMeters}m from office`;
    }
  }

  // --- Selfie anti-fraud ---
  let selfieHash: string | null = null;
  if (data.selfieUrl) {
    selfieHash = hashSelfieUrl(data.selfieUrl);
    const reused = await isSelfieReused(tenantId, selfieHash);
    if (reused) {
      throw new Error('Selfie image has already been used. Please take a new photo.');
    }
  }

  // --- Build combined notes ---
  const combinedNotes = [data.notes, gpsNotes].filter(Boolean).join(' | ') || null;

  // --- Upsert using transactional RPC ---
  try {
    const { data: result, error } = await (supabase as any).rpc('mark_attendance_transactional', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_date: data.date,
      p_clock_in: data.checkIn ?? null,
      p_clock_out: data.checkOut ?? null,
      p_latitude: data.latitude ?? null,
      p_longitude: data.longitude ?? null,
      p_selfie_url: data.selfieUrl ?? null,
      p_selfie_hash: selfieHash,
      p_status: data.status ?? 'present',
      p_notes: combinedNotes,
    } as any);

    if (error) {
      console.error('[attendance/queries] markAttendance (rpc) error:', error);
      throw new Error(`Failed to mark attendance: ${error.message}`);
    }

    return result as unknown as AttendanceRow;
  } catch (rpcErr: any) {
    // Fallback: if RPC function doesn't exist yet, use direct upsert
    if (rpcErr?.message?.includes('function') || rpcErr?.code === '42883') {
      console.warn('[attendance/queries] markAttendance: RPC function not found, falling back to direct upsert');

      const insertData: Record<string, any> = {
        tenant_id: tenantId,
        user_id: userId,
        date: data.date,
        clock_in: data.checkIn ?? null,
        clock_out: data.checkOut ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        selfie_url: data.selfieUrl ?? null,
        selfie_hash: selfieHash,
        status: data.status ?? 'present',
        notes: combinedNotes,
        updated_at: new Date().toISOString(),
      };

      const { data: result, error } = await (supabase.from('attendance') as any)
        .upsert(insertData, {
          onConflict: 'tenant_id,user_id,date',
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (error) {
        console.error('[attendance/queries] markAttendance error:', error);
        throw new Error(`Failed to mark attendance: ${error.message}`);
      }

      return result as AttendanceRow;
    }
    throw rpcErr;
  }
}

// ---------------------------------------------------------------------------
// 2. getAttendance — Attendance records for a user within a date range
// ---------------------------------------------------------------------------

export async function getAttendance(
  tenantId: string,
  userId: string,
  dateFrom: string,
  dateTo: string,
): Promise<AttendanceRow[]> {
  const supabase = getDb();

  const { data, error } = await (supabase.from('attendance') as any)
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date', { ascending: false });

  if (error) {
    console.error('[attendance/queries] getAttendance error:', error);
    throw new Error(`Failed to fetch attendance: ${error.message}`);
  }

  return (data as AttendanceRow[]) || [];
}

// ---------------------------------------------------------------------------
// 3. getTodayAttendance — Today's attendance record for a user
// ---------------------------------------------------------------------------

export async function getTodayAttendance(
  tenantId: string,
  userId: string,
): Promise<AttendanceRow | null> {
  const supabase = getDb();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await (supabase.from('attendance') as any)
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('[attendance/queries] getTodayAttendance error:', error);
    throw new Error(`Failed to fetch today's attendance: ${error.message}`);
  }

  return data as AttendanceRow;
}

// ---------------------------------------------------------------------------
// 4. getTeamAttendance — All team members' attendance for a given date
// ---------------------------------------------------------------------------

export interface TeamAttendanceRecord extends AttendanceRow {
  user_full_name?: string;
  user_email?: string;
  user_role?: string;
  user_avatar_url?: string | null;
}

export async function getTeamAttendance(
  tenantId: string,
  date: string,
): Promise<TeamAttendanceRecord[]> {
  const supabase = getDb();

  const { data, error } = await (supabase.from('attendance') as any)
    .select('*, users!inner(full_name, email, role, avatar_url)')
    .eq('tenant_id', tenantId)
    .eq('date', date)
    .order('clock_in', { ascending: true });

  if (error) {
    console.error('[attendance/queries] getTeamAttendance error:', error);
    throw new Error(`Failed to fetch team attendance: ${error.message}`);
  }

  // Flatten joined user fields
  return ((data as any[]) || []).map((row) => {
    const user = row.users as Record<string, unknown> | null;
    const flat: TeamAttendanceRecord = {
      id: row.id,
      tenant_id: row.tenant_id,
      user_id: row.user_id,
      date: row.date,
      clock_in: row.clock_in ?? null,
      clock_out: row.clock_out ?? null,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      selfie_url: row.selfie_url ?? null,
      selfie_hash: row.selfie_hash ?? null,
      status: row.status,
      notes: row.notes ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      user_full_name: user?.full_name as string | undefined,
      user_email: user?.email as string | undefined,
      user_role: user?.role as string | undefined,
      user_avatar_url: user?.avatar_url as string | null | undefined,
    };
    return flat;
  });
}

// ---------------------------------------------------------------------------
// 5. getAttendanceStats — Monthly attendance statistics
// ---------------------------------------------------------------------------

export async function getAttendanceStats(
  tenantId: string,
  userId: string,
  month: string, // e.g. '2024-03'
): Promise<AttendanceStats> {
  const supabase = getDb();

  // Calculate month boundaries
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr!, 10);
  const mon = parseInt(monthStr!, 10);
  const dateFrom = `${year}-${String(mon).padStart(2, '0')}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const dateTo = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { data, error } = await (supabase.from('attendance') as any)
    .select('status')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .gte('date', dateFrom)
    .lte('date', dateTo);

  if (error) {
    console.error('[attendance/queries] getAttendanceStats error:', error);
    throw new Error(`Failed to fetch attendance stats: ${error.message}`);
  }

  const records = (data as { status: string }[]) || [];

  // Calculate total working days in the month range (exclude weekends)
  let totalCalendarDays = 0;
  const startDate = new Date(year, mon - 1, 1);
  const endDate = new Date(year, mon - 1, lastDay);
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip Saturday (6) and Sunday (0)
      totalCalendarDays++;
    }
  }

  const stats: AttendanceStats = {
    total_days: totalCalendarDays,
    present: 0,
    absent: 0,
    late: 0,
    half_day: 0,
    leave: 0,
    holiday: 0,
    late_percentage: 0,
    attendance_percentage: 0,
  };

  for (const record of records) {
    switch (record.status) {
      case 'present':
        stats.present++;
        break;
      case 'absent':
        stats.absent++;
        break;
      case 'late':
        stats.late++;
        break;
      case 'half_day':
        stats.half_day++;
        break;
      case 'leave':
        stats.leave++;
        break;
      case 'holiday':
        stats.holiday++;
        break;
    }
  }

  const attendedDays = stats.present + stats.late + stats.half_day;
  stats.attendance_percentage =
    stats.total_days > 0
      ? Math.round((attendedDays / stats.total_days) * 10000) / 100
      : 0;
  stats.late_percentage =
    stats.total_days > 0
      ? Math.round((stats.late / stats.total_days) * 10000) / 100
      : 0;

  return stats;
}

// ---------------------------------------------------------------------------
// 6. updateAttendance — Update an existing attendance record (e.g. clock-out)
// ---------------------------------------------------------------------------

export async function updateAttendance(
  attendanceId: string,
  data: Partial<MarkAttendanceInput>,
): Promise<AttendanceRow> {
  const supabase = getDb();

  const updateData: Record<string, any> = {};

  if (data.checkIn !== undefined) updateData.clock_in = data.checkIn;
  if (data.checkOut !== undefined) updateData.clock_out = data.checkOut;
  if (data.latitude !== undefined) updateData.latitude = data.latitude;
  if (data.longitude !== undefined) updateData.longitude = data.longitude;
  if (data.selfieUrl !== undefined) updateData.selfie_url = data.selfieUrl;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.notes !== undefined) updateData.notes = data.notes;

  updateData.updated_at = new Date().toISOString();

  const { data: result, error } = await (supabase.from('attendance') as any)
    .update(updateData)
    .eq('id', attendanceId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error(`Attendance record not found: ${attendanceId}`);
    }
    console.error('[attendance/queries] updateAttendance error:', error);
    throw new Error(`Failed to update attendance: ${error.message}`);
  }

  return result as AttendanceRow;
}
