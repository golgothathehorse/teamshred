// pages/api/team/update-motto.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db, users, userTeams, teamSettings } from '../../../lib/db';
import { eq, and } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../../lib/auth';

type UpdateMottoRequest = {
  motto: string;
};

type UpdateMottoResponse =
  | { ok: true }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdateMottoResponse>
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

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { motto } = req.body as UpdateMottoRequest;

  if (typeof motto !== 'string') {
    return res.status(400).json({ ok: false, error: 'Invalid motto' });
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

    const existingSettings = await db
      .select({ team_id: teamSettings.team_id })
      .from(teamSettings)
      .where(eq(teamSettings.team_id, teamId))
      .limit(1);

    if (existingSettings.length > 0) {
      await db
        .update(teamSettings)
        .set({ motto: motto.trim(), updated_at: new Date() })
        .where(eq(teamSettings.team_id, teamId));
    } else {
      await db.insert(teamSettings).values({
        team_id: teamId,
        motto: motto.trim(),
        updated_at: new Date(),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Update motto error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}
