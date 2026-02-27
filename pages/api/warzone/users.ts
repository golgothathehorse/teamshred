// pages/api/warzone/users.ts
// GET /api/warzone/users - Return users for opponent selection

import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, users, userTeams } from '../../../lib/db';
import { eq, ne, asc, inArray } from 'drizzle-orm';

type UserResponse = {
  id: string;
  username: string;
};

type ApiResponse =
  | { ok: true; users: UserResponse[] }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== 'GET') {
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

  if (!session) {
    return res.status(401).json({ ok: false, error: 'Please log in to use Warzone' });
  }

  try {
    const currentUserData = await db
      .select({ active_team_id: users.active_team_id })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    const currentUser = currentUserData[0];

    if (!currentUser?.active_team_id) {
      const allUsers = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(ne(users.id, session.id))
        .orderBy(asc(users.username));

      return res.status(200).json({ ok: true, users: allUsers });
    }

    const teamMembersData = await db
      .select({ user_id: userTeams.user_id })
      .from(userTeams)
      .where(eq(userTeams.team_id, currentUser.active_team_id));

    const teamMemberIds = teamMembersData
      .map((tm) => tm.user_id)
      .filter((id) => id !== session.id);

    if (teamMemberIds.length === 0) {
      return res.status(200).json({ ok: true, users: [] });
    }

    const teamUsers = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, teamMemberIds))
      .orderBy(asc(users.username));

    return res.status(200).json({ ok: true, users: teamUsers });
  } catch (error) {
    console.error('Error in warzone/users:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
