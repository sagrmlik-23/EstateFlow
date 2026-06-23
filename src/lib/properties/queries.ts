// ============================================================================
// EstateFlow CRM — Property Queries (Data Access Layer)
// Phase 2: Core CRM — Agent-2-2-API-Properties
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import type { PaginationParams, PaginationMeta, ApiResponse } from '@/lib/types';
import type { PropertyTypeValue, AvailabilityStatusValue } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PropertyRow {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  price: number;
  area_sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  property_type: string;
  availability_status: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  images: string[] | null;
  amenities: string[] | null;
  owner_name: string | null;
  owner_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyFilters {
  property_type?: PropertyTypeValue;
  availability_status?: AvailabilityStatusValue;
  price_min?: number;
  price_max?: number;
  bedrooms?: number;
  bathrooms?: number;
  area_min?: number;
  area_max?: number;
  location?: string;
  amenities?: string[];
}

export interface CreatePropertyInput {
  title: string;
  description?: string | null;
  price: number;
  area_sqft?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  property_type: PropertyTypeValue;
  availability_status?: AvailabilityStatusValue;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  images?: string[] | null;
  amenities?: string[] | null;
  owner_name?: string | null;
  owner_phone?: string | null;
}

export interface UpdatePropertyInput {
  title?: string;
  description?: string | null;
  price?: number;
  area_sqft?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  property_type?: PropertyTypeValue;
  availability_status?: AvailabilityStatusValue;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  images?: string[] | null;
  amenities?: string[] | null;
  owner_name?: string | null;
  owner_phone?: string | null;
}

export interface PropertyStats {
  total_properties: number;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
  price_range: {
    min: number;
    max: number;
    avg: number;
  };
  total_bedrooms_breakdown: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Supabase client (lazy init)
// ---------------------------------------------------------------------------

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('[properties/queries] Supabase not configured');
    return null;
  }

  supabaseClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
}

// ---------------------------------------------------------------------------
// Build API response helpers
// ---------------------------------------------------------------------------

function successResponse<T>(
  data: T,
  meta?: PaginationMeta | null,
): ApiResponse<T> {
  return { success: true, data, error: null, meta: meta ?? null };
}

function errorResponse<T>(error: string): ApiResponse<T> {
  return { success: false, data: null, error, meta: null };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * List properties for a tenant with optional filters and pagination.
 */
export async function getProperties(
  tenantId: string,
  filters: PropertyFilters = {},
  pagination: PaginationParams = { page: 1, limit: 20, offset: 0 },
): Promise<ApiResponse<PropertyRow[]>> {
  const supabase = getSupabase();
  if (!supabase) {
    return errorResponse('Database client not available');
  }

  try {
    let query = supabase
      .from('properties')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId);

    // Apply filters
    if (filters.property_type) {
      query = query.eq('property_type', filters.property_type);
    }
    if (filters.availability_status) {
      query = query.eq('availability_status', filters.availability_status);
    }
    if (filters.price_min !== undefined) {
      query = query.gte('price', filters.price_min);
    }
    if (filters.price_max !== undefined) {
      query = query.lte('price', filters.price_max);
    }
    if (filters.bedrooms !== undefined) {
      query = query.eq('bedrooms', filters.bedrooms);
    }
    if (filters.bathrooms !== undefined) {
      query = query.eq('bathrooms', filters.bathrooms);
    }
    if (filters.area_min !== undefined) {
      query = query.gte('area_sqft', filters.area_min);
    }
    if (filters.area_max !== undefined) {
      query = query.lte('area_sqft', filters.area_max);
    }
    if (filters.location) {
      query = query.ilike('location', `%${filters.location}%`);
    }
    if (filters.amenities && filters.amenities.length > 0) {
      // Supabase array contains: check if any of the requested amenities overlap
      // We use the `overlaps` operator for array columns
      query = query.overlaps('amenities', filters.amenities);
    }

    // Apply pagination
    const from = pagination.offset;
    const to = pagination.offset + pagination.limit - 1;
    query = query.range(from, to).order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      console.error('[properties/getProperties]', error);
      return errorResponse(error.message);
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / pagination.limit);

    const meta: PaginationMeta = {
      page: pagination.page,
      limit: pagination.limit,
      total,
      total_pages: totalPages,
    };

    return successResponse((data as PropertyRow[]) ?? [], meta);
  } catch (err) {
    console.error('[properties/getProperties]', err);
    return errorResponse('An unexpected error occurred');
  }
}

/**
 * Get a single property by ID.
 */
export async function getPropertyById(
  propertyId: string,
): Promise<ApiResponse<PropertyRow | null>> {
  const supabase = getSupabase();
  if (!supabase) {
    return errorResponse('Database client not available');
  }

  try {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', propertyId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return successResponse(null, null);
      }
      console.error('[properties/getPropertyById]', error);
      return errorResponse(error.message);
    }

    return successResponse(data as PropertyRow, null);
  } catch (err) {
    console.error('[properties/getPropertyById]', err);
    return errorResponse('An unexpected error occurred');
  }
}

/**
 * Create a new property record.
 */
export async function createProperty(
  tenantId: string,
  data: CreatePropertyInput,
): Promise<ApiResponse<PropertyRow | null>> {
  const supabase = getSupabase();
  if (!supabase) {
    return errorResponse('Database client not available');
  }

  try {
    const { data: newProperty, error } = await (supabase
      .from('properties') as any)
      .insert({
        tenant_id: tenantId,
        title: data.title,
        description: data.description ?? null,
        price: data.price,
        area_sqft: data.area_sqft ?? null,
        bedrooms: data.bedrooms ?? null,
        bathrooms: data.bathrooms ?? null,
        property_type: data.property_type,
        availability_status: data.availability_status ?? 'available',
        location: data.location ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        images: data.images ?? null,
        amenities: data.amenities ?? null,
        owner_name: data.owner_name ?? null,
        owner_phone: data.owner_phone ?? null,
      } as any)
      .select()
      .single();

    if (error) {
      console.error('[properties/createProperty]', error);
      return errorResponse(error.message);
    }

    return successResponse(newProperty as PropertyRow, null);
  } catch (err) {
    console.error('[properties/createProperty]', err);
    return errorResponse('An unexpected error occurred');
  }
}

/**
 * Update an existing property record.
 */
export async function updateProperty(
  propertyId: string,
  data: UpdatePropertyInput,
  expectedUpdatedAt?: string,
): Promise<ApiResponse<PropertyRow | null>> {
  const supabase = getSupabase();
  if (!supabase) {
    return errorResponse('Database client not available');
  }

  try {
    // Build update object — only include fields that were actually provided
    const updateFields: Record<string, unknown> = {};

    if (data.title !== undefined) updateFields.title = data.title;
    if (data.description !== undefined) updateFields.description = data.description;
    if (data.price !== undefined) updateFields.price = data.price;
    if (data.area_sqft !== undefined) updateFields.area_sqft = data.area_sqft;
    if (data.bedrooms !== undefined) updateFields.bedrooms = data.bedrooms;
    if (data.bathrooms !== undefined) updateFields.bathrooms = data.bathrooms;
    if (data.property_type !== undefined) updateFields.property_type = data.property_type;
    if (data.availability_status !== undefined) updateFields.availability_status = data.availability_status;
    if (data.location !== undefined) updateFields.location = data.location;
    if (data.latitude !== undefined) updateFields.latitude = data.latitude;
    if (data.longitude !== undefined) updateFields.longitude = data.longitude;
    if (data.images !== undefined) updateFields.images = data.images;
    if (data.amenities !== undefined) updateFields.amenities = data.amenities;
    if (data.owner_name !== undefined) updateFields.owner_name = data.owner_name;
    if (data.owner_phone !== undefined) updateFields.owner_phone = data.owner_phone;

    // Always update the updated_at timestamp
    updateFields.updated_at = new Date().toISOString();

    let query = (supabase.from('properties') as any)
      .update(updateFields)
      .eq('id', propertyId);

    // Optimistic concurrency: only update if the row hasn't changed since last read
    if (expectedUpdatedAt) {
      query = query.eq('updated_at', expectedUpdatedAt);
    }

    const { data: updatedProperty, error } = await query.select().single();

    if (error) {
      if (error.code === 'PGRST116') {
        // PGRST116 = no rows returned; could be not found OR optimistic conflict
        return successResponse(null, null);
      }
      console.error('[properties/updateProperty]', error);
      return errorResponse(error.message);
    }

    return successResponse(updatedProperty as PropertyRow, null);
  } catch (err) {
    console.error('[properties/updateProperty]', err);
    return errorResponse('An unexpected error occurred');
  }
}

/**
 * Delete (archive) a property record.
 * Performs a hard delete from the database.
 */
export async function deleteProperty(
  propertyId: string,
): Promise<ApiResponse<null>> {
  const supabase = getSupabase();
  if (!supabase) {
    return errorResponse('Database client not available');
  }

  try {
    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', propertyId);

    if (error) {
      console.error('[properties/deleteProperty]', error);
      return errorResponse(error.message);
    }

    return successResponse(null, null);
  } catch (err) {
    console.error('[properties/deleteProperty]', err);
    return errorResponse('An unexpected error occurred');
  }
}

/**
 * Full-text search across property title, description, and location.
 *
 * Uses PostgreSQL full-text search via Supabase's `textSearch` or `ilike` fallback.
 * The `tsvector` approach is preferred for production. We use `ilike` as a
 * universal fallback that works without a pre-built index.
 */
export async function searchProperties(
  query: string,
  tenantId: string,
  filters: PropertyFilters = {},
): Promise<ApiResponse<PropertyRow[]>> {
  const supabase = getSupabase();
  if (!supabase) {
    return errorResponse('Database client not available');
  }

  try {
    let dbQuery = supabase
      .from('properties')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .or(
        `title.ilike.%${query}%,description.ilike.%${query}%,location.ilike.%${query}%`,
      );

    // Apply additional filters
    if (filters.property_type) {
      dbQuery = dbQuery.eq('property_type', filters.property_type);
    }
    if (filters.availability_status) {
      dbQuery = dbQuery.eq('availability_status', filters.availability_status);
    }
    if (filters.price_min !== undefined) {
      dbQuery = dbQuery.gte('price', filters.price_min);
    }
    if (filters.price_max !== undefined) {
      dbQuery = dbQuery.lte('price', filters.price_max);
    }
    if (filters.bedrooms !== undefined) {
      dbQuery = dbQuery.eq('bedrooms', filters.bedrooms);
    }

    dbQuery = dbQuery.order('created_at', { ascending: false }).limit(50);

    const { data, error } = await dbQuery;

    if (error) {
      console.error('[properties/searchProperties]', error);
      return errorResponse(error.message);
    }

    return successResponse((data as PropertyRow[]) ?? [], null);
  } catch (err) {
    console.error('[properties/searchProperties]', err);
    return errorResponse('An unexpected error occurred');
  }
}

/**
 * Get property statistics for a tenant.
 *
 * Returns counts by type, status, and price range breakdown.
 */
export async function getPropertyStats(
  tenantId: string,
): Promise<ApiResponse<PropertyStats | null>> {
  const supabase = getSupabase();
  if (!supabase) {
    return errorResponse('Database client not available');
  }

  try {
    // Fetch all properties for the tenant (id, type, status, price, bedrooms)
    const { data, error } = await supabase
      .from('properties')
      .select('property_type, availability_status, price, bedrooms')
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('[properties/getPropertyStats]', error);
      return errorResponse(error.message);
    }

    const rows = (data ?? []) as Array<{
      property_type: string;
      availability_status: string;
      price: number;
      bedrooms: number | null;
    }>;

    // Compute by_type counts
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const bedroomsBreakdown: Record<string, number> = {};

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let totalPrice = 0;

    for (const row of rows) {
      // By type
      const t = row.property_type || 'unknown';
      byType[t] = (byType[t] ?? 0) + 1;

      // By status
      const s = row.availability_status || 'unknown';
      byStatus[s] = (byStatus[s] ?? 0) + 1;

      // Price range
      const price = Number(row.price);
      if (!isNaN(price)) {
        if (price < minPrice) minPrice = price;
        if (price > maxPrice) maxPrice = price;
        totalPrice += price;
      }

      // Bedrooms breakdown
      const bedKey = row.bedrooms != null ? String(row.bedrooms) : 'unspecified';
      bedroomsBreakdown[bedKey] = (bedroomsBreakdown[bedKey] ?? 0) + 1;
    }

    const count = rows.length;
    const avgPrice = count > 0 ? totalPrice / count : 0;

    const stats: PropertyStats = {
      total_properties: count,
      by_type: byType,
      by_status: byStatus,
      price_range: {
        min: count > 0 ? minPrice : 0,
        max: count > 0 ? maxPrice : 0,
        avg: Math.round(avgPrice * 100) / 100,
      },
      total_bedrooms_breakdown: bedroomsBreakdown,
    };

    return successResponse(stats, null);
  } catch (err) {
    console.error('[properties/getPropertyStats]', err);
    return errorResponse('An unexpected error occurred');
  }
}

/**
 * Get available properties for a tenant.
 *
 * Returns only properties with availability_status in ['available', 'for_sale'].
 */
export async function getAvailableProperties(
  tenantId: string,
): Promise<ApiResponse<PropertyRow[]>> {
  const supabase = getSupabase();
  if (!supabase) {
    return errorResponse('Database client not available');
  }

  try {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('availability_status', ['available', 'under_offer'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[properties/getAvailableProperties]', error);
      return errorResponse(error.message);
    }

    return successResponse((data as PropertyRow[]) ?? [], null);
  } catch (err) {
    console.error('[properties/getAvailableProperties]', err);
    return errorResponse('An unexpected error occurred');
  }
}
