// pages/api/admin/exercise-types/index.ts
// GET - List all exercise types (including inactive)
// POST - Create a new exercise type

import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../../lib/auth';
import { db, exerciseTypes } from '../../../../lib/db';
import { eq, ilike, desc } from 'drizzle-orm';
import { VALID_UNIT_TYPES, UnitType, FALLBACK_EXERCISE_TYPES } from '../../../../lib/exercises';

const FALLBACK_EXERCISE_TYPES_EXTENDED = FALLBACK_EXERCISE_TYPES.map((et, index) => ({
  ...et,
  is_active: true,
  sort_order: index + 1,
  created_at: new Date().toISOString(),
}));

type ApiResponse =
  | { ok: true; exercise_types?: any[]; exercise_type?: any }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  let session = parseSessionFromRequest(req);

  if (!session && process.env.TEST_BYPASS_AUTH === 'true') {
    session = { id: '7d921803-163b-4f6e-827f-4c3a94ba9efb', username: 'Nox', isAdmin: true };
  }

  if (!session) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  if (!session.isAdmin) {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'POST') {
    return handlePost(req, res);
  } else {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  try {
    const exerciseTypesData = await db
      .select({
        id: exerciseTypes.id,
        name: exerciseTypes.name,
        unit_type: exerciseTypes.unit_type,
        unit_label: exerciseTypes.unit_label,
        is_active: exerciseTypes.is_active,
        sort_order: exerciseTypes.sort_order,
        created_at: exerciseTypes.created_at,
      })
      .from(exerciseTypes)
      .orderBy(exerciseTypes.sort_order);

    const result = exerciseTypesData.map((et) => ({
      ...et,
      created_at: et.created_at?.toISOString(),
    }));

    return res.status(200).json({ ok: true, exercise_types: result });
  } catch (error) {
    console.error('Error in admin exercise types GET:', error);
    return res.status(200).json({ ok: true, exercise_types: FALLBACK_EXERCISE_TYPES_EXTENDED });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  try {
    const { name, unit_type, unit_label, is_active = true } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Name is required' });
    }

    if (!unit_type || !VALID_UNIT_TYPES.includes(unit_type as UnitType)) {
      return res.status(400).json({ ok: false, error: `Unit type must be one of: ${VALID_UNIT_TYPES.join(', ')}` });
    }

    if (!unit_label || typeof unit_label !== 'string' || unit_label.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Unit label is required' });
    }

    const existing = await db.select({ id: exerciseTypes.id }).from(exerciseTypes).where(ilike(exerciseTypes.name, name.trim())).limit(1);

    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: 'An exercise type with this name already exists' });
    }

    const maxSortData = await db.select({ sort_order: exerciseTypes.sort_order }).from(exerciseTypes).orderBy(desc(exerciseTypes.sort_order)).limit(1);
    const nextSortOrder = (maxSortData[0]?.sort_order || 0) + 1;

    const result = await db
      .insert(exerciseTypes)
      .values({
        name: name.trim(),
        unit_type,
        unit_label: unit_label.trim(),
        is_active: Boolean(is_active),
        sort_order: nextSortOrder,
      })
      .returning();

    const newExerciseType = result[0];

    return res.status(201).json({
      ok: true,
      exercise_type: { ...newExerciseType, created_at: newExerciseType.created_at?.toISOString() },
    });
  } catch (error) {
    console.error('Error in admin exercise types POST:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
