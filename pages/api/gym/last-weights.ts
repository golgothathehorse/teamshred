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
    SELECT DISTINCT ON (ge.id)
      ge.id as exercise_id,
      gss.weight_kg,
      gss.reps
    FROM gym_session_sets gss
    JOIN gym_session_exercises gse ON gse.id = gss.session_exercise_id
    JOIN gym_exercises ge ON ge.id = gse.exercise_id
    JOIN gym_sessions gs ON gs.id = gse.session_id
    WHERE gs.user_id = ${session.id}
      AND gss.is_warmup = false
      AND gss.weight_kg IS NOT NULL
    ORDER BY ge.id, gss.created_at DESC
  `);

  const lastWeights: Record<string, { weight_kg: number; reps: number | null }> = {};
  for (const row of result.rows as any[]) {
    lastWeights[row.exercise_id] = {
      weight_kg: Number(row.weight_kg),
      reps: row.reps ? Number(row.reps) : null,
    };
  }

  return res.status(200).json({ ok: true, lastWeights });
}
