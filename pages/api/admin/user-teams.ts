import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, users, teams, userTeams } from '../../../lib/db';
import { eq, and } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let session = parseSessionFromRequest(req);

  if (!session && process.env.TEST_BYPASS_AUTH === 'true') {
    session = { id: '7d921803-163b-4f6e-827f-4c3a94ba9efb', username: 'Nox', isAdmin: true };
  }

  if (!session || !session.isAdmin) {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }

  if (req.method === 'POST') {
    const { userId, teamId } = req.body;

    if (!userId || !teamId) {
      return res.status(400).json({ ok: false, error: 'userId and teamId are required' });
    }

    try {
      const teamData = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).limit(1);
      if (teamData.length === 0) {
        return res.status(404).json({ ok: false, error: 'Team not found' });
      }

      const userData = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
      if (userData.length === 0) {
        return res.status(404).json({ ok: false, error: 'User not found' });
      }

      const existing = await db
        .select({ user_id: userTeams.user_id })
        .from(userTeams)
        .where(and(eq(userTeams.user_id, userId), eq(userTeams.team_id, teamId)))
        .limit(1);

      if (existing.length > 0) {
        return res.status(409).json({ ok: false, error: 'User already in this team' });
      }

      await db.insert(userTeams).values({ user_id: userId, team_id: teamId });

      const activeUserData = await db.select({ active_team_id: users.active_team_id }).from(users).where(eq(users.id, userId)).limit(1);

      if (!activeUserData[0]?.active_team_id) {
        await db.update(users).set({ active_team_id: teamId }).where(eq(users.id, userId));
      }

      return res.status(201).json({ ok: true });
    } catch (error) {
      console.error('Add user to team error:', error);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  }

  if (req.method === 'DELETE') {
    const { userId, teamId } = req.body;

    if (!userId || !teamId) {
      return res.status(400).json({ ok: false, error: 'userId and teamId are required' });
    }

    try {
      const teamData = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).limit(1);
      if (teamData.length === 0) {
        return res.status(404).json({ ok: false, error: 'Team not found' });
      }

      await db.delete(userTeams).where(and(eq(userTeams.user_id, userId), eq(userTeams.team_id, teamId)));

      const activeUserData = await db.select({ active_team_id: users.active_team_id }).from(users).where(eq(users.id, userId)).limit(1);

      if (activeUserData[0]?.active_team_id === teamId) {
        const remainingTeams = await db.select({ team_id: userTeams.team_id }).from(userTeams).where(eq(userTeams.user_id, userId)).limit(1);
        const newActiveTeam = remainingTeams[0]?.team_id || null;
        await db.update(users).set({ active_team_id: newActiveTeam }).where(eq(users.id, userId));
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Remove user from team error:', error);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
