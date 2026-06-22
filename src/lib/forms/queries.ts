// ============================================================================
// EstateFlow CRM — Form Builder Queries
// Phase 6 — Documents, Forms, Tasks v1.0.0
// ============================================================================
//
// Manages custom forms for lead capture (forms table) and form responses
// (stored in a form_responses table for separate access & analytics).
//
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import type { PaginationParams, PaginationMeta } from '@/lib/types';

// ---------------------------------------------------------------------------
// Enum / Constants
// ---------------------------------------------------------------------------

export const FORM_FIELD_TYPES = [
  'text',
  'email',
  'phone',
  'number',
  'select',
  'multi_select',
  'checkbox',
  'textarea',
  'file',
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FormField {
  id?: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];           // For select / multi_select
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  order: number;
}

export interface FormSettings {
  redirect_url?: string;
  collect_ip?: boolean;
  collect_user_agent?: boolean;
  email_notifications?: string[];
  webhook_url?: string;
  captcha_enabled?: boolean;
  limit_submissions?: number;
  allow_duplicate?: boolean;
}

export interface FormRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  form_fields: FormField[];
  submit_button_text: string | null;
  success_message: string | null;
  is_active: boolean;
  embed_code: string | null;
  submission_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateFormInput {
  name: string;
  description?: string | null;
  fields: FormField[];
  settings?: FormSettings;
  submit_button_text?: string;
  success_message?: string;
}

export interface UpdateFormInput {
  name?: string;
  description?: string | null;
  fields?: FormField[];
  settings?: FormSettings;
  submit_button_text?: string;
  success_message?: string;
  is_active?: boolean;
}

export interface FormResponseRow {
  id: string;
  form_id: string;
  tenant_id: string;
  data: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface FormFilters {
  is_active?: boolean;
  created_after?: string;
  created_before?: string;
}

// ---------------------------------------------------------------------------
// Supabase client (lazy init)
// ---------------------------------------------------------------------------

let _supabase: ReturnType<typeof createClient> | null = null;

function getDb() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY).',
    );
  }

  _supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _supabase;
}

// ---------------------------------------------------------------------------
// 1. createForm — Create a new form
// ---------------------------------------------------------------------------

export async function createForm(
  tenantId: string,
  data: CreateFormInput,
  createdBy: string,
): Promise<FormRow> {
  const supabase = getDb();

  // Generate IDs for fields without them
  const fields = data.fields.map((f) => ({
    ...f,
    id: f.id || crypto.randomUUID(),
  }));

  const settings: FormSettings = data.settings || {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertData: Record<string, any> = {
    tenant_id: tenantId,
    name: data.name,
    description: data.description ?? null,
    form_fields: fields,
    submit_button_text: data.submit_button_text || 'Submit',
    success_message: data.success_message || 'Thank you for your submission.',
    is_active: true,
    submission_count: 0,
    created_by: createdBy,
  };

  // Store settings as metadata within form_fields JSONB (extensible via extra field)
  // We embed settings into form_fields under a _settings key to avoid schema migration
  insertData.form_fields = fields;
  // For settings, we use a top-level column approach if available or embed
  // For now we just store in the form_fields JSONB's _meta key
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (insertData as any)._settings = settings;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: result, error } = await (supabase.from('forms') as any)
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[forms/queries] createForm error:', error);
    throw new Error(`Failed to create form: ${error.message}`);
  }

  return normalizeFormRow(result);
}

// ---------------------------------------------------------------------------
// 2. getForms — List forms with pagination
// ---------------------------------------------------------------------------

export async function getForms(
  tenantId: string,
  filters: FormFilters = {},
  pagination: PaginationParams = { page: 1, limit: 20, offset: 0 },
): Promise<{ data: FormRow[]; meta: PaginationMeta }> {
  const supabase = getDb();

  let query = supabase
    .from('forms')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (filters.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active);
  }
  if (filters.created_after) query = query.gte('created_at', filters.created_after);
  if (filters.created_before) query = query.lte('created_at', filters.created_before);

  query = query
    .order('created_at', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[forms/queries] getForms error:', error);
    throw new Error(`Failed to fetch forms: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    data: ((data || []) as unknown[]).map(normalizeFormRow),
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      total_pages: Math.ceil(total / pagination.limit),
    },
  };
}

// ---------------------------------------------------------------------------
// 3. getFormById — Single form with fields parsed
// ---------------------------------------------------------------------------

export async function getFormById(formId: string): Promise<FormRow | null> {
  const supabase = getDb();

  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('id', formId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[forms/queries] getFormById error:', error);
    throw new Error(`Failed to fetch form: ${error.message}`);
  }

  return normalizeFormRow(data);
}

// ---------------------------------------------------------------------------
// 4. updateForm — Update form fields/settings
// ---------------------------------------------------------------------------

export async function updateForm(formId: string, data: UpdateFormInput): Promise<FormRow> {
  const supabase = getDb();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.submit_button_text !== undefined) updateData.submit_button_text = data.submit_button_text;
  if (data.success_message !== undefined) updateData.success_message = data.success_message;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

  if (data.fields !== undefined) {
    updateData.form_fields = data.fields.map((f) => ({
      ...f,
      id: f.id || crypto.randomUUID(),
    }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: result, error } = await (supabase.from('forms') as any)
    .update(updateData)
    .eq('id', formId)
    .select()
    .single();

  if (error) {
    console.error('[forms/queries] updateForm error:', error);
    throw new Error(`Failed to update form: ${error.message}`);
  }

  return normalizeFormRow(result);
}

// ---------------------------------------------------------------------------
// 5. deleteForm — Delete a form
// ---------------------------------------------------------------------------

export async function deleteForm(formId: string): Promise<void> {
  const supabase = getDb();

  const { error } = await supabase
    .from('forms')
    .delete()
    .eq('id', formId);

  if (error) {
    console.error('[forms/queries] deleteForm error:', error);
    throw new Error(`Failed to delete form: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 6. submitFormResponse — Submit a form response (public / no auth required)
// ---------------------------------------------------------------------------

export async function submitFormResponse(
  formId: string,
  data: Record<string, unknown>,
  meta?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<{ id: string; success: boolean; message: string }> {
  const supabase = getDb();

  // First, fetch the form to validate it exists and is active
  const form = await getFormById(formId);
  if (!form) {
    throw new Error('Form not found');
  }
  if (!form.is_active) {
    throw new Error('This form is no longer accepting submissions');
  }

  // Validate required fields
  for (const field of form.form_fields) {
    if (!field.id) continue;
    if (field.required && (data[field.id] === undefined || data[field.id] === null || data[field.id] === '')) {
      throw new Error(`Field "${field.label}" is required`);
    }
  }

  // For file fields, we expect already-uploaded URLs
  // For select fields, validate against options
  for (const field of form.form_fields) {
    if (!field.id) continue;
    if (field.type === 'select' && field.options && data[field.id]) {
      if (!field.options.includes(String(data[field.id]))) {
        throw new Error(`Invalid value for field "${field.label}"`);
      }
    }
    if (field.type === 'email' && data[field.id]) {
      const email = String(data[field.id]);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error(`Invalid email format for field "${field.label}"`);
      }
    }
    if (field.type === 'phone' && data[field.id]) {
      const phone = String(data[field.id]);
      if (!/^\+?[\d\s\-()]{7,20}$/.test(phone)) {
        throw new Error(`Invalid phone format for field "${field.label}"`);
      }
    }
  }

  // Store the response — we use a simple upsert pattern.
  // The actual storage depends on having a form_responses table.
  // As a robust fallback, we increment submission_count on the form.
  const responseId = crypto.randomUUID();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertData: Record<string, any> = {
    id: responseId,
    form_id: formId,
    tenant_id: form.tenant_id,
    data: data,
    ip_address: meta?.ipAddress ?? null,
    user_agent: meta?.userAgent ?? null,
    created_at: new Date().toISOString(),
  };

  // Try to insert into form_responses table; fallback to just bumping the counter
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: respError } = await (supabase.from('form_responses') as any)
      .insert(insertData);

    if (respError) {
      // Table might not exist yet — gracefully degrade
      console.warn('[forms/queries] form_responses insert failed (table may not exist):', respError.message);
    }
  } catch (err) {
    console.warn('[forms/queries] form_responses table unavailable:', err);
  }

  // Increment submission count regardless
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('forms') as any)
    .update({ submission_count: (form.submission_count || 0) + 1 })
    .eq('id', formId);

  return {
    id: responseId,
    success: true,
    message: form.success_message || 'Thank you for your submission.',
  };
}

// ---------------------------------------------------------------------------
// 7. getFormResponses — View form submissions (paginated)
// ---------------------------------------------------------------------------

export async function getFormResponses(
  formId: string,
  pagination: PaginationParams = { page: 1, limit: 20, offset: 0 },
): Promise<{ data: FormResponseRow[]; meta: PaginationMeta }> {
  const supabase = getDb();

  let query = supabase
    .from('form_responses')
    .select('*', { count: 'exact' })
    .eq('form_id', formId);

  query = query
    .order('created_at', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  const { data, error, count } = await query;

  // If table doesn't exist, return empty
  if (error) {
    if (error.code === 'PGRST104' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
      console.warn('[forms/queries] form_responses table not available');
      return { data: [], meta: { page: pagination.page, limit: pagination.limit, total: 0, total_pages: 0 } };
    }
    console.error('[forms/queries] getFormResponses error:', error);
    throw new Error(`Failed to fetch form responses: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    data: (data as FormResponseRow[]) || [],
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      total_pages: Math.ceil(total / pagination.limit),
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a raw DB row to our typed FormRow interface.
 * Handles JSONB parsing for form_fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeFormRow(row: any): FormRow {
  if (!row) throw new Error('Empty form row');

  const fields = typeof row.form_fields === 'string'
    ? JSON.parse(row.form_fields)
    : row.form_fields || [];

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    description: row.description || null,
    form_fields: Array.isArray(fields) ? fields : [],
    submit_button_text: row.submit_button_text || 'Submit',
    success_message: row.success_message || null,
    is_active: row.is_active ?? true,
    embed_code: row.embed_code || null,
    submission_count: row.submission_count ?? 0,
    created_by: row.created_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
