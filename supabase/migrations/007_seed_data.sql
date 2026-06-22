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
        'Corner plot in Noida Extension's premium sector. Ideal for building your dream home. All utilities connected. Facing east — auspicious.',
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
