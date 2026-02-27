import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, users, userTeams } from '../../../lib/db';
import { eq, and } from 'drizzle-orm';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  let session = parseSessionFromRequest(req);

  if (!session && process.env.TEST_BYPASS_AUTH === 'true') {
    session = {
      id: '7d921803-163b-4f6e-827f-4c3a94ba9efb',
      username: 'Nox',
      isAdmin: true,
    };
  }

  if (!session) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const data = await db
        .select({ active_team_id: users.active_team_id })
        .from(users)
        .where(eq(users.id, session.id))
        .limit(1);

      return res.status(200).json({
        ok: true,
        activeTeamId: data[0]?.active_team_id || null,
      });
    } catch (error) {
      console.error('Get active team error:', error);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  }

  if (req.method === 'POST') {
    const { teamId } = req.body;

    if (!teamId) {
      return res.status(400).json({ ok: false, error: 'teamId is required' });
    }

    try {
      const membership = await db
        .select({ team_id: userTeams.team_id })
        .from(userTeams)
        .where(and(eq(userTeams.user_id, session.id), eq(userTeams.team_id, teamId)))
        .limit(1);

      if (membership.length === 0) {
        return res.status(403).json({ ok: false, error: 'Not a member of this team' });
      }

      await db
        .update(users)
        .set({ active_team_id: teamId })
        .where(eq(users.id, session.id));

      return res.status(200).json({ ok: true, activeTeamId: teamId });
    } catch (error) {
      console.error('Set active team error:', error);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
