import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../../lib/auth';
import { db, gymSessions, gymSessionExercises, gymSessionSets, gymExercises } from '../../../../lib/db';
import { eq, and, asc } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = parseSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Please log in' });
  }

  const sessionId = req.query.id as string;

  if (req.method === 'GET') {
    const [gymSession] = await db
      .select()
      .from(gymSessions)
      .where(and(eq(gymSessions.id, sessionId), eq(gymSessions.user_id, session.id)));

    if (!gymSession) {
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }

    const exercises = await db
      .select({
        id: gymSessionExercises.id,
        exercise_id: gymSessionExercises.exercise_id,
        sort_order: gymSessionExercises.sort_order,
        notes: gymSessionExercises.notes,
        exercise_name: gymExercises.name,
        muscle_group: gymExercises.muscle_group,
      })
      .from(gymSessionExercises)
      .innerJoin(gymExercises, eq(gymSessionExercises.exercise_id, gymExercises.id))
      .where(eq(gymSessionExercises.session_id, sessionId))
      .orderBy(asc(gymSessionExercises.sort_order));

    const exerciseIds = exercises.map(e => e.id);
    let sets: any[] = [];
    if (exerciseIds.length > 0) {
      sets = await db
        .select()
        .from(gymSessionSets)
        .where(
          eq(gymSessionSets.session_exercise_id, exerciseIds[0])
        );

      if (exerciseIds.length > 1) {
        for (let i = 1; i < exerciseIds.length; i++) {
          const moreSets = await db
            .select()
            .from(gymSessionSets)
            .where(eq(gymSessionSets.session_exercise_id, exerciseIds[i]));
          sets = sets.concat(moreSets);
        }
      }
    }

    const exercisesWithSets = exercises.map(ex => ({
      ...ex,
      sets: sets
        .filter(s => s.session_exercise_id === ex.id)
        .sort((a: any, b: any) => a.set_number - b.set_number),
    }));

    return res.status(200).json({ ok: true, session: gymSession, exercises: exercisesWithSets });
  }

  if (req.method === 'PATCH') {
    const { status, name, notes } = req.body;

    const [gymSession] = await db
      .select()
      .from(gymSessions)
      .where(and(eq(gymSessions.id, sessionId), eq(gymSessions.user_id, session.id)));

    if (!gymSession) {
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }

    const updates: any = {};
    if (status !== undefined) {
      updates.status = status;
      if (status === 'completed') {
        updates.finished_at = new Date();
      }
    }
    if (name !== undefined) updates.name = name;
    if (notes !== undefined) updates.notes = notes;

    const [updated] = await db
      .update(gymSessions)
      .set(updates)
      .where(eq(gymSessions.id, sessionId))
      .returning();

    return res.status(200).json({ ok: true, session: updated });
  }

  if (req.method === 'DELETE') {
    const [gymSession] = await db
      .select()
      .from(gymSessions)
      .where(and(eq(gymSessions.id, sessionId), eq(gymSessions.user_id, session.id)));

    if (!gymSession) {
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }

    await db.delete(gymSessions).where(eq(gymSessions.id, sessionId));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
