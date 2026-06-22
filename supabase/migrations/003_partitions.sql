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
ALTER TABLE ai_call_queue
    ADD CONSTRAINT fk_ai_call_queue_lead
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;

ALTER TABLE calls
    ADD CONSTRAINT fk_calls_lead
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;

ALTER TABLE messages
    ADD CONSTRAINT fk_messages_lead
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;

ALTER TABLE deals
    ADD CONSTRAINT fk_deals_lead
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;

ALTER TABLE tasks
    ADD CONSTRAINT fk_tasks_lead
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;

ALTER TABLE documents
    ADD CONSTRAINT fk_documents_lead
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;

ALTER TABLE site_visits
    ADD CONSTRAINT fk_site_visits_lead
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;

-- Recreate FK references that pointed to audit_logs (none, audit_logs has no inbound FKs)

-- ============================================================================
-- Migration complete
-- ============================================================================
