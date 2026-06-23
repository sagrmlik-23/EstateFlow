import pg from 'pg';
import { readFileSync } from 'fs';

const PASSWORD = 'e47...t';

async function main() {
  // Try different connection approaches
  const configs = [
    // Approach 1: Pooler transaction mode (port 6543)
    {
      name: 'Pooler TX mode (6543)',
      config: {
        host: 'aws-0-ap-south-1.pooler.supabase.com',
        port: 6543,
        user: 'postgres.yravbzllprdyvcqdedtb',
        password: PASSWORD,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        statement_timeout: 120000,
        connectionTimeoutMillis: 10000,
      }
    },
    // Approach 2: Pooler session mode (port 5432)
    {
      name: 'Pooler Session mode (5432)',
      config: {
        host: 'aws-0-ap-south-1.pooler.supabase.com',
        port: 5432,
        user: 'postgres.yravbzllprdyvcqdedtb',
        password: PASSWORD,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        statement_timeout: 120000,
        connectionTimeoutMillis: 10000,
      }
    },
    // Approach 3: Direct via IPv4 workaround
    {
      name: 'Direct Supabase (resolve IPv4)',
      config: {
        host: 'db.yravbzllprdyvcqdedtb.supabase.co',
        port: 5432,
        user: 'postgres',
        password: PASSWORD,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        statement_timeout: 120000,
        connectionTimeoutMillis: 10000,
      }
    },
  ];

  let client = null;
  let connected = false;

  for (const { name, config } of configs) {
    try {
      console.log(`Trying: ${name}...`);
      client = new pg.Client(config);
      await client.connect();
      const res = await client.query('SELECT 1 AS connected');
      console.log(`✅ Connected via: ${name}`);
      connected = true;
      break;
    } catch (err) {
      console.log(`❌ ${name}: ${err.message.slice(0, 100)}`);
      if (client) {
        try { await client.end(); } catch {}
        client = null;
      }
    }
  }

  if (!connected) {
    console.log('\n❌ Could not connect to database via any method.');
    process.exit(1);
  }

  // Read and execute the combined migration
  console.log('\nReading COMBINED_MIGRATION.sql...');
  const sql = readFileSync('supabase/COMBINED_MIGRATION.sql', 'utf8');
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Found ${statements.length} SQL statements to execute.\n`);

  // Execute each statement
  let success = 0;
  let failed = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.slice(0, 80).replace(/\n/g, ' ');
    try {
      await client.query(stmt + ';');
      success++;
      if (success % 10 === 0) {
        console.log(`  Progress: ${success}/${statements.length}`);
      }
    } catch (err) {
      failed++;
      console.log(`  ❌ [${i + 1}] ${preview}...`);
      console.log(`     Error: ${err.message.slice(0, 150)}`);
    }
  }

  console.log(`\n✅ Done: ${success} succeeded, ${failed} failed out of ${statements.length}`);

  await client.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
