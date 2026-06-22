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
        COALESCE(v_user_id, CASE WHEN TG_OP = 'DELETE' THEN OLD.updated_by ELSE NEW.updated_by END),
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
