// pages/api/login.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcryptjs';
import { db, users } from '../../lib/db';
import { eq, ilike } from 'drizzle-orm';
import { createSessionCookie, signSession } from '../../lib/auth';

type LoginResponse =
  | { ok: true; isAdmin: boolean }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LoginResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res
      .status(400)
      .json({ ok: false, error: 'Username and password are required' });
  }

  const inputUsername = String(username).trim();

  try {
    // Fetch user from database (case-insensitive)
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        password_hash: users.password_hash,
        is_admin: users.is_admin,
      })
      .from(users)
      .where(ilike(users.username, inputUsername))
      .limit(1);

    const user = result[0];

    if (!user) {
      return res
        .status(401)
        .json({ ok: false, error: 'Invalid username or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res
        .status(401)
        .json({ ok: false, error: 'Invalid username or password' });
    }

    const token = signSession({
      id: user.id,
      username: user.username,
      isAdmin: user.is_admin ?? false,
    });

    res.setHeader('Set-Cookie', createSessionCookie(token));

    return res.status(200).json({ ok: true, isAdmin: user.is_admin ?? false });
  } catch (error) {
    console.error('Login DB error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}
