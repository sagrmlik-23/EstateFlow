# EstateFlow CRM — Deployment Setup Guide
# ==========================================
# Step-by-step instructions to get the app running.

## Step 1: Create Supabase Project (Free)
# 1. Go to https://supabase.com → "New Project"
# 2. Name: "estateflow-crm"
# 3. Database password: save securely
# 4. Region: Mumbai (bom1) — for India low latency
# 5. Wait ~2 minutes for project creation

## Step 2: Get Supabase Credentials
# From Project Settings → Database:
# - DATABASE_URL (Connection string with password)
# - SUPABASE_URL (Project URL: https://xxx.supabase.co)
# - SUPABASE_ANON_KEY (Project Settings → API → anon public)
# - SUPABASE_SERVICE_ROLE_KEY (Project Settings → API → service_role)

## Step 3: Run Migrations
# Option A: Supabase CLI
#   npx supabase login
#   npx supabase link --project-ref <your-project-ref>
#   npx supabase db push
#
# Option B: Direct SQL
#   Use Supabase Dashboard → SQL Editor → copy-paste each migration
#   Files: supabase/migrations/001 through 007

## Step 4: Set Environment Variables
# Copy .env.example to .env.local and fill in:
# - REQUIRED: DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
# - REQUIRED: JWT_SECRET (generate: openssl rand -hex 32)
# - REQUIRED: ENCRYPTION_KEY (generate: openssl rand -hex 32)
# - OPTIONAL: RAZORPAY, BLAND_AI, EXOTEL, etc. (add when needed)

## Step 5: Git + Deploy
#   git add .
#   git commit -m "Initial commit: EstateFlow CRM"
#   git remote add origin https://github.com/<your-username>/estateflow-crm.git
#   git push -u origin main
#
# Then go to https://vercel.com → Import repo → Deploy
# Add all environment variables in Vercel dashboard

## Step 6: Verify
# Visit https://estateflow-crm.vercel.app → should show dashboard
