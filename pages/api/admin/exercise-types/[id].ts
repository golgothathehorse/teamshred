// pages/api/admin/exercise-types/[id].ts
// GET - Get a single exercise type
// PATCH - Update an exercise type
// DELETE - Delete an exercise type

import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../../lib/auth';
import { db, exerciseTypes } from '../../../../lib/db';
import { eq, and, ne, ilike } from 'drizzle-orm';
import { VALID_UNIT_TYPES, UnitType } from '../../../../lib/exercises';

type ApiResponse = { ok: true; exercise_type?: any } | { ok: false; error: string };

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

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, error: 'Invalid exercise type ID' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, id);
  } else if (req.method === 'PATCH') {
    return handlePatch(req, res, id);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res, id);
  } else {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse<ApiResponse>, id: string) {
  try {
    const data = await db
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
      .where(eq(exerciseTypes.id, id))
      .limit(1);

    if (data.length === 0) {
      return res.status(404).json({ ok: false, error: 'Exercise type not found' });
    }

    return res.status(200).json({
      ok: true,
      exercise_type: { ...data[0], created_at: data[0].created_at?.toISOString() },
    });
  } catch (error) {
    console.error('Error in admin exercise type GET:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse<ApiResponse>, id: string) {
  try {
    const { name, unit_type, unit_label, is_active, sort_order } = req.body;

    const existing = await db.select({ id: exerciseTypes.id }).from(exerciseTypes).where(eq(exerciseTypes.id, id)).limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ ok: false, error: 'Exercise type not found' });
    }

    const updates: any = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ ok: false, error: 'Name cannot be empty' });
      }
      const duplicate = await db
        .select({ id: exerciseTypes.id })
        .from(exerciseTypes)
        .where(and(ilike(exerciseTypes.name, name.trim()), ne(exerciseTypes.id, id)))
        .limit(1);

      if (duplicate.length > 0) {
        return res.status(400).json({ ok: false, error: 'An exercise type with this name already exists' });
      }
      updates.name = name.trim();
    }

    if (unit_type !== undefined) {
      if (!VALID_UNIT_TYPES.includes(unit_type as UnitType)) {
        return res.status(400).json({ ok: false, error: `Unit type must be one of: ${VALID_UNIT_TYPES.join(', ')}` });
      }
      updates.unit_type = unit_type;
    }

    if (unit_label !== undefined) {
      if (typeof unit_label !== 'string' || unit_label.trim().length === 0) {
        return res.status(400).json({ ok: false, error: 'Unit label cannot be empty' });
      }
      updates.unit_label = unit_label.trim();
    }

    if (is_active !== undefined) {
      updates.is_active = Boolean(is_active);
    }

    if (sort_order !== undefined) {
      const num = Number(sort_order);
      if (isNaN(num) || num < 0) {
        return res.status(400).json({ ok: false, error: 'Sort order must be a non-negative number' });
      }
      updates.sort_order = num;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'No valid fields to update' });
    }

    const result = await db.update(exerciseTypes).set(updates).where(eq(exerciseTypes.id, id)).returning();

    return res.status(200).json({
      ok: true,
      exercise_type: { ...result[0], created_at: result[0].created_at?.toISOString() },
    });
  } catch (error) {
    console.error('Error in admin exercise type PATCH:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse<ApiResponse>, id: string) {
  try {
    const existing = await db.select({ id: exerciseTypes.id, name: exerciseTypes.name }).from(exerciseTypes).where(eq(exerciseTypes.id, id)).limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ ok: false, error: 'Exercise type not found' });
    }

    await db.delete(exerciseTypes).where(eq(exerciseTypes.id, id));

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('Error in admin exercise type DELETE:', error);
    if (error.message?.includes('violates foreign key constraint')) {
      return res.status(400).json({ ok: false, error: 'Cannot delete exercise type that is in use by challenges. Deactivate it instead.' });
    }
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
