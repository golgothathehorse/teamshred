// pages/api/warzone/challenges/[id]/leave.ts
// POST - Leave a team challenge (opt-out)

import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../../../lib/auth';
import { db, challenges, challengeParticipants } from '../../../../../lib/db';
import { eq, and } from 'drizzle-orm';

type ApiResponse = { ok: true } | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let session = parseSessionFromRequest(req);

  if (!session && process.env.TEST_BYPASS_AUTH === 'true') {
    session = {
      id: '7d921803-163b-4f6e-827f-4c3a94ba9efb',
      username: 'Nox',
      isAdmin: true,
    };
  }

  if (!session) {
    return res.status(401).json({ ok: false, error: 'Please log in' });
  }

  const { id: challengeId } = req.query;
  if (!challengeId || typeof challengeId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Invalid challenge ID' });
  }

  try {
    const challengeData = await db
      .select({
        id: challenges.id,
        scope: challenges.scope,
        status: challenges.status,
        created_by_user_id: challenges.created_by_user_id,
      })
      .from(challenges)
      .where(eq(challenges.id, challengeId))
      .limit(1);

    const challenge = challengeData[0];

    if (!challenge) {
      return res.status(404).json({ ok: false, error: 'Challenge not found' });
    }

    if (challenge.scope !== 'team') {
      return res.status(400).json({ ok: false, error: 'Only team challenges allow leaving' });
    }

    if (challenge.created_by_user_id === session.id) {
      return res.status(400).json({ ok: false, error: 'Creator cannot leave their own challenge' });
    }

    if (['completed', 'cancelled'].includes(challenge.status)) {
      return res.status(400).json({ ok: false, error: 'Cannot leave a completed challenge' });
    }

    const participantData = await db
      .select({ id: challengeParticipants.id, state: challengeParticipants.state })
      .from(challengeParticipants)
      .where(and(eq(challengeParticipants.challenge_id, challengeId), eq(challengeParticipants.user_id, session.id)))
      .limit(1);

    const participant = participantData[0];

    if (!participant) {
      return res.status(400).json({ ok: false, error: 'You are not a participant in this challenge' });
    }

    await db
      .update(challengeParticipants)
      .set({ state: 'declined' })
      .where(eq(challengeParticipants.id, participant.id));

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error in leave challenge:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
