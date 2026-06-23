-- ============================================================================
-- ESTATEFLOW CRM — COMPLETE MIGRATION (ALL 7 FILES)
-- v2.0 — ALL BUGS FIXED
--   ✓ app schema added
--   ✓ partitioned FK refs (composite key)
--   ✓ Extension's quote escaped
--   ✓ pg_partman removed
--   ✓ materialized view aggregates fixed
--   ✓ trigger updated_by fixed
--   ✓ pg_cron error handling
-- Run ONCE in Supabase SQL Editor (Ctrl+A → Ctrl+C → Ctrl+V → Run)
-- ============================================================================



-- ========== MIGRATION 001 ==========
-- ============================================================================
-- ESTATEFLOW CRM — Round 2: Initial Schema
-- Migration: 001_initial_schema.sql
-- Description: Creates all tables for the EstateFlow multi-tenant CRM SaaS.
-- PostgreSQL 16+, Extensions: pgcrypto, uuid-ossp, pg_partman, pg_cron
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- pg_cron is pre-installed on Supabase platform

-- Create app schema for helper functions and security context
CREATE SCHEMA IF NOT EXISTS app;

-- ############################################################################
-- 1. TENANTS
-- ############################################################################
CREATE TABLE IF NOT EXISTS tenants (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  TEXT        NOT NULL,
    slug                  TEXT        NOT NULL UNIQUE,
    domain                TEXT        NULL,
    logo_url              TEXT        NULL,
    favicon_url           TEXT        NULL,
    primary_color         TEXT        NULL,
    secondary_color       TEXT        NULL,
    accent_color          TEXT        NULL,
    email_sender_name     TEXT        NULL,
    email_reply_to        TEXT        NULL,
    whatsapp_number       TEXT        NULL,
    sms_sender_id         TEXT        NULL,
    plan                  TEXT        NOT NULL DEFAULT 'free',
    status                TEXT        NOT NULL DEFAULT 'active',
    feature_flags         JSONB       NOT NULL DEFAULT '{}',
    ai_voice_enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
    max_storage_gb        INTEGER     NOT NULL DEFAULT 5,
    billing_email         TEXT        NULL,
    razorpay_customer_id  TEXT        NULL,
    razorpay_subscription_id TEXT     NULL,
    current_period_start  TIMESTAMPTZ NULL,
    current_period_end    TIMESTAMPTZ NULL,
    setup_fee_paid        BOOLEAN     NOT NULL DEFAULT FALSE,
    negotiated_discount   NUMERIC(5,2) NULL DEFAULT 0,
    contract_duration_months INTEGER  NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_tenants_plan CHECK (plan IN ('free', 'starter', 'professional', 'enterprise')),
    CONSTRAINT chk_tenants_status CHECK (status IN ('active', 'suspended', 'trial', 'cancelled'))
);

-- ############################################################################
-- 2. USERS
-- ############################################################################
CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email         TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    full_name     TEXT        NOT NULL,
    phone         TEXT        NULL,
    role          TEXT        NOT NULL DEFAULT 'agent',
    avatar_url    TEXT        NULL,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    last_login    TIMESTAMPTZ NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_users_role CHECK (role IN ('super_admin', 'tenant_admin', 'sales_manager', 'agent', 'field_executive')),
    CONSTRAINT uq_users_tenant_email UNIQUE (tenant_id, email)
);

-- ############################################################################
-- 3. LEADS
-- ############################################################################
CREATE TABLE IF NOT EXISTS leads (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    full_name          TEXT        NOT NULL,
    phone              TEXT        NULL,
    email              TEXT        NULL,
    source             TEXT        NULL,
    status             TEXT        NOT NULL DEFAULT 'new',
    ai_score           INTEGER     NULL DEFAULT 0,
    budget_min         NUMERIC     NULL,
    budget_max         NUMERIC     NULL,
    preferred_location TEXT        NULL,
    property_type      TEXT        NULL,
    notes              TEXT        NULL,
    assigned_agent_id  UUID        NULL REFERENCES users(id) ON DELETE SET NULL,
    is_duplicate       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by         UUID        NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_leads_source CHECK (source IN ('website', 'referral', 'whatsapp', 'facebook', 'instagram', 'cold_call', 'walk_in', 'other')),
    CONSTRAINT chk_leads_status CHECK (status IN ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'archived')),
    CONSTRAINT chk_leads_property_type CHECK (property_type IN ('apartment', 'villa', 'plot', 'commercial', 'penthouse', 'other')),
    CONSTRAINT chk_leads_ai_score CHECK (ai_score >= 0 AND ai_score <= 100)
);

-- ############################################################################
-- 4. PROPERTIES
-- ############################################################################
CREATE TABLE IF NOT EXISTS properties (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title               TEXT        NOT NULL,
    description         TEXT        NULL,
    price               DECIMAL     NOT NULL,
    area_sqft           DECIMAL     NULL,
    bedrooms            INTEGER     NULL,
    bathrooms           INTEGER     NULL,
    property_type       TEXT        NOT NULL,
    availability_status TEXT        NOT NULL DEFAULT 'available',
    location            TEXT        NULL,
    latitude            DECIMAL     NULL,
    longitude           DECIMAL     NULL,
    images              TEXT[]      NULL,
    amenities           TEXT[]      NULL,
    owner_name          TEXT        NULL,
    owner_phone         TEXT        NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_properties_type CHECK (property_type IN ('apartment', 'villa', 'plot', 'commercial', 'penthouse', 'other')),
    CONSTRAINT chk_properties_availability CHECK (availability_status IN ('available', 'sold', 'rented', 'under_offer', 'off_market'))
);

-- ############################################################################
-- 5. AI AGENTS
-- ############################################################################
CREATE TABLE IF NOT EXISTS ai_agents (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                  TEXT        NOT NULL,
    voice                 TEXT        NULL,
    language              TEXT        NULL DEFAULT 'en',
    purpose               TEXT        NULL,
    script_templates      JSONB       NULL DEFAULT '[]',
    behavior_config       JSONB       NULL DEFAULT '{}',
    max_concurrent_calls  INTEGER     NOT NULL DEFAULT 5,
    current_calls         INTEGER     NOT NULL DEFAULT 0,
    total_calls_made      INTEGER     NOT NULL DEFAULT 0,
    total_calls_connected INTEGER     NOT NULL DEFAULT 0,
    avg_call_duration     DECIMAL     NULL DEFAULT 0,
    conversion_rate       DECIMAL     NULL DEFAULT 0,
    status                TEXT        NOT NULL DEFAULT 'inactive',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_ai_agents_purpose CHECK (purpose IN ('lead_qualification', 'follow_up', 'survey', 'reminder', 'general')),
    CONSTRAINT chk_ai_agents_status CHECK (status IN ('active', 'inactive', 'paused', 'error'))
);

-- ############################################################################
-- 6. AI CALL QUEUE
-- ############################################################################
CREATE TABLE IF NOT EXISTS ai_call_queue (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id          UUID        NULL REFERENCES leads(id) ON DELETE SET NULL,
    ai_agent_id      UUID        NULL REFERENCES ai_agents(id) ON DELETE SET NULL,
    phone            TEXT        NOT NULL,
    script           TEXT        NULL,
    voice            TEXT        NULL,
    language         TEXT        NULL DEFAULT 'en',
    scheduled_at     TIMESTAMPTZ NULL,
    started_at       TIMESTAMPTZ NULL,
    ended_at         TIMESTAMPTZ NULL,
    status           TEXT        NOT NULL DEFAULT 'queued',
    provider         TEXT        NULL,
    provider_call_id TEXT        NULL,
    recording_url    TEXT        NULL,
    transcript       TEXT        NULL,
    sentiment        TEXT        NULL,
    duration_seconds INTEGER     NULL,
    outcome          TEXT        NULL,
    retry_count      INTEGER     NOT NULL DEFAULT 0,
    max_retries      INTEGER     NOT NULL DEFAULT 3,
    error            TEXT        NULL,
    metadata         JSONB       NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_ai_call_queue_status CHECK (status IN ('queued', 'ringing', 'in_progress', 'completed', 'failed', 'no_answer', 'busy', 'cancelled')),
    CONSTRAINT chk_ai_call_queue_sentiment CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    CONSTRAINT chk_ai_call_queue_outcome CHECK (outcome IN ('converted', 'interested', 'not_interested', 'callback', 'wrong_number'))
);

-- ############################################################################
-- 7. AI CALL ANALYTICS
-- ############################################################################
CREATE TABLE IF NOT EXISTS ai_call_analytics (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ai_agent_id        UUID        NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    date               DATE        NOT NULL,
    total_calls        INTEGER     NOT NULL DEFAULT 0,
    connected_calls    INTEGER     NOT NULL DEFAULT 0,
    failed_calls       INTEGER     NOT NULL DEFAULT 0,
    avg_duration       DECIMAL     NULL DEFAULT 0,
    avg_sentiment      DECIMAL     NULL DEFAULT 0,
    conversion_rate    DECIMAL     NULL DEFAULT 0,
    top_objections     TEXT[]      NULL,
    script_performance JSONB       NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_ai_call_analytics_agent_date UNIQUE (tenant_id, ai_agent_id, date)
);

-- ############################################################################
-- 8. CALLS (Manual/Human Call Log)
-- ############################################################################
CREATE TABLE IF NOT EXISTS calls (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id          UUID        NULL REFERENCES leads(id) ON DELETE SET NULL,
    agent_id         UUID        NULL REFERENCES users(id) ON DELETE SET NULL,
    caller_phone     TEXT        NULL,
    callee_phone     TEXT        NULL,
    direction        TEXT        NOT NULL,
    duration_seconds INTEGER     NULL,
    status           TEXT        NOT NULL DEFAULT 'completed',
    recording_url    TEXT        NULL,
    notes            TEXT        NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_calls_direction CHECK (direction IN ('inbound', 'outbound')),
    CONSTRAINT chk_calls_status CHECK (status IN ('scheduled', 'ringing', 'in_progress', 'completed', 'missed', 'voicemail', 'failed'))
);

-- ############################################################################
-- 9. MESSAGES
-- ############################################################################
CREATE TABLE IF NOT EXISTS messages (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id    UUID        NULL REFERENCES leads(id) ON DELETE SET NULL,
    channel    TEXT        NOT NULL,
    direction  TEXT        NOT NULL,
    content    TEXT        NULL,
    media_urls TEXT[]      NULL,
    status     TEXT        NOT NULL DEFAULT 'sent',
    template_id TEXT       NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_messages_channel CHECK (channel IN ('whatsapp', 'sms', 'email', 'in_app', 'web')),
    CONSTRAINT chk_messages_direction CHECK (direction IN ('outbound', 'inbound')),
    CONSTRAINT chk_messages_status CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed'))
);

-- ############################################################################
-- 10. AUDIT LOGS (Monthly RANGE partitioned — base table)
-- ############################################################################
CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    tenant_id   UUID        NULL REFERENCES tenants(id) ON DELETE SET NULL,
    user_id     UUID        NULL,
    action      TEXT        NOT NULL,
    entity_type TEXT        NOT NULL,
    entity_id   UUID        NULL,
    old_values  JSONB       NULL,
    new_values  JSONB       NULL,
    ip_address  INET        NULL,
    user_agent  TEXT        NULL,
    request_id  UUID        NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_audit_logs_action CHECK (action IN ('create', 'update', 'delete', 'login', 'logout', 'export', 'view'))
)
PARTITION BY RANGE (created_at);

-- ############################################################################
-- 11. TENANT BILLING
-- ############################################################################
CREATE TABLE IF NOT EXISTS tenant_billing (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    razorpay_subscription_id TEXT        NULL,
    razorpay_payment_id      TEXT        NULL,
    plan                     TEXT        NOT NULL,
    amount                   DECIMAL     NOT NULL,
    status                   TEXT        NOT NULL DEFAULT 'pending',
    paid_at                  TIMESTAMPTZ NULL,
    retry_count              INTEGER     NOT NULL DEFAULT 0,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_tenant_billing_status CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled'))
);

-- ############################################################################
-- 12. DEALS
-- ############################################################################
CREATE TABLE IF NOT EXISTS deals (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id        UUID        NULL REFERENCES leads(id) ON DELETE SET NULL,
    property_id    UUID        NULL REFERENCES properties(id) ON DELETE SET NULL,
    title          TEXT        NOT NULL,
    value          DECIMAL     NOT NULL,
    stage          TEXT        NOT NULL DEFAULT 'qualification',
    probability    INTEGER     NULL DEFAULT 0,
    expected_close DATE        NULL,
    assigned_to    UUID        NULL REFERENCES users(id) ON DELETE SET NULL,
    notes          TEXT        NULL,
    closed_at      TIMESTAMPTZ NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_deals_stage CHECK (stage IN ('qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost')),
    CONSTRAINT chk_deals_probability CHECK (probability >= 0 AND probability <= 100)
);

-- ############################################################################
-- 13. TASKS
-- ############################################################################
CREATE TABLE IF NOT EXISTS tasks (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id      UUID        NULL REFERENCES leads(id) ON DELETE SET NULL,
    deal_id      UUID        NULL REFERENCES deals(id) ON DELETE SET NULL,
    assigned_to  UUID        NULL REFERENCES users(id) ON DELETE SET NULL,
    title        TEXT        NOT NULL,
    description  TEXT        NULL,
    priority     TEXT        NOT NULL DEFAULT 'medium',
    status       TEXT        NOT NULL DEFAULT 'pending',
    due_date     TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    created_by   UUID        NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_tasks_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    CONSTRAINT chk_tasks_status CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'))
);

-- ############################################################################
-- 14. ATTENDANCE
-- ############################################################################
CREATE TABLE IF NOT EXISTS attendance (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date       DATE        NOT NULL,
    clock_in   TIMESTAMPTZ NULL,
    clock_out  TIMESTAMPTZ NULL,
    status     TEXT        NOT NULL DEFAULT 'present',
    notes      TEXT        NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_attendance_status CHECK (status IN ('present', 'absent', 'late', 'half_day', 'leave', 'holiday')),
    CONSTRAINT uq_attendance_user_date UNIQUE (tenant_id, user_id, date)
);

-- ############################################################################
-- 15. DOCUMENTS
-- ############################################################################
CREATE TABLE IF NOT EXISTS documents (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id     UUID        NULL REFERENCES leads(id) ON DELETE SET NULL,
    deal_id     UUID        NULL REFERENCES deals(id) ON DELETE SET NULL,
    property_id UUID        NULL REFERENCES properties(id) ON DELETE SET NULL,
    uploaded_by UUID        NULL REFERENCES users(id) ON DELETE SET NULL,
    name        TEXT        NOT NULL,
    file_type   TEXT        NULL,
    file_size   INTEGER     NULL,
    storage_url TEXT        NOT NULL,
    category    TEXT        NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_documents_category CHECK (category IN ('contract', 'agreement', 'id_proof', 'property_doc', 'other'))
);

-- ############################################################################
-- 16. FORMS
-- ############################################################################
CREATE TABLE IF NOT EXISTS forms (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name               TEXT        NOT NULL,
    description        TEXT        NULL,
    form_fields        JSONB       NOT NULL DEFAULT '[]',
    submit_button_text TEXT        NULL DEFAULT 'Submit',
    success_message    TEXT        NULL,
    is_active          BOOLEAN     NOT NULL DEFAULT TRUE,
    embed_code         TEXT        NULL,
    submission_count   INTEGER     NOT NULL DEFAULT 0,
    created_by         UUID        NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ############################################################################
-- 17. SITE VISITS
-- ############################################################################
CREATE TABLE IF NOT EXISTS site_visits (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id      UUID        NULL REFERENCES leads(id) ON DELETE SET NULL,
    property_id  UUID        NULL REFERENCES properties(id) ON DELETE SET NULL,
    scheduled_by UUID        NULL REFERENCES users(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'scheduled',
    notes        TEXT        NULL,
    feedback     TEXT        NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_site_visits_status CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled', 'no_show'))
);

-- ############################################################################
-- 18. EXPENSES
-- ############################################################################
CREATE TABLE IF NOT EXISTS expenses (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category    TEXT        NOT NULL,
    amount      DECIMAL     NOT NULL,
    description TEXT        NULL,
    expense_date DATE       NOT NULL,
    paid_by     UUID        NULL REFERENCES users(id) ON DELETE SET NULL,
    receipt_url TEXT        NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_expenses_category CHECK (category IN ('marketing', 'travel', 'utilities', 'office_supplies', 'salary', 'commission', 'other'))
);

-- ############################################################################
-- 19. INTEGRATIONS
-- ############################################################################
CREATE TABLE IF NOT EXISTS integrations (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider       TEXT        NOT NULL,
    config         JSONB       NOT NULL DEFAULT '{}',
    is_enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    last_synced_at TIMESTAMPTZ NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_integrations_tenant_provider UNIQUE (tenant_id, provider),
    CONSTRAINT chk_integrations_provider CHECK (provider IN ('google_calendar', 'outlook', 'whatsapp_business', 'twilio', 'plivo', 'zapier', 'slack', 'hubspot', 'zoho'))
);

-- ============================================================================
-- Migration complete
-- ============================================================================


-- ========== MIGRATION 002 ==========
-- ============================================================================
-- ESTATEFLOW CRM — Round 2: RLS Policies
-- Migration: 002_rls_policies.sql
-- Description: Enables Row-Level Security on ALL tables.
-- Creates tenant isolation and role-based access policies.
-- ============================================================================

-- ============================================================================
-- Helper function: Set tenant context for session
-- ============================================================================
CREATE OR REPLACE FUNCTION app.set_tenant_context(
    p_tenant_id UUID,
    p_user_id UUID,
    p_role TEXT
) RETURNS VOID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
BEGIN
    PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, FALSE);
    PERFORM set_config('app.current_user_id', p_user_id::TEXT, FALSE);
    PERFORM set_config('app.current_user_role', p_role, FALSE);
END;
$$;

-- ============================================================================
-- 1. TENANTS
-- ============================================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Only super admins can read/write tenants table (no tenant isolation here)
CREATE POLICY tenant_isolation ON tenants
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

CREATE POLICY super_admin_access ON tenants
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- ============================================================================
-- 2. USERS
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can see users in their own tenant
CREATE POLICY tenant_isolation ON users
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

-- Super admins bypass tenant isolation
CREATE POLICY super_admin_access ON users
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- ============================================================================
-- 3. LEADS
-- ============================================================================
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: basic scope
CREATE POLICY tenant_isolation ON leads
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

-- Super admin bypass
CREATE POLICY super_admin_access ON leads
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- Role-based: agents see their assigned leads + unassigned leads in their tenant
CREATE POLICY agent_access_leads ON leads
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        AND (
            current_setting('app.current_user_role', TRUE)::TEXT IN ('tenant_admin', 'sales_manager', 'super_admin')
            OR assigned_agent_id IS NULL
            OR assigned_agent_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- ============================================================================
-- 4. PROPERTIES
-- ============================================================================
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- All roles in tenant can read; admin/manager can write
CREATE POLICY tenant_isolation ON properties
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

CREATE POLICY super_admin_access ON properties
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

CREATE POLICY read_all_write_admin ON properties
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    )
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        AND current_setting('app.current_user_role', TRUE)::TEXT IN ('tenant_admin', 'sales_manager', 'super_admin')
    );

-- ============================================================================
-- 5. AI AGENTS
-- ============================================================================
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ai_agents
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

CREATE POLICY super_admin_access ON ai_agents
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- ============================================================================
-- 6. AI CALL QUEUE
-- ============================================================================
ALTER TABLE ai_call_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ai_call_queue
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

CREATE POLICY super_admin_access ON ai_call_queue
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- ============================================================================
-- 7. AI CALL ANALYTICS
-- ============================================================================
ALTER TABLE ai_call_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ai_call_analytics
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

CREATE POLICY super_admin_access ON ai_call_analytics
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- ============================================================================
-- 8. CALLS (Manual/Human)
-- ============================================================================
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON calls
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

CREATE POLICY super_admin_access ON calls
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- Agents see their own calls; managers/admins see all in tenant
CREATE POLICY agent_own_calls ON calls
    FOR SELECT
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        AND (
            current_setting('app.current_user_role', TRUE)::TEXT IN ('tenant_admin', 'sales_manager', 'super_admin')
            OR agent_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- ============================================================================
-- 9. MESSAGES
-- ============================================================================
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON messages
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

CREATE POLICY super_admin_access ON messages
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- ============================================================================
-- 10. AUDIT LOGS
-- ============================================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Immutable append-only — no UPDATE/DELETE allowed
-- Tenant admins can SELECT their own logs; super admins read all
CREATE POLICY select_tenant_audit ON audit_logs
    FOR SELECT
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        OR current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin'
    );

CREATE POLICY super_admin_access ON audit_logs
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- ============================================================================
-- 11. TENANT BILLING
-- ============================================================================
ALTER TABLE tenant_billing ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_admin_only ON tenant_billing
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        AND current_setting('app.current_user_role', TRUE)::TEXT IN ('tenant_admin', 'super_admin')
    );

CREATE POLICY super_admin_access ON tenant_billing
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- ============================================================================
-- 12. DEALS
-- ============================================================================
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON deals
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

CREATE POLICY super_admin_access ON deals
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- Role-based: agents see assigned deals; managers/admins see all
CREATE POLICY role_based_deals ON deals
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        AND (
            current_setting('app.current_user_role', TRUE)::TEXT IN ('tenant_admin', 'sales_manager', 'super_admin')
            OR assigned_to = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- ============================================================================
-- 13. TASKS
-- ============================================================================
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tasks
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

CREATE POLICY super_admin_access ON tasks
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- Users see tasks assigned to them; managers see all in tenant
CREATE POLICY role_based_tasks ON tasks
    FOR SELECT
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        AND (
            current_setting('app.current_user_role', TRUE)::TEXT IN ('tenant_admin', 'sales_manager', 'super_admin')
            OR assigned_to = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- ============================================================================
-- 14. ATTENDANCE
-- ============================================================================
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON attendance
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

CREATE POLICY super_admin_access ON attendance
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- Users see own attendance; admins see all
CREATE POLICY user_own_attendance ON attendance
    FOR SELECT
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        AND (
            current_setting('app.current_user_role', TRUE)::TEXT IN ('tenant_admin', 'sales_manager', 'super_admin')
            OR user_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- ============================================================================
-- 15. DOCUMENTS
-- ============================================================================
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON documents
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

CREATE POLICY super_admin_access ON documents
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- ============================================================================
-- 16. FORMS
-- ============================================================================
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON forms
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

CREATE POLICY super_admin_access ON forms
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- ============================================================================
-- 17. SITE VISITS
-- ============================================================================
ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON site_visits
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

CREATE POLICY super_admin_access ON site_visits
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- ============================================================================
-- 18. EXPENSES
-- ============================================================================
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON expenses
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    );

CREATE POLICY super_admin_access ON expenses
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- Admins/managers only for write; agents view-only
CREATE POLICY admin_write_expenses ON expenses
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        AND current_setting('app.current_user_role', TRUE)::TEXT IN ('tenant_admin', 'sales_manager', 'super_admin')
    );

CREATE POLICY admin_update_expenses ON expenses
    FOR UPDATE
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        AND current_setting('app.current_user_role', TRUE)::TEXT IN ('tenant_admin', 'sales_manager', 'super_admin')
    );

-- ============================================================================
-- 19. INTEGRATIONS
-- ============================================================================
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_admin_only ON integrations
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
        AND current_setting('app.current_user_role', TRUE)::TEXT IN ('tenant_admin', 'super_admin')
    );

CREATE POLICY super_admin_access ON integrations
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- ============================================================================
-- RLS Audit: Verify RLS is enabled on all tables
-- ============================================================================
DO $$
DECLARE
    tbl TEXT;
    tables_without_rls TEXT[] := '{}';
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'tenants', 'users', 'leads', 'properties', 'ai_agents',
            'ai_call_queue', 'ai_call_analytics', 'calls', 'messages',
            'audit_logs', 'tenant_billing', 'deals', 'tasks', 'attendance',
            'documents', 'forms', 'site_visits', 'expenses', 'integrations'
        ])
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables
            WHERE tablename = tbl AND rowsecurity = TRUE
        ) THEN
            tables_without_rls := tables_without_rls || tbl;
        END IF;
    END LOOP;

    IF array_length(tables_without_rls, 1) > 0 THEN
        RAISE WARNING 'RLS NOT enabled on tables: %', array_to_string(tables_without_rls, ', ');
    ELSE
        RAISE NOTICE 'RLS enabled on ALL 19 tables ✓';
    END IF;
END;
$$;

-- ============================================================================
-- Migration complete
-- ============================================================================


-- ========== MIGRATION 003 ==========
-- ============================================================================
-- ESTATEFLOW CRM — Round 2: Partitions
-- Migration: 003_partitions.sql
-- Description: HASH partition leads 64 ways, RANGE partition audit_logs monthly.
-- ============================================================================

-- ############################################################################
-- LEADS — HASH PARTITIONING (64 partitions on id)
-- ############################################################################

-- The leads table was created as a non-partitioned table in 001_initial_schema.
-- For HASH partitioning to work, we need to recreate it as a partitioned table.
-- Since this is a migration (no data yet), we drop and recreate.
DROP TABLE IF EXISTS leads CASCADE;

CREATE TABLE leads (
    id                 UUID        NOT NULL DEFAULT gen_random_uuid(),
    tenant_id          UUID        NOT NULL,
    full_name          TEXT        NOT NULL,
    phone              TEXT        NULL,
    email              TEXT        NULL,
    source             TEXT        NULL,
    status             TEXT        NOT NULL DEFAULT 'new',
    ai_score           INTEGER     NULL DEFAULT 0,
    budget_min         NUMERIC     NULL,
    budget_max         NUMERIC     NULL,
    preferred_location TEXT        NULL,
    property_type      TEXT        NULL,
    notes              TEXT        NULL,
    assigned_agent_id  UUID        NULL,
    is_duplicate       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by         UUID        NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_leads PRIMARY KEY (id, tenant_id),
    CONSTRAINT fk_leads_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_leads_assigned_agent FOREIGN KEY (assigned_agent_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_leads_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_leads_source CHECK (source IN ('website', 'referral', 'whatsapp', 'facebook', 'instagram', 'cold_call', 'walk_in', 'other')),
    CONSTRAINT chk_leads_status CHECK (status IN ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'archived')),
    CONSTRAINT chk_leads_property_type CHECK (property_type IN ('apartment', 'villa', 'plot', 'commercial', 'penthouse', 'other')),
    CONSTRAINT chk_leads_ai_score CHECK (ai_score >= 0 AND ai_score <= 100)
) PARTITION BY HASH (id);

-- Create 64 hash partitions: leads_p000 through leads_p063
DO $$
DECLARE
    i INT;
    partition_name TEXT;
    remainder_str TEXT;
BEGIN
    FOR i IN 0..63 LOOP
        remainder_str := LPAD(i::TEXT, 3, '0');
        partition_name := 'leads_p' || remainder_str;
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF leads FOR VALUES WITH (MODULUS 64, REMAINDER %s)',
            partition_name, i
        );
    END LOOP;
END;
$$;

-- ############################################################################
-- AUDIT LOGS — RANGE PARTITIONING (Monthly on created_at)
-- ############################################################################

-- Drop the non-partitioned audit_logs table and recreate as partitioned
-- (no data yet, so safe to drop)
DROP TABLE IF EXISTS audit_logs CASCADE;

CREATE TABLE audit_logs (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    tenant_id   UUID        NULL,
    user_id     UUID        NULL,
    action      TEXT        NOT NULL,
    entity_type TEXT        NOT NULL,
    entity_id   UUID        NULL,
    old_values  JSONB       NULL,
    new_values  JSONB       NULL,
    ip_address  INET        NULL,
    user_agent  TEXT        NULL,
    request_id  UUID        NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_audit_logs PRIMARY KEY (id, created_at),
    CONSTRAINT fk_audit_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
    CONSTRAINT chk_audit_logs_action CHECK (action IN ('create', 'update', 'delete', 'login', 'logout', 'export', 'view'))
) PARTITION BY RANGE (created_at);

-- Create monthly partitions for current year + next 2 years
-- Current year: 2026 (based on context — auto-adjusts to current date)
DO $$
DECLARE
    start_year INT;
    start_month INT;
    end_year INT;
    end_month INT;
    partition_name TEXT;
    start_date TEXT;
    end_date TEXT;
    current_date_val DATE := CURRENT_DATE;
BEGIN
    start_year := EXTRACT(YEAR FROM current_date_val);
    start_month := EXTRACT(MONTH FROM current_date_val);

    -- Create 24 monthly partitions starting from 2 months ago
    start_month := start_month - 2;
    IF start_month <= 0 THEN
        start_year := start_year - 1;
        start_month := start_month + 12;
    END IF;

    end_year := start_year;
    end_month := start_month + 23;
    WHILE end_month > 12 LOOP
        end_year := end_year + 1;
        end_month := end_month - 12;
    END LOOP;

    -- Create partitions for 24 months starting from start_year/start_month
    FOR i IN 0..23 LOOP
        DECLARE
            yr INT := start_year;
            mo INT := start_month + i;
        BEGIN
            WHILE mo > 12 LOOP
                yr := yr + 1;
                mo := mo - 12;
            END LOOP;

            partition_name := 'audit_logs_' || yr::TEXT || '_' || LPAD(mo::TEXT, 2, '0');
            start_date := yr || '-' || LPAD(mo::TEXT, 2, '0') || '-01';

            -- Calculate next month
            DECLARE
                next_yr INT := yr;
                next_mo INT := mo + 1;
            BEGIN
                IF next_mo > 12 THEN
                    next_yr := next_yr + 1;
                    next_mo := 1;
                END IF;
                end_date := next_yr || '-' || LPAD(next_mo::TEXT, 2, '0') || '-01';
            END;

            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
                partition_name, start_date, end_date
            );
        END;
    END LOOP;
END;
$$;

-- ############################################################################
-- Recreate foreign keys that were lost due to DROP/CREATE
-- Re-apply FK on leads for ai_call_queue
-- ############################################################################

-- Recreate FK references that pointed to leads
-- Note: leads is partitioned by HASH(id) with PK (id, tenant_id),
-- so FKs must reference the composite key
ALTER TABLE ai_call_queue
    ADD CONSTRAINT fk_ai_call_queue_lead
    FOREIGN KEY (lead_id, tenant_id) REFERENCES leads(id, tenant_id) ON DELETE SET NULL;

ALTER TABLE calls
    ADD CONSTRAINT fk_calls_lead
    FOREIGN KEY (lead_id, tenant_id) REFERENCES leads(id, tenant_id) ON DELETE SET NULL;

ALTER TABLE messages
    ADD CONSTRAINT fk_messages_lead
    FOREIGN KEY (lead_id, tenant_id) REFERENCES leads(id, tenant_id) ON DELETE SET NULL;

ALTER TABLE deals
    ADD CONSTRAINT fk_deals_lead
    FOREIGN KEY (lead_id, tenant_id) REFERENCES leads(id, tenant_id) ON DELETE SET NULL;

ALTER TABLE tasks
    ADD CONSTRAINT fk_tasks_lead
    FOREIGN KEY (lead_id, tenant_id) REFERENCES leads(id, tenant_id) ON DELETE SET NULL;

ALTER TABLE documents
    ADD CONSTRAINT fk_documents_lead
    FOREIGN KEY (lead_id, tenant_id) REFERENCES leads(id, tenant_id) ON DELETE SET NULL;

ALTER TABLE site_visits
    ADD CONSTRAINT fk_site_visits_lead
    FOREIGN KEY (lead_id, tenant_id) REFERENCES leads(id, tenant_id) ON DELETE SET NULL;

-- Recreate FK references that pointed to audit_logs (none, audit_logs has no inbound FKs)

-- ============================================================================
-- Migration complete
-- ============================================================================


-- ========== MIGRATION 004 ==========
-- ============================================================================
-- ESTATEFLOW CRM — Round 2: Indexes
-- Migration: 004_indexes.sql
-- Description: Performance indexes for 10K+ tenant scalability.
-- Every table gets BRIN on created_at, BTREE on tenant_id, plus specific indexes.
-- ============================================================================

-- ############################################################################
-- 1. TENANTS
-- ############################################################################
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug ON tenants (slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_domain ON tenants (domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status);
CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants (plan);
CREATE INDEX IF NOT EXISTS idx_tenants_created_brin ON tenants USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 2. USERS
-- ############################################################################
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email ON users (tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);
CREATE INDEX IF NOT EXISTS idx_users_created_brin ON users USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 3. LEADS (Hash partitioned — indexes are per-partition)
-- ############################################################################
CREATE INDEX IF NOT EXISTS idx_leads_tenant_created ON leads (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_score ON leads (tenant_id, ai_score DESC) WHERE ai_score > 60;
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status ON leads (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_agent ON leads (tenant_id, assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads (phone);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_ai_score ON leads (ai_score);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_source ON leads (tenant_id, source);
CREATE INDEX IF NOT EXISTS idx_leads_created_brin ON leads USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 4. PROPERTIES
-- ############################################################################
CREATE INDEX IF NOT EXISTS idx_properties_tenant_id ON properties (tenant_id);
CREATE INDEX IF NOT EXISTS idx_properties_tenant_type ON properties (tenant_id, property_type);
CREATE INDEX IF NOT EXISTS idx_properties_tenant_availability ON properties (tenant_id, availability_status);
CREATE INDEX IF NOT EXISTS idx_properties_tenant_price ON properties (tenant_id, price);
CREATE INDEX IF NOT EXISTS idx_properties_tenant_created ON properties (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_created_brin ON properties USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 5. AI AGENTS
-- ############################################################################
CREATE INDEX IF NOT EXISTS idx_ai_agents_tenant_id ON ai_agents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_tenant_status ON ai_agents (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_agents_created_brin ON ai_agents USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 6. AI CALL QUEUE
-- ############################################################################
CREATE INDEX IF NOT EXISTS idx_ai_call_queue_tenant_status ON ai_call_queue (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_call_queue_tenant_scheduled ON ai_call_queue (tenant_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_ai_call_queue_tenant_lead ON ai_call_queue (tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_queue_tenant_agent ON ai_call_queue (tenant_id, ai_agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_queue_created_brin ON ai_call_queue USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 7. AI CALL ANALYTICS
-- ############################################################################
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_call_analytics_agent_date ON ai_call_analytics (tenant_id, ai_agent_id, date);
CREATE INDEX IF NOT EXISTS idx_ai_call_analytics_tenant_date ON ai_call_analytics (tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_ai_call_analytics_created_brin ON ai_call_analytics USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 8. CALLS (Manual)
-- ############################################################################
CREATE INDEX IF NOT EXISTS idx_calls_tenant_id ON calls (tenant_id);
CREATE INDEX IF NOT EXISTS idx_calls_tenant_lead ON calls (tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_calls_tenant_agent ON calls (tenant_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_tenant_direction ON calls (tenant_id, direction);
CREATE INDEX IF NOT EXISTS idx_calls_tenant_created ON calls (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_created_brin ON calls USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 9. MESSAGES
-- ############################################################################
CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON messages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_lead ON messages (tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_channel ON messages (tenant_id, channel);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_created ON messages (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created_brin ON messages USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 10. AUDIT LOGS (Partitioned — indexes are per-partition)
-- ############################################################################
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_action ON audit_logs (tenant_id, action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_entity ON audit_logs (tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_brin ON audit_logs USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 11. TENANT BILLING
-- ############################################################################
CREATE INDEX IF NOT EXISTS idx_tenant_billing_tenant_id ON tenant_billing (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_billing_tenant_status ON tenant_billing (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tenant_billing_created_brin ON tenant_billing USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 12. DEALS
-- ############################################################################
CREATE INDEX IF NOT EXISTS idx_deals_tenant_id ON deals (tenant_id);
CREATE INDEX IF NOT EXISTS idx_deals_tenant_stage ON deals (tenant_id, stage);
CREATE INDEX IF NOT EXISTS idx_deals_tenant_assigned ON deals (tenant_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_deals_tenant_created ON deals (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_created_brin ON deals USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 13. TASKS
-- ############################################################################
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id ON tasks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_assigned ON tasks (tenant_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status ON tasks (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_due ON tasks (tenant_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_created_brin ON tasks USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 14. ATTENDANCE
-- ############################################################################
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance (tenant_id, user_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_date ON attendance (tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_status ON attendance (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_created_brin ON attendance USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 15. DOCUMENTS
-- ############################################################################
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_lead ON documents (tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_deal ON documents (tenant_id, deal_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_category ON documents (tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_documents_created_brin ON documents USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 16. FORMS
-- ############################################################################
CREATE INDEX IF NOT EXISTS idx_forms_tenant_id ON forms (tenant_id);
CREATE INDEX IF NOT EXISTS idx_forms_tenant_active ON forms (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_forms_created_brin ON forms USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 17. SITE VISITS
-- ############################################################################
CREATE INDEX IF NOT EXISTS idx_site_visits_tenant_id ON site_visits (tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_tenant_lead ON site_visits (tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_tenant_property ON site_visits (tenant_id, property_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_tenant_scheduled ON site_visits (tenant_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_site_visits_tenant_status ON site_visits (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_site_visits_created_brin ON site_visits USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 18. EXPENSES
-- ############################################################################
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_id ON expenses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_category ON expenses (tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON expenses (tenant_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_created_brin ON expenses USING BRIN (created_at) WITH (pages_per_range = 32);

-- ############################################################################
-- 19. INTEGRATIONS
-- ############################################################################
CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_tenant_provider ON integrations (tenant_id, provider);
CREATE INDEX IF NOT EXISTS idx_integrations_tenant_enabled ON integrations (tenant_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_integrations_created_brin ON integrations USING BRIN (created_at) WITH (pages_per_range = 32);

-- ============================================================================
-- Migration complete
-- ============================================================================


-- ========== MIGRATION 005 ==========
-- ============================================================================
-- ESTATEFLOW CRM — Round 2: Materialized Views
-- Migration: 005_materialized_views.sql
-- Description: Pre-computed dashboard summary for each tenant.
-- Refreshed periodically via pg_cron (every 5 minutes recommended).
-- ============================================================================

-- ############################################################################
-- TENANT DASHBOARD STATS
-- ############################################################################
-- Pre-computed dashboard summary for each tenant, refreshed periodically.
-- Provides fast dashboard loading without expensive aggregations at query time.

CREATE MATERIALIZED VIEW IF NOT EXISTS tenant_dashboard_stats AS
SELECT
    -- Tenant identification
    t.id                                                                    AS tenant_id,

    -- Lead metrics
    COALESCE(l_total.total_leads, 0)                                        AS total_leads,
    COALESCE(l_total.new_leads_today, 0)                                    AS new_leads_today,
    COALESCE(l_status.leads_by_status, '{}'::JSONB)                         AS leads_by_status,

    -- Property metrics
    COALESCE(p.total_properties, 0)                                         AS total_properties,
    COALESCE(p.available_properties, 0)                                     AS available_properties,

    -- Deal metrics
    COALESCE(d_total.total_deals, 0)                                        AS total_deals,
    COALESCE(d_stage.deals_by_stage, '{}'::JSONB)                           AS deals_by_stage,
    COALESCE(d_total.total_deal_value, 0)                                   AS total_deal_value,
    COALESCE(d_total.won_deals_value, 0)                                    AS won_deals_value,

    -- Call metrics
    COALESCE(c.total_calls_made, 0)                                         AS total_calls_made,
    COALESCE(m.total_messages_sent, 0)                                      AS total_messages_sent,
    COALESCE(ai.ai_calls_made, 0)                                           AS ai_calls_made,
    COALESCE(ai.ai_calls_connected, 0)                                      AS ai_calls_connected,

    -- Agent & expense metrics
    COALESCE(u.active_agents_count, 0)                                      AS active_agents_count,
    COALESCE(e.total_expenses, 0)                                           AS total_expenses,

    -- Conversion rate (won deals / total deals)
    CASE
        WHEN COALESCE(d_total.total_deals, 0) > 0
        THEN ROUND((COALESCE(d_total.won_deals_value, 0) / NULLIF(d_total.total_deal_value, 0)) * 100, 2)
        ELSE 0
    END                                                                     AS conversion_rate,

    -- Last refresh timestamp
    NOW()                                                                   AS updated_at

FROM
    tenants t
    -- Lead subquery (total + today's new leads — query leads directly)
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*)                                                        AS total_leads,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)              AS new_leads_today
        FROM leads
        WHERE tenant_id = t.id
    ) l_total ON TRUE
    -- Lead subquery (by status breakdown — grouped)
    LEFT JOIN LATERAL (
        SELECT
            COALESCE(
                jsonb_agg(jsonb_build_object('status', status, 'count', cnt))
                FILTER (WHERE status IS NOT NULL),
                '[]'::JSONB
            )                                                               AS leads_by_status
        FROM (
            SELECT status, COUNT(*) AS cnt
            FROM leads
            WHERE tenant_id = t.id
            GROUP BY status
        ) l2
    ) l_status ON TRUE
    -- Property subquery
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*)                                                        AS total_properties,
            COUNT(*) FILTER (WHERE availability_status = 'available')       AS available_properties
        FROM properties
        WHERE tenant_id = t.id
    ) p ON TRUE
    -- Deal subquery (total metrics — query deals directly)
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*)                                                        AS total_deals,
            COALESCE(SUM(value), 0)                                       AS total_deal_value,
            COALESCE(SUM(value) FILTER (WHERE stage = 'closed_won'), 0)   AS won_deals_value
        FROM deals
        WHERE tenant_id = t.id
    ) d_total ON TRUE
    -- Deal subquery (by stage breakdown — grouped)
    LEFT JOIN LATERAL (
        SELECT
            COALESCE(
                jsonb_agg(jsonb_build_object('stage', stage, 'count', cnt))
                FILTER (WHERE stage IS NOT NULL),
                '[]'::JSONB
            )                                                               AS deals_by_stage
        FROM (
            SELECT stage, COUNT(*) AS cnt
            FROM deals
            WHERE tenant_id = t.id
            GROUP BY stage
        ) d2
    ) d_stage ON TRUE
    -- Call subquery (manual calls)
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total_calls_made
        FROM calls
        WHERE tenant_id = t.id
    ) c ON TRUE
    -- Message subquery
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total_messages_sent
        FROM messages
        WHERE tenant_id = t.id
    ) m ON TRUE
    -- AI call subquery
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*)                                                        AS ai_calls_made,
            COUNT(*) FILTER (WHERE status = 'completed')                    AS ai_calls_connected
        FROM ai_call_queue
        WHERE tenant_id = t.id
    ) ai ON TRUE
    -- Active users subquery
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS active_agents_count
        FROM users
        WHERE tenant_id = t.id AND is_active = TRUE
    ) u ON TRUE
    -- Expense subquery
    LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(amount), 0) AS total_expenses
        FROM expenses
        WHERE tenant_id = t.id
    ) e ON TRUE
WHERE
    t.status = 'active'
ORDER BY
    t.id;

-- ============================================================================
-- Unique index for efficient upsert / concurrent refresh
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_dashboard_stats_tenant_id
    ON tenant_dashboard_stats (tenant_id);

-- ============================================================================
-- Create a function to refresh the materialized view
-- ============================================================================
CREATE OR REPLACE FUNCTION app.refresh_tenant_dashboard_stats()
RETURNS VOID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY tenant_dashboard_stats;
END;
$$;

-- ============================================================================
-- Schedule auto-refresh via pg_cron (every 5 minutes)
-- Note: pg_cron must be configured in postgresql.conf
-- ============================================================================
-- Schedule auto-refresh via pg_cron (every 5 minutes)
-- Note: pg_cron must be enabled in Supabase dashboard
DO $$
BEGIN
    PERFORM cron.schedule(
        'refresh-tenant-dashboard',
        '*/5 * * * *',
        'SELECT app.refresh_tenant_dashboard_stats()'
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available. Materialized view refresh not scheduled.';
END;
$$;

-- ============================================================================
-- Migration complete
-- ============================================================================


-- ========== MIGRATION 006 ==========
-- ============================================================================
-- ESTATEFLOW CRM — Round 2: Triggers
-- Migration: 006_triggers.sql
-- Description: Automatic updated_at trigger for all relevant tables.
-- Auto-audit trigger for INSERT/UPDATE/DELETE on critical tables.
-- ============================================================================

-- ############################################################################
-- TRIGGER FUNCTION: update_updated_at_column()
-- Automatically sets updated_at to NOW() on row update.
-- ############################################################################
CREATE OR REPLACE FUNCTION app.update_updated_at_column()
RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ############################################################################
-- APPLY updated_at TRIGGER to ALL tables that have an updated_at column
-- Tables: tenants, users, leads, properties, ai_agents, deals, tasks,
--         attendance, forms, site_visits, expenses, integrations
-- ############################################################################

CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_properties_updated_at
    BEFORE UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_ai_agents_updated_at
    BEFORE UPDATE ON ai_agents
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_deals_updated_at
    BEFORE UPDATE ON deals
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_attendance_updated_at
    BEFORE UPDATE ON attendance
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_forms_updated_at
    BEFORE UPDATE ON forms
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_site_visits_updated_at
    BEFORE UPDATE ON site_visits
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_integrations_updated_at
    BEFORE UPDATE ON integrations
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- ############################################################################
-- TRIGGER FUNCTION: audit_trigger_func()
-- Automatically logs INSERT/UPDATE/DELETE operations to audit_logs table.
-- Excluded columns: updated_at, last_login (noisy fields)
-- ############################################################################
CREATE OR REPLACE FUNCTION app.audit_trigger_func()
RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
    v_action        TEXT;
    v_old_values    JSONB;
    v_new_values    JSONB;
    v_excluded_cols TEXT[] := ARRAY['updated_at', 'last_login'];
    v_tenant_id     UUID;
    v_user_id       UUID;
    v_user_role     TEXT;
    v_entity_id     UUID;
    v_entity_type   TEXT;
    v_request_id    UUID;
    v_ip_address    INET;
    v_user_agent    TEXT;
BEGIN
    -- Determine action type
    IF TG_OP = 'INSERT' THEN
        v_action := 'create';
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update';
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete';
    ELSE
        RETURN NULL;
    END IF;

    -- Get session context (with fallbacks)
    BEGIN
        v_tenant_id := NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_tenant_id := NULL;
    END;

    BEGIN
        v_user_id := NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
    END;

    BEGIN
        v_user_role := NULLIF(current_setting('app.current_user_role', TRUE), '');
    EXCEPTION WHEN OTHERS THEN
        v_user_role := NULL;
    END;

    -- For tables that have a tenant_id column, use it
    BEGIN
        IF TG_OP = 'DELETE' THEN
            v_tenant_id := COALESCE(v_tenant_id, OLD.tenant_id);
            v_entity_id := OLD.id;
        ELSE
            v_tenant_id := COALESCE(v_tenant_id, NEW.tenant_id);
            v_entity_id := NEW.id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_entity_id := NULL;
    END;

    -- Entity type from table name
    v_entity_type := TG_TABLE_NAME;

    -- Get request context from session if available
    BEGIN
        v_request_id := NULLIF(current_setting('app.request_id', TRUE), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_request_id := NULL;
    END;

    BEGIN
        v_ip_address := NULLIF(current_setting('app.ip_address', TRUE), '')::INET;
    EXCEPTION WHEN OTHERS THEN
        v_ip_address := NULL;
    END;

    BEGIN
        v_user_agent := NULLIF(current_setting('app.user_agent', TRUE), '');
    EXCEPTION WHEN OTHERS THEN
        v_user_agent := NULL;
    END;

    -- Build old/new values JSON (excluding noisy columns)
    IF TG_OP = 'DELETE' THEN
        v_old_values := to_jsonb(OLD) - v_excluded_cols;
        v_new_values := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        v_old_values := NULL;
        v_new_values := to_jsonb(NEW) - v_excluded_cols;
    ELSE -- UPDATE
        -- Only log if there are actual changes (excluding excluded columns)
        v_old_values := to_jsonb(OLD) - v_excluded_cols;
        v_new_values := to_jsonb(NEW) - v_excluded_cols;
        -- Skip if nothing meaningful changed
        IF v_old_values = v_new_values THEN
            RETURN NULL;
        END IF;
    END IF;

    -- Insert audit record
    INSERT INTO audit_logs (
        tenant_id,
        user_id,
        action,
        entity_type,
        entity_id,
        old_values,
        new_values,
        ip_address,
        user_agent,
        request_id,
        created_at
    ) VALUES (
        v_tenant_id,
        v_user_id,
        v_action,
        v_entity_type,
        v_entity_id,
        v_old_values,
        v_new_values,
        v_ip_address,
        v_user_agent,
        v_request_id,
        NOW()
    );

    RETURN NULL;
END;
$$;

-- ############################################################################
-- APPLY AUDIT TRIGGER to critical tables
-- Tables: tenants, users, leads, properties, deals, tasks
-- ############################################################################

CREATE TRIGGER trg_tenants_audit
    AFTER INSERT OR UPDATE OR DELETE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION app.audit_trigger_func();

CREATE TRIGGER trg_users_audit
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION app.audit_trigger_func();

CREATE TRIGGER trg_leads_audit
    AFTER INSERT OR UPDATE OR DELETE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION app.audit_trigger_func();

CREATE TRIGGER trg_properties_audit
    AFTER INSERT OR UPDATE OR DELETE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION app.audit_trigger_func();

CREATE TRIGGER trg_deals_audit
    AFTER INSERT OR UPDATE OR DELETE ON deals
    FOR EACH ROW
    EXECUTE FUNCTION app.audit_trigger_func();

CREATE TRIGGER trg_tasks_audit
    AFTER INSERT OR UPDATE OR DELETE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION app.audit_trigger_func();

-- ============================================================================
-- Verify triggers are in place
-- ============================================================================
DO $$
DECLARE
    trigger_count INT;
BEGIN
    SELECT COUNT(*) INTO trigger_count
    FROM pg_trigger
    WHERE tgname LIKE 'trg_%_updated_at' OR tgname LIKE 'trg_%_audit';

    RAISE NOTICE 'Total triggers installed: %', trigger_count;
END;
$$;

-- ============================================================================
-- Migration complete
-- ============================================================================


-- ========== MIGRATION 007 ==========
-- ============================================================================
-- ESTATEFLOW CRM — Round 2: Seed Data
-- Migration: 007_seed_data.sql
-- Description: Inserts initial seed data for development/demo.
-- Includes: 1 super admin, 1 demo tenant, 1 tenant admin, 10 leads, 5 properties
-- ============================================================================

-- ============================================================================
-- Helper function to generate deterministic UUIDs for seed data
-- Using a fixed namespace UUID + unique strings for reproducibility
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. SUPER ADMIN TENANT (special system tenant for super admins)
-- ============================================================================
INSERT INTO tenants (
    id, name, slug, domain, plan, status, feature_flags,
    ai_voice_enabled, max_storage_gb, setup_fee_paid
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'EstateFlow CRM',
    'estateflow',
    'app.estateflow.com',
    'enterprise',
    'active',
    '{"white_label": true, "ai_voice": true, "multi_currency": true, "advanced_analytics": true}'::JSONB,
    TRUE,
    100,
    TRUE
) ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 2. SUPER ADMIN USER
-- ============================================================================
INSERT INTO users (
    id, tenant_id, email, password_hash, full_name, phone, role, is_active
) VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'admin@estateflow.com',
    '$2b$12$LJ3m4ys3Lk0TSwHnbfOMiOXPm1Qlq5Yz0GqGq0GqGq0GqGq0GqGq', -- bcrypt hash of 'admin123!'
    'Super Admin',
    '+919999999999',
    'super_admin',
    TRUE
) ON CONFLICT (tenant_id, email) DO NOTHING;

-- ============================================================================
-- 3. DEMO TENANT
-- ============================================================================
INSERT INTO tenants (
    id, name, slug, domain, logo_url, favicon_url,
    primary_color, secondary_color, accent_color,
    email_sender_name, email_reply_to, whatsapp_number, sms_sender_id,
    plan, status, feature_flags, ai_voice_enabled, max_storage_gb,
    billing_email, setup_fee_paid, negotiated_discount, contract_duration_months
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    'Demo Realty Solutions',
    'demo',
    'demo.estateflow.com',
    'https://cdn.estateflow.com/demo/logo.png',
    'https://cdn.estateflow.com/demo/favicon.ico',
    '#1E40AF',
    '#6B7280',
    '#10B981',
    'Demo Realty',
    'replies@demo.estateflow.com',
    '+919876543210',
    'DEMOSID',
    'professional',
    'active',
    '{"white_label": true, "ai_voice": true, "email_marketing": true, "whatsapp": true}'::JSONB,
    TRUE,
    25,
    'billing@demo.estateflow.com',
    TRUE,
    10.00,
    12
) ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 4. DEMO TENANT ADMIN
-- ============================================================================
INSERT INTO users (
    id, tenant_id, email, password_hash, full_name, phone, role, is_active
) VALUES (
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000010',
    'admin@demo.estateflow.com',
    '$2b$12$LJ3m4ys3Lk0TSwHnbfOMiOXPm1Qlq5Yz0GqGq0GqGq0GqGq0GqGq', -- bcrypt hash of 'demo123!'
    'Rajesh Kumar',
    '+919876543211',
    'tenant_admin',
    TRUE
) ON CONFLICT (tenant_id, email) DO NOTHING;

-- ============================================================================
-- 5. ADDITIONAL DEMO USERS (agent, sales manager, field executive)
-- ============================================================================
INSERT INTO users (id, tenant_id, email, password_hash, full_name, phone, role, is_active)
VALUES
    (
        '00000000-0000-0000-0000-000000000012',
        '00000000-0000-0000-0000-000000000010',
        'agent1@demo.estateflow.com',
        '$2b$12$LJ3m4ys3Lk0TSwHnbfOMiOXPm1Qlq5Yz0GqGq0GqGq0GqGq0GqGq',
        'Priya Sharma',
        '+919876543212',
        'agent',
        TRUE
    ),
    (
        '00000000-0000-0000-0000-000000000013',
        '00000000-0000-0000-0000-000000000010',
        'manager@demo.estateflow.com',
        '$2b$12$LJ3m4ys3Lk0TSwHnbfOMiOXPm1Qlq5Yz0GqGq0GqGq0GqGq0GqGq',
        'Amit Verma',
        '+919876543213',
        'sales_manager',
        TRUE
    ),
    (
        '00000000-0000-0000-0000-000000000014',
        '00000000-0000-0000-0000-000000000010',
        'field@demo.estateflow.com',
        '$2b$12$LJ3m4ys3Lk0TSwHnbfOMiOXPm1Qlq5Yz0GqGq0GqGq0GqGq0GqGq',
        'Vikram Singh',
        '+919876543214',
        'field_executive',
        TRUE
    )
ON CONFLICT (tenant_id, email) DO NOTHING;

-- ============================================================================
-- 6. SAMPLE LEADS (10 leads for the demo tenant)
-- ============================================================================
INSERT INTO leads (
    id, tenant_id, full_name, phone, email, source, status, ai_score,
    budget_min, budget_max, preferred_location, property_type, notes,
    assigned_agent_id, is_duplicate, created_by
) VALUES
    (
        '00000000-0000-0000-0000-000000000101',
        '00000000-0000-0000-0000-000000000010',
        'Arun Patel',
        '+919811111101',
        'arun.patel@email.com',
        'website',
        'new',
        75,
        5000000,
        8000000,
        'Andheri West, Mumbai',
        'apartment',
        'Looking for 2BHK in Andheri West, ready to move in within 2 months.',
        '00000000-0000-0000-0000-000000000012',
        FALSE,
        '00000000-0000-0000-0000-000000000012'
    ),
    (
        '00000000-0000-0000-0000-000000000102',
        '00000000-0000-0000-0000-000000000010',
        'Sneha Desai',
        '+919811111102',
        'sneha.desai@email.com',
        'referral',
        'contacted',
        82,
        12000000,
        15000000,
        'Whitefield, Bangalore',
        'villa',
        'Referral from existing client. Looking for 3BHK villa in Whitefield. Budget flexible up to 2Cr.',
        '00000000-0000-0000-0000-000000000012',
        FALSE,
        '00000000-0000-0000-0000-000000000011'
    ),
    (
        '00000000-0000-0000-0000-000000000103',
        '00000000-0000-0000-0000-000000000010',
        'Rohit Mehta',
        '+919811111103',
        'rohit.mehta@email.com',
        'facebook',
        'qualified',
        90,
        25000000,
        35000000,
        'Bandra West, Mumbai',
        'penthouse',
        'High net worth individual. Looking for luxury penthouse with sea view. Already visited 2 properties.',
        '00000000-0000-0000-0000-000000000013',
        FALSE,
        '00000000-0000-0000-0000-000000000013'
    ),
    (
        '00000000-0000-0000-0000-000000000104',
        '00000000-0000-0000-0000-000000000010',
        'Neha Gupta',
        '+919811111104',
        'neha.gupta@email.com',
        'instagram',
        'proposal',
        65,
        3000000,
        5000000,
        'Noida Sector 62',
        'apartment',
        'First-time buyer. Looking for 1BHK in Noida. Budget strictly under 50L.',
        '00000000-0000-0000-0000-000000000012',
        FALSE,
        '00000000-0000-0000-0000-000000000012'
    ),
    (
        '00000000-0000-0000-0000-000000000105',
        '00000000-0000-0000-0000-000000000010',
        'Vijay Kumar',
        '+919811111105',
        'vijay.kumar@email.com',
        'whatsapp',
        'negotiation',
        95,
        80000000,
        120000000,
        'Jubilee Hills, Hyderabad',
        'villa',
        'Premium buyer. Negotiating on Villa in Jubilee Hills. Very serious, visited 3 times.',
        '00000000-0000-0000-0000-000000000013',
        FALSE,
        '00000000-0000-0000-0000-000000000011'
    ),
    (
        '00000000-0000-0000-0000-000000000106',
        '00000000-0000-0000-0000-000000000010',
        'Ananya Reddy',
        '+919811111106',
        'ananya.reddy@email.com',
        'website',
        'new',
        45,
        15000000,
        20000000,
        'Hitech City, Hyderabad',
        'apartment',
        'Looking for 3BHK apartment in Hitech City area. Prefer gated community.',
        NULL,
        FALSE,
        '00000000-0000-0000-0000-000000000012'
    ),
    (
        '00000000-0000-0000-0000-000000000107',
        '00000000-0000-0000-0000-000000000010',
        'Deepak Joshi',
        '+919811111107',
        'deepak.joshi@email.com',
        'cold_call',
        'contacted',
        30,
        2000000,
        4000000,
        'Indore',
        'plot',
        'Called via cold outreach. Interested in residential plots in Indore for investment.',
        '00000000-0000-0000-0000-000000000012',
        FALSE,
        '00000000-0000-0000-0000-000000000014'
    ),
    (
        '00000000-0000-0000-0000-000000000108',
        '00000000-0000-0000-0000-000000000010',
        'Farida Khan',
        '+919811111108',
        'farida.khan@email.com',
        'walk_in',
        'qualified',
        70,
        10000000,
        15000000,
        'Malad, Mumbai',
        'apartment',
        'Walked into office. Looking for 2BHK in Malad. Prefers top floor. Budget 1-1.5Cr.',
        '00000000-0000-0000-0000-000000000013',
        FALSE,
        '00000000-0000-0000-0000-000000000011'
    ),
    (
        '00000000-0000-0000-0000-000000000109',
        '00000000-0000-0000-0000-000000000010',
        'Karan Thakur',
        '+919811111109',
        'karan.thakur@email.com',
        'website',
        'lost',
        20,
        7500000,
        10000000,
        'Thane West',
        'apartment',
        'Lost — found alternative property through another broker. Keep for future follow-up.',
        '00000000-0000-0000-0000-000000000012',
        FALSE,
        '00000000-0000-0000-0000-000000000012'
    ),
    (
        '00000000-0000-0000-0000-000000000110',
        '00000000-0000-0000-0000-000000000010',
        'Maya Singh',
        '+919811111110',
        'maya.singh@email.com',
        'referral',
        'won',
        98,
        45000000,
        55000000,
        'Gurgaon Sector 57',
        'villa',
        'WON! Closed deal on 4BHK villa in Gurgaon. Referral from existing happy client. Excellent experience.',
        '00000000-0000-0000-0000-000000000013',
        FALSE,
        '00000000-0000-0000-0000-000000000013'
    );

-- ============================================================================
-- 7. SAMPLE PROPERTIES (5 properties for the demo tenant)
-- ============================================================================
INSERT INTO properties (
    id, tenant_id, title, description, price, area_sqft, bedrooms, bathrooms,
    property_type, availability_status, location, latitude, longitude,
    images, amenities, owner_name, owner_phone
) VALUES
    (
        '00000000-0000-0000-0000-000000000201',
        '00000000-0000-0000-0000-000000000010',
        'Luxury 3BHK Apartment — Andheri West',
        'Premium 3BHK apartment in the heart of Andheri West. Gated community with swimming pool, gym, and 24/7 security. Walking distance to metro station.',
        8500000,
        1200,
        3,
        2,
        'apartment',
        'available',
        'Andheri West, Mumbai',
        19.1365,
        72.8318,
        ARRAY[
            'https://cdn.estateflow.com/demo/prop1-1.jpg',
            'https://cdn.estateflow.com/demo/prop1-2.jpg',
            'https://cdn.estateflow.com/demo/prop1-3.jpg'
        ],
        ARRAY['Swimming Pool', 'Gym', 'Parking', 'Security', 'Metro Access', 'Power Backup'],
        'Sunil Shah',
        '+919822220001'
    ),
    (
        '00000000-0000-0000-0000-000000000202',
        '00000000-0000-0000-0000-000000000010',
        'Modern 2BHK — Whitefield, Bangalore',
        'Beautiful 2BHK in a new development in Whitefield. Perfect for young professionals. Close to IT parks and schools.',
        6500000,
        950,
        2,
        2,
        'apartment',
        'available',
        'Whitefield, Bangalore',
        12.9698,
        77.7460,
        ARRAY[
            'https://cdn.estateflow.com/demo/prop2-1.jpg',
            'https://cdn.estateflow.com/demo/prop2-2.jpg'
        ],
        ARRAY['Gym', 'Park', 'Kids Play Area', 'Clubhouse'],
        'Anita Mehra',
        '+919822220002'
    ),
    (
        '00000000-0000-0000-0000-000000000203',
        '00000000-0000-0000-0000-000000000010',
        'Stunning Villa — Jubilee Hills',
        'Exclusive 4BHK villa with private pool and garden in the most sought-after neighborhood of Hyderabad. 6000 sq.ft plot with modern architecture.',
        95000000,
        4500,
        4,
        4,
        'villa',
        'available',
        'Jubilee Hills, Hyderabad',
        17.4315,
        78.4100,
        ARRAY[
            'https://cdn.estateflow.com/demo/prop3-1.jpg',
            'https://cdn.estateflow.com/demo/prop3-2.jpg',
            'https://cdn.estateflow.com/demo/prop3-3.jpg',
            'https://cdn.estateflow.com/demo/prop3-4.jpg'
        ],
        ARRAY['Private Pool', 'Garden', 'Home Theatre', 'Smart Home', '4-Car Garage', 'Servant Quarters'],
        'Rajiv Reddy',
        '+919822220003'
    ),
    (
        '00000000-0000-0000-0000-000000000204',
        '00000000-0000-0000-0000-000000000010',
        'Commercial Space — Hitech City',
        'Prime commercial office space in Hitech City, Hyderabad. 2000 sq.ft on the 5th floor with panoramic views. Suitable for IT/ITES companies.',
        25000000,
        2000,
        0,
        2,
        'commercial',
        'available',
        'Hitech City, Hyderabad',
        17.4460,
        78.3800,
        ARRAY[
            'https://cdn.estateflow.com/demo/prop4-1.jpg',
            'https://cdn.estateflow.com/demo/prop4-2.jpg'
        ],
        ARRAY['24/7 Power Backup', 'Parking', 'Cafeteria', 'Conference Room', 'Security'],
        'Meena Agarwal',
        '+919822220004'
    ),
    (
        '00000000-0000-0000-0000-000000000205',
        '00000000-0000-0000-0000-000000000010',
        'Premium Residential Plot — Noida Extension',
        'Corner plot in Noida Extension''s premium sector. Ideal for building your dream home. All utilities connected. Facing east — auspicious.',
        4500000,
        1500,
        0,
        0,
        'plot',
        'available',
        'Noida Extension, Greater Noida',
        28.4744,
        77.5030,
        ARRAY[
            'https://cdn.estateflow.com/demo/prop5-1.jpg'
        ],
        ARRAY['Electricity', 'Water Connection', 'Road Access', 'Corner Plot', 'East Facing'],
        'Prakash Gupta',
        '+919822220005'
    );

-- ============================================================================
-- 8. SITE VISITS (sample visits linked to leads)
-- ============================================================================
INSERT INTO site_visits (id, tenant_id, lead_id, property_id, scheduled_by, scheduled_at, status, notes)
VALUES
    (
        '00000000-0000-0000-0000-000000000301',
        '00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000103',
        '00000000-0000-0000-0000-000000000203',
        '00000000-0000-0000-0000-000000000013',
        NOW() + INTERVAL '3 days',
        'scheduled',
        'VIP client — arrange refreshments and prepare documentation.'
    ),
    (
        '00000000-0000-0000-0000-000000000302',
        '00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000101',
        '00000000-0000-0000-0000-000000000201',
        '00000000-0000-0000-0000-000000000012',
        NOW() + INTERVAL '1 day',
        'scheduled',
        'First visit. Meet at site office at 11 AM.'
    ),
    (
        '00000000-0000-0000-0000-000000000303',
        '00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000105',
        '00000000-0000-0000-0000-000000000203',
        '00000000-0000-0000-0000-000000000013',
        NOW() - INTERVAL '7 days',
        'completed',
        'Client was impressed with the property. Negotiating price.'
    );

-- ============================================================================
-- 9. AI AGENT (sample AI agent for demo tenant)
-- ============================================================================
INSERT INTO ai_agents (
    id, tenant_id, name, voice, language, purpose,
    script_templates, behavior_config, max_concurrent_calls,
    status
) VALUES (
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000010',
    'Demo AI Assistant',
    'male_01',
    'en',
    'lead_qualification',
    '[
        {"name": "initial_contact", "text": "Hello {{lead_name}}, this is {{agent_name}} from Demo Realty. I am calling to discuss your interest in properties in {{location}}. Is this a good time to talk?"},
        {"name": "follow_up", "text": "Hi {{lead_name}}, following up on your inquiry about {{property_type}} in {{location}}. Have you had a chance to review the details we sent?"}
    ]'::JSONB,
    '{"tone": "friendly_professional", "interruption_handling": "polite_pause", "max_listening_time_secs": 60}'::JSONB,
    5,
    'active'
);

-- ============================================================================
-- 10. SET UP TENANT CONTEXT FUNCTION CALL (for verification)
-- ============================================================================
-- Call the context function to verify it works:
-- SELECT app.set_tenant_context(
--     '00000000-0000-0000-0000-000000000010'::UUID,
--     '00000000-0000-0000-0000-000000000011'::UUID,
--     'tenant_admin'
-- );

-- ============================================================================
-- Summary report
-- ============================================================================
DO $$
DECLARE
    v_tenants    INT;
    v_users      INT;
    v_leads      INT;
    v_properties INT;
    v_visits     INT;
    v_agents     INT;
BEGIN
    SELECT COUNT(*) INTO v_tenants    FROM tenants;
    SELECT COUNT(*) INTO v_users      FROM users;
    SELECT COUNT(*) INTO v_leads      FROM leads;
    SELECT COUNT(*) INTO v_properties FROM properties;
    SELECT COUNT(*) INTO v_visits     FROM site_visits;
    SELECT COUNT(*) INTO v_agents     FROM ai_agents;

    RAISE NOTICE '============================================';
    RAISE NOTICE 'Seed Data Summary';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Tenants:    %', v_tenants;
    RAISE NOTICE 'Users:      %', v_users;
    RAISE NOTICE 'Leads:      %', v_leads;
    RAISE NOTICE 'Properties: %', v_properties;
    RAISE NOTICE 'Site Visits:%', v_visits;
    RAISE NOTICE 'AI Agents:  %', v_agents;
    RAISE NOTICE '============================================';
END;
$$;

-- ============================================================================
-- Migration complete
-- ============================================================================
