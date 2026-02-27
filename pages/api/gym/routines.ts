import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, gymRoutines, gymRoutineExercises, gymExercises } from '../../../lib/db';
import { eq, and, asc, desc } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = parseSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Please log in' });
  }

  if (req.method === 'GET') {
    const routines = await db
      .select()
      .from(gymRoutines)
      .where(eq(gymRoutines.user_id, session.id))
      .orderBy(desc(gymRoutines.updated_at));

    const routinesWithExercises = [];
    for (const routine of routines) {
      const exercises = await db
        .select({
          id: gymRoutineExercises.id,
          exercise_id: gymRoutineExercises.exercise_id,
          sort_order: gymRoutineExercises.sort_order,
          default_sets: gymRoutineExercises.default_sets,
          default_reps: gymRoutineExercises.default_reps,
          default_weight_kg: gymRoutineExercises.default_weight_kg,
          exercise_name: gymExercises.name,
          muscle_group: gymExercises.muscle_group,
        })
        .from(gymRoutineExercises)
        .innerJoin(gymExercises, eq(gymRoutineExercises.exercise_id, gymExercises.id))
        .where(eq(gymRoutineExercises.routine_id, routine.id))
        .orderBy(asc(gymRoutineExercises.sort_order));

      routinesWithExercises.push({ ...routine, exercises });
    }

    return res.status(200).json({ ok: true, routines: routinesWithExercises });
  }

  if (req.method === 'POST') {
    const { name, description, exercises } = req.body;
    if (!name) {
      return res.status(400).json({ ok: false, error: 'Routine name is required' });
    }

    const [routine] = await db.insert(gymRoutines).values({
      user_id: session.id,
      name,
      description: description || null,
    }).returning();

    if (exercises && Array.isArray(exercises)) {
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        await db.insert(gymRoutineExercises).values({
          routine_id: routine.id,
          exercise_id: ex.exercise_id,
          sort_order: i,
          default_sets: ex.default_sets || 3,
          default_reps: ex.default_reps || 10,
          default_weight_kg: ex.default_weight_kg || null,
        });
      }
    }

    return res.status(201).json({ ok: true, routine });
  }

  if (req.method === 'DELETE') {
    const { routine_id } = req.body;
    if (!routine_id) {
      return res.status(400).json({ ok: false, error: 'Routine ID is required' });
    }

    const [routine] = await db
      .select()
      .from(gymRoutines)
      .where(and(eq(gymRoutines.id, routine_id), eq(gymRoutines.user_id, session.id)));

    if (!routine) {
      return res.status(404).json({ ok: false, error: 'Routine not found' });
    }

    await db.delete(gymRoutines).where(eq(gymRoutines.id, routine_id));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
