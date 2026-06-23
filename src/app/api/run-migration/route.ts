import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET() {
  const results: string[] = [];
  const errors: string[] = [];

  try {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    // Read the combined migration
    const filePath = join(process.cwd(), 'supabase', 'COMBINED_MIGRATION.sql');
    const sql = readFileSync(filePath, 'utf8');

    results.push(`Read ${sql.length} bytes from COMBINED_MIGRATION.sql`);

    // Split into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    results.push(`Found ${statements.length} SQL statements`);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        // Use rpc to execute raw SQL - we'll use a different approach
        // Direct query via postgrest won't work for DDL, so we need to use the REST API
        const { error } = await supabase.rpc('exec_sql', { query: stmt + ';' });
        if (error) {
          // Fallback: try direct REST query
          const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ query: stmt + ';' }),
          });
          if (!resp.ok) {
            const text = await resp.text();
            errors.push(`[${i}] ${stmt.slice(0, 60)}...: ${text.slice(0, 200)}`);
            failed++;
          } else {
            success++;
          }
        } else {
          success++;
        }
      } catch (err: any) {
        errors.push(`[${i}] ${stmt.slice(0, 60)}...: ${err.message?.slice(0, 200) || err}`);
        failed++;
      }
    }

    results.push(`Executed: ${success} success, ${failed} failed`);

    return NextResponse.json({
      success: failed === 0,
      total: statements.length,
      success,
      failed,
      results,
      errors: errors.length > 0 ? errors.slice(0, 20) : [],
      totalErrors: errors.length,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || String(err),
    }, { status: 500 });
  }
}
