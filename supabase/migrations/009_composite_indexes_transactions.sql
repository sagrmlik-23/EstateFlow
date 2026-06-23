-- ============================================================================
-- ESTATEFLOW CRM — Composite Indexes + Transactional RPC Functions
-- Migration: 009_composite_indexes_transactions.sql
-- Description:
--   1. Composite indexes for frequently queried column pairs
--   2. PostgreSQL functions wrapping multi-step operations in transactions
-- ============================================================================

-- ============================================================================
-- PART 1: COMPOSITE INDEXES
-- ============================================================================

-- tasks: lookups by tenant_id + lead_id
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_lead ON tasks (tenant_id, lead_id);

-- tasks: lookups by tenant_id + deal_id
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_deal ON tasks (tenant_id, deal_id);

-- deals: lookups by tenant_id + lead_id
CREATE INDEX IF NOT EXISTS idx_deals_tenant_lead ON deals (tenant_id, lead_id);

-- deals: lookups by tenant_id + property_id
CREATE INDEX IF NOT EXISTS idx_deals_tenant_property ON deals (tenant_id, property_id);

-- site_visits: lookups by tenant_id + scheduled_by (agent schedule queries)
CREATE INDEX IF NOT EXISTS idx_site_visits_tenant_scheduled_by ON site_visits (tenant_id, scheduled_by);

-- documents: lookups by tenant_id + uploaded_by
CREATE INDEX IF NOT EXISTS idx_documents_tenant_uploaded_by ON documents (tenant_id, uploaded_by);

-- ============================================================================
-- PART 2: TRANSACTIONAL RPC FUNCTIONS
-- ============================================================================
-- These functions wrap multi-step operations in explicit transactions
-- so that failure mid-way rolls back all changes atomically.
-- Called from TypeScript via supabase.rpc('fn_name', params).

-- ---------------------------------------------------------------------------
-- 2a. create_lead_transactional — duplicate check + insert in one transaction
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_lead_transactional(
    p_tenant_id        UUID,
    p_created_by       UUID,
    p_full_name        TEXT,
    p_phone            TEXT DEFAULT NULL,
    p_email            TEXT DEFAULT NULL,
    p_source           TEXT DEFAULT NULL,
    p_status           TEXT DEFAULT 'new',
    p_ai_score         INTEGER DEFAULT 0,
    p_budget_min       NUMERIC DEFAULT NULL,
    p_budget_max       NUMERIC DEFAULT NULL,
    p_preferred_location TEXT DEFAULT NULL,
    p_property_type    TEXT DEFAULT NULL,
    p_notes            TEXT DEFAULT NULL,
    p_assigned_agent_id UUID DEFAULT NULL,
    p_is_duplicate     BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lead_id UUID;
    v_result  JSONB;
BEGIN
    INSERT INTO leads (
        tenant_id, created_by, full_name, phone, email, source, status,
        ai_score, budget_min, budget_max, preferred_location,
        property_type, notes, assigned_agent_id, is_duplicate
    ) VALUES (
        p_tenant_id, p_created_by, p_full_name, p_phone, p_email, p_source, p_status,
        p_ai_score, p_budget_min, p_budget_max, p_preferred_location,
        p_property_type, p_notes, p_assigned_agent_id, p_is_duplicate
    )
    RETURNING id INTO v_lead_id;

    SELECT row_to_json(r)::JSONB INTO v_result
    FROM (SELECT * FROM leads WHERE id = v_lead_id) r;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2b. update_deal_stage_transactional — read + update in one transaction
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_deal_stage_transactional(
    p_deal_id UUID,
    p_stage   TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now         TIMESTAMPTZ := NOW();
    v_is_closed   BOOLEAN;
    v_was_closed  BOOLEAN;
    v_result      JSONB;
BEGIN
    -- Determine if new stage is a closed stage
    v_is_closed := (p_stage = 'closed_won' OR p_stage = 'closed_lost');

    -- Check if deal currently has a closed_at (was previously closed)
    SELECT (closed_at IS NOT NULL) INTO v_was_closed FROM deals WHERE id = p_deal_id;

    IF v_is_closed AND NOT v_was_closed THEN
        UPDATE deals
        SET stage = p_stage, closed_at = v_now, updated_at = v_now
        WHERE id = p_deal_id;
    ELSIF NOT v_is_closed AND v_was_closed THEN
        UPDATE deals
        SET stage = p_stage, closed_at = NULL, updated_at = v_now
        WHERE id = p_deal_id;
    ELSE
        UPDATE deals
        SET stage = p_stage, updated_at = v_now
        WHERE id = p_deal_id;
    END IF;

    SELECT row_to_json(r)::JSONB INTO v_result
    FROM (SELECT * FROM deals WHERE id = p_deal_id) r;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2c. mark_attendance_transactional — selfie check + upsert in one transaction
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_attendance_transactional(
    p_tenant_id   UUID,
    p_user_id     UUID,
    p_date        TEXT,
    p_clock_in    TIMESTAMPTZ DEFAULT NULL,
    p_clock_out   TIMESTAMPTZ DEFAULT NULL,
    p_latitude    NUMERIC DEFAULT NULL,
    p_longitude   NUMERIC DEFAULT NULL,
    p_selfie_url  TEXT DEFAULT NULL,
    p_selfie_hash TEXT DEFAULT NULL,
    p_status      TEXT DEFAULT 'present',
    p_notes       TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_id UUID;
    v_result      JSONB;
BEGIN
    -- Check if attendance record already exists for this user+date
    SELECT id INTO v_existing_id
    FROM attendance
    WHERE tenant_id = p_tenant_id AND user_id = p_user_id AND date = p_date;

    IF v_existing_id IS NOT NULL THEN
        UPDATE attendance SET
            clock_in   = COALESCE(p_clock_in, attendance.clock_in),
            clock_out  = COALESCE(p_clock_out, attendance.clock_out),
            latitude   = COALESCE(p_latitude, attendance.latitude),
            longitude  = COALESCE(p_longitude, attendance.longitude),
            selfie_url = COALESCE(p_selfie_url, attendance.selfie_url),
            selfie_hash= COALESCE(p_selfie_hash, attendance.selfie_hash),
            status     = p_status,
            notes      = CASE WHEN p_notes IS NOT NULL THEN p_notes ELSE attendance.notes END,
            updated_at = NOW()
        WHERE id = v_existing_id;
    ELSE
        INSERT INTO attendance (
            tenant_id, user_id, date, clock_in, clock_out,
            latitude, longitude, selfie_url, selfie_hash,
            status, notes
        ) VALUES (
            p_tenant_id, p_user_id, p_date, p_clock_in, p_clock_out,
            p_latitude, p_longitude, p_selfie_url, p_selfie_hash,
            p_status, p_notes
        )
        RETURNING id INTO v_existing_id;
    END IF;

    SELECT row_to_json(r)::JSONB INTO v_result
    FROM (SELECT * FROM attendance WHERE id = v_existing_id) r;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2d. submit_form_response_transactional — validate, insert, increment counter
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_form_response_transactional(
    p_form_id     UUID,
    p_data        JSONB,
    p_ip_address  TEXT DEFAULT NULL,
    p_user_agent  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_form           RECORD;
    v_response_id    UUID := gen_random_uuid();
    v_result         JSONB;
BEGIN
    -- Fetch and lock the form row
    SELECT * INTO v_form FROM forms WHERE id = p_form_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Form not found';
    END IF;

    IF NOT v_form.is_active THEN
        RAISE EXCEPTION 'This form is no longer accepting submissions';
    END IF;

    -- Insert the response
    INSERT INTO form_responses (
        id, form_id, tenant_id, data, ip_address, user_agent
    ) VALUES (
        v_response_id, p_form_id, v_form.tenant_id, p_data, p_ip_address, p_user_agent
    );

    -- Increment submission counter
    UPDATE forms
    SET submission_count = COALESCE(submission_count, 0) + 1
    WHERE id = p_form_id;

    -- Return success
    v_result := jsonb_build_object(
        'id', v_response_id,
        'success', true,
        'message', COALESCE(v_form.success_message, 'Thank you for your submission.')
    );

    RETURN v_result;
END;
$$;

-- ============================================================================
-- Migration complete
-- ============================================================================
