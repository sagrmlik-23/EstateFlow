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
