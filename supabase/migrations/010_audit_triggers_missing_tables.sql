-- ============================================================================
-- ESTATEFLOW CRM — Migration 010: Audit Triggers for Missing Tables
-- Migration: 010_audit_triggers_missing_tables.sql
-- Description:
--   Adds AFTER INSERT/UPDATE/DELETE audit triggers to tables that were
--   missing from the initial 006_triggers.sql migration:
--     expenses, attendance, site_visits, forms, documents
--   Also adds updated_at triggers for documents (if not already present).
-- ============================================================================

-- ############################################################################
-- 1. AUDIT TRIGGERS — Apply to expenses, attendance, site_visits, forms, documents
-- ############################################################################

-- 1a. expenses — Audit INSERT, UPDATE, DELETE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_expenses_audit'
    ) THEN
        CREATE TRIGGER trg_expenses_audit
            AFTER INSERT OR UPDATE OR DELETE ON expenses
            FOR EACH ROW
            EXECUTE FUNCTION app.audit_trigger_func();
    END IF;
END;
$$;

-- 1b. attendance — Audit INSERT, UPDATE, DELETE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_attendance_audit'
    ) THEN
        CREATE TRIGGER trg_attendance_audit
            AFTER INSERT OR UPDATE OR DELETE ON attendance
            FOR EACH ROW
            EXECUTE FUNCTION app.audit_trigger_func();
    END IF;
END;
$$;

-- 1c. site_visits — Audit INSERT, UPDATE, DELETE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_site_visits_audit'
    ) THEN
        CREATE TRIGGER trg_site_visits_audit
            AFTER INSERT OR UPDATE OR DELETE ON site_visits
            FOR EACH ROW
            EXECUTE FUNCTION app.audit_trigger_func();
    END IF;
END;
$$;

-- 1d. forms — Audit INSERT, UPDATE, DELETE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_forms_audit'
    ) THEN
        CREATE TRIGGER trg_forms_audit
            AFTER INSERT OR UPDATE OR DELETE ON forms
            FOR EACH ROW
            EXECUTE FUNCTION app.audit_trigger_func();
    END IF;
END;
$$;

-- 1e. documents — Audit INSERT, UPDATE, DELETE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_documents_audit'
    ) THEN
        CREATE TRIGGER trg_documents_audit
            AFTER INSERT OR UPDATE OR DELETE ON documents
            FOR EACH ROW
            EXECUTE FUNCTION app.audit_trigger_func();
    END IF;
END;
$$;

-- ############################################################################
-- 2. UPDATED_AT TRIGGER for documents (ensure it exists)
-- ############################################################################

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_documents_updated_at'
    ) THEN
        CREATE TRIGGER trg_documents_updated_at
            BEFORE UPDATE ON documents
            FOR EACH ROW
            EXECUTE FUNCTION app.update_updated_at_column();
    END IF;
END;
$$;

-- ============================================================================
-- VERIFICATION: Count audit triggers across all tables
-- ============================================================================
DO $$
DECLARE
    audit_count INT;
    updated_at_count INT;
BEGIN
    SELECT COUNT(*) INTO audit_count
    FROM pg_trigger
    WHERE tgname LIKE 'trg_%_audit';

    SELECT COUNT(*) INTO updated_at_count
    FROM pg_trigger
    WHERE tgname LIKE 'trg_%_updated_at';

    RAISE NOTICE 'Audit triggers installed: % (should be 11: tenants, users, leads, properties, deals, tasks, expenses, attendance, site_visits, forms, documents)', audit_count;
    RAISE NOTICE 'Updated-at triggers installed: %', updated_at_count;
END;
$$;

-- ============================================================================
-- Migration complete
-- ============================================================================
