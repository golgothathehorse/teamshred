import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../../../lib/auth';
import { db, gymSessions, gymSessionExercises, gymSessionSets } from '../../../../../lib/db';
import { eq, and, sql } from 'drizzle-orm';

async function verifySessionExerciseOwnership(sessionExerciseId: string, sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: gymSessionExercises.id })
    .from(gymSessionExercises)
    .where(and(
      eq(gymSessionExercises.id, sessionExerciseId),
      eq(gymSessionExercises.session_id, sessionId)
    ));
  return !!row;
}

async function verifySetOwnership(setId: string, sessionId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT gss.id FROM gym_session_sets gss
    JOIN gym_session_exercises gse ON gse.id = gss.session_exercise_id
    WHERE gss.id = ${setId} AND gse.session_id = ${sessionId}
  `);
  return (result.rows as any[]).length > 0;
}

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
    const { session_exercise_id, weight_kg, reps, is_warmup, notes } = req.body;
    if (!session_exercise_id) {
      return res.status(400).json({ ok: false, error: 'Session exercise ID is required' });
    }

    if (!(await verifySessionExerciseOwnership(session_exercise_id, sessionId))) {
      return res.status(403).json({ ok: false, error: 'Exercise does not belong to this session' });
    }

    const maxSet = await db
      .select({ max: sql<number>`COALESCE(MAX(set_number), 0)` })
      .from(gymSessionSets)
      .where(eq(gymSessionSets.session_exercise_id, session_exercise_id));

    const [set] = await db.insert(gymSessionSets).values({
      session_exercise_id,
      set_number: (maxSet[0]?.max ?? 0) + 1,
      weight_kg: weight_kg ?? null,
      reps: reps ?? null,
      is_warmup: is_warmup ?? false,
      notes: notes?.trim() || null,
    }).returning();

    return res.status(201).json({ ok: true, set });
  }

  if (req.method === 'PATCH') {
    const { set_id, weight_kg, reps, is_warmup, notes } = req.body;
    if (!set_id) {
      return res.status(400).json({ ok: false, error: 'Set ID is required' });
    }

    if (!(await verifySetOwnership(set_id, sessionId))) {
      return res.status(403).json({ ok: false, error: 'Set does not belong to this session' });
    }

    const updates: any = {};
    if (weight_kg !== undefined) updates.weight_kg = weight_kg;
    if (reps !== undefined) updates.reps = reps;
    if (is_warmup !== undefined) updates.is_warmup = is_warmup;
    if (notes !== undefined) updates.notes = notes?.trim() || null;

    const [updated] = await db
      .update(gymSessionSets)
      .set(updates)
      .where(eq(gymSessionSets.id, set_id))
      .returning();

    return res.status(200).json({ ok: true, set: updated });
  }

  if (req.method === 'DELETE') {
    const { set_id } = req.body;
    if (!set_id) {
      return res.status(400).json({ ok: false, error: 'Set ID is required' });
    }

    if (!(await verifySetOwnership(set_id, sessionId))) {
      return res.status(403).json({ ok: false, error: 'Set does not belong to this session' });
    }

    await db.delete(gymSessionSets).where(eq(gymSessionSets.id, set_id));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
