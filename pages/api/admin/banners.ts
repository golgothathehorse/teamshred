// pages/api/admin/banners.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, banners } from '../../../lib/db';
import { eq, desc } from 'drizzle-orm';

type BannerRow = { id: string; team_id: string | null; message: string; type: string; created_at: string; created_by: string | null };
type SuccessListResponse = { ok: true; banners: BannerRow[] };
type SuccessCreateResponse = { ok: true; banner: BannerRow };
type ErrorResponse = { ok: false; error: string };
type ResponseBody = SuccessListResponse | SuccessCreateResponse | ErrorResponse;

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

  if (req.method === 'GET') {
    return handleList(req, res);
  }

  if (req.method === 'POST') {
    return handleCreate(req, res, sessionUser.id);
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

async function handleList(req: NextApiRequest, res: NextApiResponse<ResponseBody>) {
  const { teamId, limit } = req.query;

  let limitNumber = 20;
  if (typeof limit === 'string') {
    const parsed = parseInt(limit, 10);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 100) {
      limitNumber = parsed;
    }
  }

  try {
    let query = db
      .select({
        id: banners.id,
        team_id: banners.team_id,
        message: banners.message,
        type: banners.type,
        created_at: banners.created_at,
        created_by: banners.created_by,
      })
      .from(banners)
      .orderBy(desc(banners.created_at))
      .limit(limitNumber);

    if (typeof teamId === 'string' && teamId.trim() !== '') {
      query = query.where(eq(banners.team_id, teamId.trim())) as typeof query;
    }

    const data = await query;

    const result: BannerRow[] = data.map((b) => ({
      id: b.id,
      team_id: b.team_id,
      message: b.message,
      type: b.type,
      created_at: b.created_at?.toISOString() || '',
      created_by: b.created_by,
    }));

    return res.status(200).json({ ok: true, banners: result });
  } catch (error) {
    console.error('Admin banners list error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to load banners' });
  }
}

async function handleCreate(req: NextApiRequest, res: NextApiResponse<ResponseBody>, adminUserId: string) {
  const { teamId, message } = req.body ?? {};

  if (!teamId || typeof teamId !== 'string') {
    return res.status(400).json({ ok: false, error: 'teamId is required' });
  }

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ ok: false, error: 'message is required' });
  }

  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0) {
    return res.status(400).json({ ok: false, error: 'message cannot be empty' });
  }

  if (trimmedMessage.length > 500) {
    return res.status(400).json({ ok: false, error: 'message is too long (max 500 characters)' });
  }

  try {
    const result = await db
      .insert(banners)
      .values({
        team_id: teamId,
        message: trimmedMessage,
        type: 'manual',
        created_by: adminUserId,
      })
      .returning({
        id: banners.id,
        team_id: banners.team_id,
        message: banners.message,
        type: banners.type,
        created_at: banners.created_at,
        created_by: banners.created_by,
      });

    const data = result[0];

    return res.status(200).json({
      ok: true,
      banner: {
        id: data.id,
        team_id: data.team_id,
        message: data.message,
        type: data.type,
        created_at: data.created_at?.toISOString() || '',
        created_by: data.created_by,
      },
    });
  } catch (error) {
    console.error('Admin create banner error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to create banner' });
  }
}
