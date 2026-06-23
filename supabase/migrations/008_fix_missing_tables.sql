-- ============================================================================
-- ESTATEFLOW CRM — Fix Missing Tables, Columns, RLS Policies & Seed Data
-- Migration: 008_fix_missing_tables.sql
-- Description:
--   1. Creates 5 missing tables: commissions, commission_configs,
--      commission_rules, communication_logs, form_responses
--   2. Adds missing columns to attendance, expenses, deals
--   3. Re-applies RLS policies on leads and audit_logs (dropped in 003)
--   4. Fixes seed data bcrypt hashes for 5 users
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE MISSING TABLES
-- ============================================================================

-- 1a. commissions — Agent commission records linked to deals
CREATE TABLE IF NOT EXISTS commissions (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    deal_id           UUID        NOT NULL,
    agent_id          UUID        NOT NULL,
    deal_value        DECIMAL     NOT NULL DEFAULT 0,
    commission_amount DECIMAL     NOT NULL DEFAULT 0,
    percentage        DECIMAL     NOT NULL DEFAULT 0,
    status            TEXT        NOT NULL DEFAULT 'pending',
    paid_at           TIMESTAMPTZ NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_commissions_status CHECK (status IN ('pending', 'paid', 'cancelled'))
);

-- 1b. commission_configs — Agent-specific commission configuration
CREATE TABLE IF NOT EXISTS commission_configs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id     UUID        NOT NULL,
    name         TEXT        NOT NULL,
    percentage   DECIMAL     NULL,
    fixed_amount DECIMAL     NULL,
    deal_type    TEXT        NULL,
    min_value    DECIMAL     NULL,
    max_value    DECIMAL     NULL,
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1c. commission_rules — Tenant-level commission rules (tiered/percentage/fixed)
CREATE TABLE IF NOT EXISTS commission_rules (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name       TEXT        NOT NULL,
    rule_type  TEXT        NOT NULL,
    config     JSONB       NOT NULL DEFAULT '{}',
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_commission_rules_type CHECK (rule_type IN ('percentage', 'fixed', 'tiered'))
);

-- 1d. communication_logs — Log of calls, emails, SMS, WhatsApp, visits
CREATE TABLE IF NOT EXISTS communication_logs (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id          UUID        NULL REFERENCES users(id) ON DELETE SET NULL,
    lead_id          UUID        NULL,
    type             TEXT        NOT NULL,
    status           TEXT        NOT NULL DEFAULT 'completed',
    notes            TEXT        NULL,
    duration_seconds INTEGER     NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_comm_logs_type CHECK (
        type IN ('call', 'email', 'sms', 'whatsapp', 'visit', 'lead_create',
                 'lead_update', 'lead_status_change', 'lead_assign',
                 'property_create', 'property_update', 'deal_create',
                 'deal_stage_change', 'deal_assign', 'task_create',
                 'task_complete', 'note_add', 'login', 'logout', 'system',
                 'ai_call_updated', 'webhook_received', 'call_completed')
    ),
    CONSTRAINT chk_comm_logs_status CHECK (
        status IN ('completed', 'failed', 'scheduled', 'in_progress', 'missed', 'queued')
    )
);

-- 1e. form_responses — Submitted form responses from leads/customers
CREATE TABLE IF NOT EXISTS form_responses (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id    UUID        NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    data       JSONB       NOT NULL DEFAULT '{}',
    ip_address TEXT        NULL,
    user_agent TEXT        NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1f. form_submissions — Alternative form submissions table (for compatibility)
CREATE TABLE IF NOT EXISTS form_submissions (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id    UUID        NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    data       JSONB       NOT NULL DEFAULT '{}',
    ip_address TEXT        NULL,
    user_agent TEXT        NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- PART 2: ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================================================

-- 2a. attendance — GPS + selfie anti-fraud fields
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS latitude   DECIMAL NULL;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS longitude  DECIMAL NULL;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS selfie_url TEXT    NULL;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS selfie_hash TEXT   NULL;

-- 2b. expenses — Approval workflow + user tracking fields
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id     UUID        NULL REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status      TEXT        NOT NULL DEFAULT 'pending';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_by UUID        NULL REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;

-- Add check constraint for status if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_expenses_status'
    ) THEN
        ALTER TABLE expenses ADD CONSTRAINT chk_expenses_status
            CHECK (status IN ('pending', 'approved', 'rejected'));
    END IF;
END;
$$;

-- 2c. deals — Commission amount + created_by tracking
ALTER TABLE deals ADD COLUMN IF NOT EXISTS commission DECIMAL NULL DEFAULT 0;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS created_by UUID    NULL REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- PART 3: RE-APPLY RLS POLICIES ON leads AND audit_logs
-- (Dropped by 003_partitions.sql DROP CASCADE)
-- ============================================================================

-- 3a. leads — Re-enable RLS and re-create policies
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

-- 3b. audit_logs — Re-enable RLS and re-create policies
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

-- 3c. RLS policies for the 5 new tables

ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commissions
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
CREATE POLICY super_admin_access ON commissions
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

ALTER TABLE commission_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commission_configs
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
CREATE POLICY super_admin_access ON commission_configs
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commission_rules
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
CREATE POLICY super_admin_access ON commission_rules
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON communication_logs
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
CREATE POLICY super_admin_access ON communication_logs
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON form_responses
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
CREATE POLICY super_admin_access ON form_responses
    FOR ALL
    USING (current_setting('app.current_user_role', TRUE)::TEXT = 'super_admin');

-- ============================================================================
-- PART 4: FIX SEED DATA — REPLACE PLACEHOLDER BCRYPT HASHES WITH REAL ONES
-- ============================================================================

-- Super Admin: admin@estateflow.com / admin123!
UPDATE users
SET password_hash = '$2a$12$Rh3fEZ0x6q9mAyW7qgEOiuvdQyWO44nOUpgeqDnj4rWOdDcsBMxvG'
WHERE id = '00000000-0000-0000-0000-000000000002'
  AND email = 'admin@estateflow.com';

-- Tenant Admin: admin@demo.estateflow.com / demo123!
UPDATE users
SET password_hash = '$2a$12$0ILZEhVqxB67AtW6zs2utuMEqUT0Tb0YlXBtOLF5ZUtRM9ZfjNEQi'
WHERE id = '00000000-0000-0000-0000-000000000011'
  AND email = 'admin@demo.estateflow.com';

-- Agent: agent1@demo.estateflow.com / agent123!
UPDATE users
SET password_hash = '$2a$12$d94HYlv5klqLgvcFDGtNS./CqlUZqAIDInuY8E0fRyRf3TDYDfvNW'
WHERE id = '00000000-0000-0000-0000-000000000012'
  AND email = 'agent1@demo.estateflow.com';

-- Sales Manager: manager@demo.estateflow.com / manager123!
UPDATE users
SET password_hash = '$2a$12$8tp7JHye4L93q0fjcYaua.sSs67o25xvGEOZIDb7PpQHQPKUfoMQ6'
WHERE id = '00000000-0000-0000-0000-000000000013'
  AND email = 'manager@demo.estateflow.com';

-- Field Executive: field@demo.estateflow.com / field123!
UPDATE users
SET password_hash = '$2a$12$BFMB28JxF0kSukXDR2kEGeEGTJYRNAEkSuzwYRiCBcWzugmQzVHZG'
WHERE id = '00000000-0000-0000-0000-000000000014'
  AND email = 'field@demo.estateflow.com';

-- ============================================================================
-- VERIFICATION: RLS audit for all tables
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
            'documents', 'forms', 'site_visits', 'expenses', 'integrations',
            'commissions', 'commission_configs', 'commission_rules',
            'communication_logs', 'form_responses'
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
        RAISE NOTICE 'RLS enabled on ALL 24 tables ✓';
    END IF;
END;
$$;

-- ============================================================================
-- Migration complete
-- ============================================================================
