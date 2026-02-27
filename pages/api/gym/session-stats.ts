import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db } from '../../../lib/db';
import { sql } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const session = parseSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Please log in' });
  }

  const result = await db.execute(sql`
    SELECT
      gs.id,
      gs.session_date,
      gs.name,
      gs.status,
      gs.started_at,
      gs.finished_at,
      COUNT(DISTINCT gse.id) as exercise_count,
      COUNT(gss.id) as set_count,
      COALESCE(SUM(COALESCE(gss.weight_kg, 0) * COALESCE(gss.reps, 0)), 0) as total_volume
    FROM gym_sessions gs
    LEFT JOIN gym_session_exercises gse ON gse.session_id = gs.id
    LEFT JOIN gym_session_sets gss ON gss.session_exercise_id = gse.id
    WHERE gs.user_id = ${session.id}
      AND gs.status = 'completed'
    GROUP BY gs.id
    ORDER BY gs.session_date DESC
    LIMIT 50
  `);

  const sessions = (result.rows as any[]).map(row => ({
    id: row.id,
    session_date: row.session_date,
    name: row.name,
    status: row.status,
    started_at: row.started_at,
    finished_at: row.finished_at,
    exercise_count: Number(row.exercise_count) || 0,
    set_count: Number(row.set_count) || 0,
    total_volume: Number(row.total_volume) || 0,
  }));

  return res.status(200).json({ ok: true, sessions });
}
