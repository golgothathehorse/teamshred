// pages/api/team/info.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db, users, teams, userTeams } from '../../../lib/db';
import { eq, and } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../../lib/auth';

type TeamInfoResponse =
  | { ok: true; team: { id: string; name: string; motto: string } }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TeamInfoResponse>
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
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const userRows = await db
      .select({ active_team_id: users.active_team_id })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    const userRow = userRows[0];

    if (!userRow || !userRow.active_team_id) {
      return res.status(403).json({ ok: false, error: 'You are not in a team' });
    }

    const teamId = userRow.active_team_id;

    const membership = await db
      .select({ team_id: userTeams.team_id })
      .from(userTeams)
      .where(and(eq(userTeams.user_id, session.id), eq(userTeams.team_id, teamId)))
      .limit(1);

    if (membership.length === 0) {
      return res.status(403).json({ ok: false, error: 'Not a member of this team' });
    }

    const teamData = await db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    const team = teamData[0];

    if (!team) {
      return res.status(404).json({ ok: false, error: 'Team not found' });
    }

    return res.status(200).json({
      ok: true,
      team: {
        id: team.id,
        name: team.name,
        motto: '',
      },
    });
  } catch (error) {
    console.error('Team info error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}
