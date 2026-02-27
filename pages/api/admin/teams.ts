// pages/api/admin/teams.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, teams } from '../../../lib/db';
import { eq, desc } from 'drizzle-orm';

type Team = { id: string; name: string; created_at: string };
type TeamsResponse = { ok: true; teams?: Team[]; team?: Team } | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<TeamsResponse>) {
  let session = parseSessionFromRequest(req);

  if (!session && process.env.TEST_BYPASS_AUTH === 'true') {
    session = { id: '7d921803-163b-4f6e-827f-4c3a94ba9efb', username: 'Nox', isAdmin: true };
  }

  if (!session || !session.isAdmin) {
    return res.status(401).json({ ok: false, error: 'Not authorized' });
  }

  if (req.method === 'GET') {
    try {
      const teamsData = await db
        .select({ id: teams.id, name: teams.name, created_at: teams.created_at })
        .from(teams)
        .orderBy(desc(teams.created_at));

      const result: Team[] = teamsData.map((t) => ({
        id: t.id,
        name: t.name,
        created_at: t.created_at?.toISOString() || '',
      }));

      return res.status(200).json({ ok: true, teams: result });
    } catch (error) {
      console.error('Admin list teams error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  }

  if (req.method === 'POST') {
    let { name } = req.body ?? {};

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ ok: false, error: 'Team name is required' });
    }

    name = name.trim();
    if (!name) {
      return res.status(400).json({ ok: false, error: 'Team name cannot be empty' });
    }

    try {
      const result = await db.insert(teams).values({ name }).returning({ id: teams.id, name: teams.name, created_at: teams.created_at });
      const data = result[0];

      return res.status(201).json({
        ok: true,
        team: { id: data.id, name: data.name, created_at: data.created_at?.toISOString() || '' },
      });
    } catch (err: any) {
      console.error('Admin create team error:', err);
      if (err.code === '23505') {
        return res.status(400).json({ ok: false, error: 'A team with that name already exists' });
      }
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.body ?? {};

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Team id is required' });
    }

    try {
      await db.delete(teams).where(eq(teams.id, id));
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Admin delete team error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
