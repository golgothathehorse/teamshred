// pages/api/debug-db.ts
// Temporary debug endpoint to check database connection
import type { NextApiRequest, NextApiResponse } from 'next';
import { db, users } from '../../lib/db';
import { sql } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const hasProdUrl = !!process.env.PROD_DATABASE_URL;
    const isDeployment = process.env.REPLIT_DEPLOYMENT === '1';
    
    const result = await db.execute(sql`SELECT current_database() as db, COUNT(*) as user_count FROM users`);
    const row = result.rows[0] as { db: string; user_count: string };
    
    return res.status(200).json({
      ok: true,
      has_prod_url: hasProdUrl,
      is_deployment: isDeployment,
      database_name: row?.db || 'unknown',
      user_count: row?.user_count || '0',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      ok: false,
      error: errorMessage,
      has_prod_url: !!process.env.PROD_DATABASE_URL,
      is_deployment: process.env.REPLIT_DEPLOYMENT === '1',
    });
  }
}
