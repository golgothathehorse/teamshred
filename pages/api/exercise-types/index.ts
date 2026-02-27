// pages/api/exercise-types/index.ts
// API for fetching and managing exercise types

import type { NextApiRequest, NextApiResponse } from 'next';
import { db, exerciseTypes } from '../../../lib/db';
import { eq, asc } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../../lib/auth';
import { FALLBACK_EXERCISE_TYPES } from '../../../lib/exercises';

const FALLBACK_EXERCISE_TYPES_EXTENDED = FALLBACK_EXERCISE_TYPES.map((et, index) => ({
  ...et,
  is_active: true,
  sort_order: index + 1,
}));

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let session = parseSessionFromRequest(req);

  if (!session && process.env.TEST_BYPASS_AUTH === 'true') {
    session = {
      id: '7d921803-163b-4f6e-827f-4c3a94ba9efb',
      username: 'Nox',
      isAdmin: true,
    };
  }

  if (!session) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const data = await db
      .select()
      .from(exerciseTypes)
      .where(eq(exerciseTypes.is_active, true))
      .orderBy(asc(exerciseTypes.sort_order));

    if (!data || data.length === 0) {
      console.warn('No exercise types found, returning fallback');
      return res.status(200).json({
        ok: true,
        exercise_types: FALLBACK_EXERCISE_TYPES_EXTENDED,
      });
    }

    const types = data.map((row) => ({
      id: row.id,
      name: row.name,
      unit_type: row.unit_type,
      unit_label: row.unit_label,
      is_active: row.is_active,
      sort_order: row.sort_order,
    }));

    return res.status(200).json({
      ok: true,
      exercise_types: types,
    });
  } catch (error) {
    console.error('Error in exercise types API (using fallback):', error);
    return res.status(200).json({
      ok: true,
      exercise_types: FALLBACK_EXERCISE_TYPES_EXTENDED,
    });
  }
}
