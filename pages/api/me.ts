// pages/api/me.ts
// Returns the current user's basic info (id, username)
import type { NextApiRequest, NextApiResponse } from 'next';
import { db, users } from '../../lib/db';
import { eq } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../lib/auth';

type MeResponse =
  | { ok: true; user: { id: string; username: string } }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MeResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const session = parseSessionFromRequest(req);
    if (!session?.id) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    // Get user info
    const userRows = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    const user = userRows[0];
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    return res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
      },
    });
  } catch (err) {
    console.error('Error in /api/me:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
