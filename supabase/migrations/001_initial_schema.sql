-- ============================================================================
-- ESTATEFLOW CRM — Round 2: Initial Schema
-- Migration: 001_initial_schema.sql
-- Description: Creates all tables for the EstateFlow multi-tenant CRM SaaS.
-- PostgreSQL 16+, Extensions: pgcrypto, uuid-ossp, pg_partman, pg_cron
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_partman;
CREATE EXTENSION IF NOT EXISTS pg_cron;

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
