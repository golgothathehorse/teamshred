import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, flapsLog } from '../../../lib/db';
import { eq, and, inArray } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
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

  if (!session || session.username.toLowerCase() !== 'nox') {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }

  const { flaps_ids } = req.body;

  if (!flaps_ids || !Array.isArray(flaps_ids) || flaps_ids.length === 0) {
    return res.status(400).json({ ok: false, error: 'flaps_ids array is required' });
  }

  try {
    await db.delete(flapsLog).where(inArray(flapsLog.id, flaps_ids));
    return res.status(200).json({ ok: true, message: `Deleted ${flaps_ids.length} flaps entries` });
  } catch (error) {
    console.error('Error cleaning up flaps:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
