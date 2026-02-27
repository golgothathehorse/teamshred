import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, gymSessions, gymSessionExercises, gymSessionSets, gymExercises } from '../../../lib/db';
import { eq, and, desc, sql } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = parseSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Please log in' });
  }

  if (req.method === 'GET') {
    const sessions = await db
      .select()
      .from(gymSessions)
      .where(eq(gymSessions.user_id, session.id))
      .orderBy(desc(gymSessions.created_at));

    return res.status(200).json({ ok: true, sessions });
  }

  if (req.method === 'POST') {
    const { session_date, name } = req.body;
    if (!session_date) {
      return res.status(400).json({ ok: false, error: 'Session date is required' });
    }

    const [newSession] = await db.insert(gymSessions).values({
      user_id: session.id,
      session_date,
      status: 'active',
      name: name || null,
    }).returning();

    return res.status(201).json({ ok: true, session: newSession });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
