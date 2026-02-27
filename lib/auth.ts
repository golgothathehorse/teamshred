// lib/auth.ts
import jwt from 'jsonwebtoken';
import { parse, serialize } from 'cookie';
import type { NextApiRequest } from 'next';
import type { GetServerSidePropsContext } from 'next';

export type SessionUser = {
  id: string;
  username: string;
  isAdmin: boolean;
};

const COOKIE_NAME = 'ts_session';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return secret;
}

export function signSession(user: SessionUser): string {
  const secret = getJwtSecret();
  return jwt.sign(user, secret, { expiresIn: '7d' });
}

export function parseSessionFromRequest(
  req: NextApiRequest | GetServerSidePropsContext['req']
): SessionUser | null {
  const header = req.headers.cookie;
  if (!header) return null;

  const cookies = parse(header);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  try {
    const secret = getJwtSecret();
    return jwt.verify(token, secret) as SessionUser;
  } catch {
    return null;
  }
}

export function createSessionCookie(token: string): string {
  return serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export function clearSessionCookie(): string {
  return serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
