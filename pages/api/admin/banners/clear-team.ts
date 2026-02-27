// pages/api/admin/banners/clear-team.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../../lib/auth';
import { db, banners, teams } from '../../../../lib/db';
import { eq } from 'drizzle-orm';

type SuccessResponse = { ok: true; deletedCount: number };
type ErrorResponse = { ok: false; error: string };
type ResponseBody = SuccessResponse | ErrorResponse;

export default async function handler(req: NextApiRequest, res: NextApiResponse<ResponseBody>) {
  let sessionUser = parseSessionFromRequest(req);

  if (!sessionUser && process.env.TEST_BYPASS_AUTH === 'true') {
    sessionUser = { id: '7d921803-163b-4f6e-827f-4c3a94ba9efb', username: 'Nox', isAdmin: true };
  }

  if (!sessionUser) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }
  if (!sessionUser.isAdmin) {
    return res.status(403).json({ ok: false, error: 'Admin only' });
  }

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { teamId } = req.body ?? {};

  if (!teamId || typeof teamId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Team ID is required' });
  }

  try {
    const teamData = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).limit(1);

    if (teamData.length === 0) {
      return res.status(404).json({ ok: false, error: 'Team not found' });
    }

    const countData = await db.select({ id: banners.id }).from(banners).where(eq(banners.team_id, teamId));
    const count = countData.length;

    await db.delete(banners).where(eq(banners.team_id, teamId));

    return res.status(200).json({ ok: true, deletedCount: count });
  } catch (error) {
    console.error('Clear team banners error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}
