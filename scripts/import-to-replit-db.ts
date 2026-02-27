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
  ssl: false,
});

const DATA_DIR = './data-export';

interface ImportResult {
  table: string;
  imported: number;
  skipped: number;
  errors: string[];
}

async function importTable(tableName: string, columns: string[]): Promise<ImportResult> {
  const result: ImportResult = { table: tableName, imported: 0, skipped: 0, errors: [] };
  
  const filePath = path.join(DATA_DIR, `${tableName}.json`);
  if (!fs.existsSync(filePath)) {
    result.errors.push('File not found');
    return result;
  }
  
  const rawData = fs.readFileSync(filePath, 'utf-8');
  const records = JSON.parse(rawData);
  
  if (!Array.isArray(records) || records.length === 0) {
    console.log(`  ${tableName}: No records to import`);
    return result;
  }
  
  for (const record of records) {
    try {
      const values: any[] = [];
      const placeholders: string[] = [];
      const validColumns: string[] = [];
      
      let idx = 1;
      for (const col of columns) {
        if (record[col] !== undefined) {
          validColumns.push(col);
          placeholders.push(`$${idx++}`);
          values.push(record[col]);
        }
      }
      
      if (validColumns.length === 0) {
        result.skipped++;
        continue;
      }
      
      const query = `
        INSERT INTO ${tableName} (${validColumns.join(', ')})
        VALUES (${placeholders.join(', ')})
        ON CONFLICT DO NOTHING
      `;
      
      const res = await pool.query(query, values);
      if (res.rowCount && res.rowCount > 0) {
        result.imported++;
      } else {
        result.skipped++;
      }
    } catch (err: any) {
      result.errors.push(`Record error: ${err.message}`);
    }
  }
  
  console.log(`  ${tableName}: ${result.imported} imported, ${result.skipped} skipped`);
  return result;
}

async function main() {
  console.log('Starting import to Replit PostgreSQL...\n');
  
  const results: ImportResult[] = [];
  
  console.log('Importing teams...');
  results.push(await importTable('teams', ['id', 'name', 'motto', 'created_at']));
  
  console.log('Importing users...');
  results.push(await importTable('users', ['id', 'username', 'password_hash', 'is_admin', 'team_id', 'active_team_id', 'created_at']));
  
  console.log('Importing user_teams...');
  results.push(await importTable('user_teams', ['user_id', 'team_id', 'created_at']));
  
  console.log('Importing profiles...');
  results.push(await importTable('profiles', [
    'user_id', 'pb_weight_kg', 'pb_date', 'bf_percent', 'bf_date',
    'goal_weight', 'goal_bf', 'sex', 'age', 'height_cm',
    'activity_level', 'tdee_goal', 'cut_level', 'bulk_level',
    'shredulator_settings', 'share_workout_history', 'updated_at'
  ]));
  
  console.log('Importing weights...');
  results.push(await importTable('weights', [
    'id', 'user_id', 'weigh_date', 'weight_kg', 'is_monday', 'is_friday', 'comment', 'inserted_at'
  ]));
  
  console.log('Importing body_fat_logs...');
  results.push(await importTable('body_fat_logs', [
    'id', 'user_id', 'log_date', 'bf_percent', 'comment', 'inserted_at'
  ]));
  
  console.log('Importing banners...');
  results.push(await importTable('banners', [
    'id', 'team_id', 'message', 'type', 'created_by', 'created_at'
  ]));
  
  console.log('Importing journal_entries...');
  results.push(await importTable('journal_entries', [
    'id', 'user_id', 'category', 'content', 'created_at'
  ]));
  
  console.log('Importing challenges...');
  results.push(await importTable('challenges', [
    'id', 'scope', 'template_key', 'title', 'description', 'stake_text',
    'stake_amount', 'stake_currency', 'starts_on', 'ends_on', 'status',
    'created_by_user_id', 'winner_user_id', 'completed_at', 'result_json',
    'target_weight_kg', 'created_at', 'updated_at'
  ]));
  
  console.log('Importing challenge_participants...');
  results.push(await importTable('challenge_participants', [
    'id', 'challenge_id', 'user_id', 'role', 'state', 'joined_at', 'created_at'
  ]));
  
  console.log('Importing challenge_tasks...');
  results.push(await importTable('challenge_tasks', [
    'id', 'challenge_id', 'name', 'exercise_type_id', 'unit_type',
    'target_type', 'target_value', 'schedule_json', 'sort_order', 'created_at'
  ]));
  
  console.log('Importing challenge_entries...');
  results.push(await importTable('challenge_entries', [
    'id', 'challenge_id', 'task_id', 'user_id', 'entry_date',
    'value', 'completed', 'note', 'inserted_at'
  ]));
  
  console.log('\n--- Import Summary ---');
  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  
  for (const r of results) {
    totalImported += r.imported;
    totalSkipped += r.skipped;
    totalErrors += r.errors.length;
    if (r.errors.length > 0) {
      console.log(`${r.table}: ${r.imported} imported, ${r.errors.length} errors`);
    }
  }
  
  console.log(`\nTotal: ${totalImported} records imported, ${totalSkipped} skipped, ${totalErrors} errors`);
  
  await pool.end();
}

main().catch(console.error);
