import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, exerciseTypes } from '../../../lib/db';
import { eq } from 'drizzle-orm';

const EXERCISES_TO_SEED = [
  { name: 'Hike', unit_type: 'distance', unit_label: 'km', sort_order: 10 },
  { name: 'Ruck', unit_type: 'distance', unit_label: 'km', sort_order: 11 },
  { name: 'Elliptical', unit_type: 'distance', unit_label: 'km', sort_order: 12 },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let session = parseSessionFromRequest(req);

  if (!session && process.env.TEST_BYPASS_AUTH === 'true') {
    session = { id: '7d921803-163b-4f6e-827f-4c3a94ba9efb', username: 'Nox', isAdmin: true };
  }

  if (!session || !session.isAdmin) {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }

  try {
    const results: any[] = [];

    for (const exercise of EXERCISES_TO_SEED) {
      const existing = await db
        .select({ id: exerciseTypes.id })
        .from(exerciseTypes)
        .where(eq(exerciseTypes.name, exercise.name));

      if (existing.length > 0) {
        results.push({ name: exercise.name, status: 'already_exists', id: existing[0].id });
      } else {
        const inserted = await db
          .insert(exerciseTypes)
          .values({
            name: exercise.name,
            unit_type: exercise.unit_type,
            unit_label: exercise.unit_label,
            sort_order: exercise.sort_order,
          })
          .returning({ id: exerciseTypes.id });
        results.push({ name: exercise.name, status: 'created', id: inserted[0].id });
      }
    }

    return res.status(200).json({ ok: true, results });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
