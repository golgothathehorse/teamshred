// pages/api/tracker/flaps/[id].ts
// DELETE - Delete a flaps log entry

import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../../lib/auth';
import { db, flapsLog } from '../../../../lib/db';
import { eq, and } from 'drizzle-orm';

type ApiResponse = { ok: true } | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
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

  if (req.method !== 'DELETE') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, error: 'Invalid entry ID' });
  }

  try {
    const isAdmin = session.username?.toLowerCase() === 'nox';

    // Verify ownership or admin
    const entry = await db
      .select({ id: flapsLog.id, user_id: flapsLog.user_id })
      .from(flapsLog)
      .where(eq(flapsLog.id, id))
      .limit(1);

    if (entry.length === 0) {
      return res.status(404).json({ ok: false, error: 'Entry not found' });
    }

    if (entry[0].user_id !== session.id && !isAdmin) {
      return res.status(403).json({ ok: false, error: 'Not authorized to delete this entry' });
    }

    await db.delete(flapsLog).where(eq(flapsLog.id, id));

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error deleting flaps entry:', error);
    return res.status(500).json({ ok: false, error: 'Failed to delete entry' });
  }
}
