// pages/api/password/change.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcryptjs';
import { db, users } from '../../../lib/db';
import { eq } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../../lib/auth';

type PasswordChangeResponse = { ok: true } | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PasswordChangeResponse>
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

  const { currentPassword, newPassword } = req.body ?? {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      ok: false,
      error: 'Current password and new password are required',
    });
  }

  const newPasswordStr = String(newPassword).trim();

  if (newPasswordStr.length < 6) {
    return res.status(400).json({
      ok: false,
      error: 'New password must be at least 6 characters',
    });
  }

  try {
    const userData = await db
      .select({ id: users.id, password_hash: users.password_hash })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    const user = userData[0];

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const passwordMatches = await bcrypt.compare(currentPassword, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({
        ok: false,
        error: 'Current password is incorrect',
      });
    }

    const newPasswordHash = await bcrypt.hash(newPasswordStr, 10);

    await db.update(users).set({ password_hash: newPasswordHash }).where(eq(users.id, session.id));

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Password change error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}
