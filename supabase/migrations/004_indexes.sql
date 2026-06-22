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
