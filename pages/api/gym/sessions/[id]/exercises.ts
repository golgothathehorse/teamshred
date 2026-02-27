import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../../../lib/auth';
import { db, gymSessions, gymSessionExercises, gymSessionSets } from '../../../../../lib/db';
import { eq, and, sql } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = parseSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Please log in' });
  }

  const sessionId = req.query.id as string;

  const [gymSession] = await db
    .select()
    .from(gymSessions)
    .where(and(eq(gymSessions.id, sessionId), eq(gymSessions.user_id, session.id)));

  if (!gymSession) {
    return res.status(404).json({ ok: false, error: 'Session not found' });
  }

  if (req.method === 'POST') {
    const { exercise_id, sort_order } = req.body;
    if (!exercise_id) {
      return res.status(400).json({ ok: false, error: 'Exercise ID is required' });
    }

    const maxOrder = await db
      .select({ max: sql<number>`COALESCE(MAX(sort_order), -1)` })
      .from(gymSessionExercises)
      .where(eq(gymSessionExercises.session_id, sessionId));

    const [sessionExercise] = await db.insert(gymSessionExercises).values({
      session_id: sessionId,
      exercise_id,
      sort_order: sort_order ?? (maxOrder[0]?.max ?? -1) + 1,
    }).returning();

    return res.status(201).json({ ok: true, sessionExercise });
  }

  if (req.method === 'DELETE') {
    const { session_exercise_id } = req.body;
    if (!session_exercise_id) {
      return res.status(400).json({ ok: false, error: 'Session exercise ID is required' });
    }

    await db.delete(gymSessionExercises).where(
      and(
        eq(gymSessionExercises.id, session_exercise_id),
        eq(gymSessionExercises.session_id, sessionId)
      )
    );

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
