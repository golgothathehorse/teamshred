import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const { Pool } = pg;

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('Missing DATABASE_URL environment variable');
  process.exit(1);
}

const pool = new Pool({
  connectionString: dbUrl,
});

const TABLES_TO_EXPORT = [
  'users',
  'teams',
  'user_teams',
  'profiles',
  'weights',
  'body_fat_logs',
  'waist_logs',
  'banners',
  'journal_entries',
  'challenges',
  'challenge_participants',
  'challenge_tasks',
  'challenge_entries',
  'exercise_types',
  'activity_log',
  'user_goals',
];

const OUTPUT_DIR = './data-export';

async function exportTable(tableName: string): Promise<{ name: string; count: number; error?: string }> {
  try {
    const result = await pool.query(`SELECT * FROM ${tableName}`);
    
    const filePath = path.join(OUTPUT_DIR, `${tableName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(result.rows || [], null, 2));
    
    console.log(`✓ ${tableName}: ${result.rows?.length || 0} records`);
    return { name: tableName, count: result.rows?.length || 0 };
  } catch (err: any) {
    if (err.code === '42P01') {
      console.log(`⚠ ${tableName}: Table does not exist`);
      const filePath = path.join(OUTPUT_DIR, `${tableName}.json`);
      fs.writeFileSync(filePath, JSON.stringify([], null, 2));
      return { name: tableName, count: 0, error: 'Table does not exist' };
    }
    console.error(`✗ ${tableName}: ${err.message}`);
    return { name: tableName, count: 0, error: err.message };
  }
}

async function main() {
  console.log('Exporting current database data...\n');
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results: { name: string; count: number; error?: string }[] = [];
  
  for (const table of TABLES_TO_EXPORT) {
    const result = await exportTable(table);
    results.push(result);
  }

  const summary = {
    exportDate: new Date().toISOString(),
    tables: results,
    totalRecords: results.reduce((sum, r) => sum + r.count, 0),
  };
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '_export_summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  console.log('\n=== Export Complete ===');
  console.log(`Total records: ${summary.totalRecords}`);
  
  await pool.end();
}

main().catch(console.error);
