// pages/api/admin/users.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcryptjs';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, users, userTeams, teams, profiles, weights, bodyFatLogs, waistLogs, journalEntries, challengeParticipants, challengeEntries } from '../../../lib/db';
import { eq, ilike, inArray, desc } from 'drizzle-orm';

type UserTeam = { team_id: string; team_name: string };
type SimpleUser = { id: string; username: string; is_admin: boolean; created_at: string; team_id: string | null; teams?: UserTeam[] };
type UsersResponse = { ok: true; users?: SimpleUser[] } | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<UsersResponse>) {
  let session = parseSessionFromRequest(req);

  if (!session && process.env.TEST_BYPASS_AUTH === 'true') {
    session = { id: '7d921803-163b-4f6e-827f-4c3a94ba9efb', username: 'Nox', isAdmin: true };
  }

  if (!session || !session.isAdmin) {
    return res.status(401).json({ ok: false, error: 'Not authorized' });
  }

  if (req.method === 'GET') {
    try {
      const usersData = await db
        .select({ id: users.id, username: users.username, is_admin: users.is_admin, created_at: users.created_at, team_id: users.team_id })
        .from(users)
        .orderBy(desc(users.created_at));

      const result: SimpleUser[] = usersData.map((u) => ({
        id: u.id,
        username: u.username,
        is_admin: u.is_admin || false,
        created_at: u.created_at?.toISOString() || '',
        team_id: u.team_id,
        teams: [],
      }));

      if (result.length > 0) {
        const userIds = result.map((u) => u.id);
        const userTeamsData = await db
          .select({ user_id: userTeams.user_id, team_id: userTeams.team_id })
          .from(userTeams)
          .where(inArray(userTeams.user_id, userIds));

        const teamIds = Array.from(new Set(userTeamsData.map((ut) => ut.team_id)));
        const teamsData = teamIds.length > 0 ? await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, teamIds)) : [];
        const teamMap = new Map(teamsData.map((t) => [t.id, t.name]));

        const teamsByUser = new Map<string, UserTeam[]>();
        userTeamsData.forEach((ut) => {
          if (!teamsByUser.has(ut.user_id)) teamsByUser.set(ut.user_id, []);
          teamsByUser.get(ut.user_id)!.push({ team_id: ut.team_id, team_name: teamMap.get(ut.team_id) || 'Unknown' });
        });

        result.forEach((user) => {
          user.teams = teamsByUser.get(user.id) || [];
        });
      }

      return res.status(200).json({ ok: true, users: result });
    } catch (error) {
      console.error('Admin list users error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  }

  if (req.method === 'POST') {
    let { username, password, isAdmin } = req.body ?? {};

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Username and password are required' });
    }

    username = String(username).trim();

    try {
      const existingUser = await db.select({ id: users.id }).from(users).where(ilike(users.username, username)).limit(1);

      if (existingUser.length > 0) {
        return res.status(400).json({ ok: false, error: 'Username already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const result = await db
        .insert(users)
        .values({ username, password_hash: passwordHash, is_admin: !!isAdmin })
        .returning({ id: users.id, username: users.username, is_admin: users.is_admin, created_at: users.created_at, team_id: users.team_id });

      const data = result[0];
      const newUser: SimpleUser = { id: data.id, username: data.username, is_admin: data.is_admin || false, created_at: data.created_at?.toISOString() || '', team_id: data.team_id, teams: [] };

      return res.status(201).json({ ok: true, users: [newUser] });
    } catch (err: any) {
      console.error('Admin create user error:', err);
      if (err.code === '23505') {
        return res.status(400).json({ ok: false, error: 'Username already exists' });
      }
      return res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  }

  if (req.method === 'PATCH') {
    const { id, password, isAdmin, teamId } = req.body ?? {};

    if (!id) {
      return res.status(400).json({ ok: false, error: 'User id is required' });
    }

    const updates: Record<string, unknown> = {};

    if (typeof isAdmin === 'boolean') {
      updates.is_admin = isAdmin;
    }

    if (password) {
      updates.password_hash = await bcrypt.hash(password, 10);
    }

    if (teamId === null) {
      updates.team_id = null;
    } else if (typeof teamId === 'string') {
      updates.team_id = teamId;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'Nothing to update' });
    }

    try {
      const result = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, id))
        .returning({ id: users.id, username: users.username, is_admin: users.is_admin, created_at: users.created_at, team_id: users.team_id });

      const data = result[0];

      const userTeamsData = await db.select({ team_id: userTeams.team_id }).from(userTeams).where(eq(userTeams.user_id, id));
      const teamIds = userTeamsData.map((ut) => ut.team_id);
      const teamsData = teamIds.length > 0 ? await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, teamIds)) : [];
      const teamMap = new Map(teamsData.map((t) => [t.id, t.name]));

      const userTeamsList: UserTeam[] = userTeamsData.map((ut) => ({ team_id: ut.team_id, team_name: teamMap.get(ut.team_id) || 'Unknown' }));

      const updatedUser: SimpleUser = { id: data.id, username: data.username, is_admin: data.is_admin || false, created_at: data.created_at?.toISOString() || '', team_id: data.team_id, teams: userTeamsList };

      return res.status(200).json({ ok: true, users: [updatedUser] });
    } catch (error) {
      console.error('Admin update user error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.body ?? {};

    if (!id) {
      return res.status(400).json({ ok: false, error: 'User id is required' });
    }

    if (id === session.id) {
      return res.status(400).json({ ok: false, error: 'You cannot delete your own account' });
    }

    try {
      // Delete related records first (cascade manually)
      await db.delete(challengeEntries).where(eq(challengeEntries.user_id, id));
      await db.delete(challengeParticipants).where(eq(challengeParticipants.user_id, id));
      await db.delete(journalEntries).where(eq(journalEntries.user_id, id));
      await db.delete(waistLogs).where(eq(waistLogs.user_id, id));
      await db.delete(bodyFatLogs).where(eq(bodyFatLogs.user_id, id));
      await db.delete(weights).where(eq(weights.user_id, id));
      await db.delete(profiles).where(eq(profiles.user_id, id));
      await db.delete(userTeams).where(eq(userTeams.user_id, id));
      // Finally delete the user
      await db.delete(users).where(eq(users.id, id));
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Admin delete user error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
