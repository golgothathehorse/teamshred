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

  const exerciseId = req.query.exercise_id as string;
  if (!exerciseId) {
    return res.status(400).json({ ok: false, error: 'exercise_id is required' });
  }

  const result = await db.execute(sql`
    SELECT
      gs.session_date,
      MAX(gss.weight_kg) as max_weight,
      MAX(gss.reps) as max_reps,
      COUNT(gss.id) as total_sets,
      SUM(COALESCE(gss.weight_kg, 0) * COALESCE(gss.reps, 0)) as total_volume
    FROM gym_session_sets gss
    JOIN gym_session_exercises gse ON gse.id = gss.session_exercise_id
    JOIN gym_sessions gs ON gs.id = gse.session_id
    WHERE gs.user_id = ${session.id}
      AND gse.exercise_id = ${exerciseId}
      AND gs.status = 'completed'
      AND gss.is_warmup = false
    GROUP BY gs.session_date
    ORDER BY gs.session_date ASC
  `);

  const progress = (result.rows as any[]).map(row => ({
    date: row.session_date,
    max_weight: Number(row.max_weight) || 0,
    max_reps: Number(row.max_reps) || 0,
    total_sets: Number(row.total_sets) || 0,
    total_volume: Number(row.total_volume) || 0,
  }));

  return res.status(200).json({ ok: true, progress });
}
