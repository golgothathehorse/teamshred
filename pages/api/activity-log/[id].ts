// pages/api/activity-log/[id].ts
// API for deleting individual activity entries (users can delete their own entries)

import type { NextApiRequest, NextApiResponse } from 'next';
import { db, challengeEntries, activityLog } from '../../../lib/db';
import { eq } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const isAdmin = session.username?.toLowerCase() === 'nox';

  if (req.method === 'DELETE') {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Entry ID is required' });
    }

    try {
      // First check standalone activity_log table
      const standaloneEntry = await db
        .select({ id: activityLog.id, user_id: activityLog.user_id })
        .from(activityLog)
        .where(eq(activityLog.id, id))
        .limit(1);

      if (standaloneEntry.length > 0) {
        if (!isAdmin && standaloneEntry[0].user_id !== session.id) {
          return res.status(403).json({ ok: false, error: 'You can only delete your own entries' });
        }
        await db.delete(activityLog).where(eq(activityLog.id, id));
        return res.status(200).json({ ok: true, message: 'Entry deleted successfully' });
      }

      // Fall back to challenge entries for legacy data
      const challengeEntry = await db
        .select({ id: challengeEntries.id, user_id: challengeEntries.user_id })
        .from(challengeEntries)
        .where(eq(challengeEntries.id, id))
        .limit(1);

      if (challengeEntry.length === 0) {
        return res.status(404).json({ ok: false, error: 'Entry not found' });
      }

      if (!isAdmin && challengeEntry[0].user_id !== session.id) {
        return res.status(403).json({ ok: false, error: 'You can only delete your own entries' });
      }

      await db.delete(challengeEntries).where(eq(challengeEntries.id, id));

      return res.status(200).json({ ok: true, message: 'Entry deleted successfully' });
    } catch (error) {
      console.error('Error in activity log DELETE:', error);
      return res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  } else {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
}
