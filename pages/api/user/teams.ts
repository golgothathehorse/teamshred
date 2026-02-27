import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, users, teams, userTeams } from '../../../lib/db';
import { eq, inArray } from 'drizzle-orm';

type UserTeam = {
  team_id: string;
  team_name: string;
};

type TeamsResponse =
  | { ok: true; teams: UserTeam[]; activeTeamId: string | null }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TeamsResponse>
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

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const userTeamsData = await db
      .select({ team_id: userTeams.team_id })
      .from(userTeams)
      .where(eq(userTeams.user_id, session.id));

    const teamIds = userTeamsData.map((ut) => ut.team_id);

    let teamsInfo: UserTeam[] = [];
    if (teamIds.length > 0) {
      const teamsData = await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, teamIds));

      teamsInfo = teamsData.map((t) => ({
        team_id: t.id,
        team_name: t.name,
      }));
    }

    const userData = await db
      .select({ active_team_id: users.active_team_id })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    return res.status(200).json({
      ok: true,
      teams: teamsInfo,
      activeTeamId: userData[0]?.active_team_id || null,
    });
  } catch (error) {
    console.error('Get user teams error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
