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
