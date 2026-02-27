// pages/api/logout.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { clearSessionCookie } from '../../lib/auth';

type LogoutResponse = { ok: true };

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<LogoutResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Set-Cookie', clearSessionCookie());
  return res.status(200).json({ ok: true });
}
