import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, gymExercises } from '../../../lib/db';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import { GYM_EXERCISE_DATA } from '../../../lib/gymExerciseData';

let seeded = false;

async function ensureSeeded() {
  if (seeded) return;
  const existing = await db.select({ id: gymExercises.id }).from(gymExercises).limit(1);
  if (existing.length === 0) {
    for (const ex of GYM_EXERCISE_DATA) {
      await db.insert(gymExercises).values({
        name: ex.name,
        muscle_group: ex.muscle_group,
        split_category: ex.split_category,
        description: ex.description,
        safety_guide: ex.safety_guide,
        is_custom: false,
        is_active: true,
      });
    }
  }
  seeded = true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = parseSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Please log in' });
  }

  await ensureSeeded();

  if (req.method === 'GET') {
    const exercises = await db
      .select()
      .from(gymExercises)
      .where(eq(gymExercises.is_active, true))
      .orderBy(gymExercises.muscle_group, gymExercises.name);

    return res.status(200).json({ ok: true, exercises, userId: session.id });
  }

  if (req.method === 'POST') {
    const { name, muscle_group, split_category, description, safety_guide } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'Exercise name is required' });
    }

    const [exercise] = await db.insert(gymExercises).values({
      name: name.trim(),
      muscle_group: muscle_group?.trim() || 'Other',
      split_category: split_category?.trim() || null,
      description: description?.trim() || null,
      safety_guide: safety_guide?.trim() || null,
      is_custom: true,
      created_by_user_id: session.id,
      is_active: true,
    }).returning();

    return res.status(201).json({ ok: true, exercise });
  }

  if (req.method === 'PATCH') {
    const { id, name, muscle_group, split_category, description, safety_guide } = req.body;
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Exercise ID is required' });
    }

    const [existing] = await db
      .select()
      .from(gymExercises)
      .where(and(eq(gymExercises.id, id), eq(gymExercises.is_custom, true)));

    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Custom exercise not found' });
    }

    if (existing.created_by_user_id !== session.id) {
      return res.status(403).json({ ok: false, error: 'You can only edit exercises you created' });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name.trim() || existing.name;
    if (muscle_group !== undefined) updates.muscle_group = muscle_group.trim() || 'Other';
    if (split_category !== undefined) updates.split_category = split_category.trim() || null;
    if (description !== undefined) updates.description = description.trim() || null;
    if (safety_guide !== undefined) updates.safety_guide = safety_guide.trim() || null;

    const [updated] = await db
      .update(gymExercises)
      .set(updates)
      .where(eq(gymExercises.id, id))
      .returning();

    return res.status(200).json({ ok: true, exercise: updated });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
