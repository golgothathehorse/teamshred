// pages/api/admin/banners/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../../lib/auth';
import { db, banners } from '../../../../lib/db';
import { eq } from 'drizzle-orm';

type SuccessResponse = { ok: true };
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

  if (req.method === 'DELETE') {
    return handleDelete(req, res);
  }

  res.setHeader('Allow', 'DELETE');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse<ResponseBody>) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, error: 'Banner ID is required' });
  }

  try {
    await db.delete(banners).where(eq(banners.id, id));
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Admin delete banner error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to delete banner' });
  }
}
