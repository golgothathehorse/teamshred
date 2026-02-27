// pages/api/warzone/challenges/[id]/respond.ts
// POST - Respond to a challenge invitation (accept/decline/surrender)

import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../../../lib/auth';
import { db, challenges, challengeParticipants } from '../../../../../lib/db';
import { eq, and, ne } from 'drizzle-orm';

type ApiResponse =
  | { ok: true; message: string; redirect?: string }
  | { ok: false; error: string };

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
    return res.status(401).json({ ok: false, error: 'Please log in to use Warzone' });
  }

  const { id: challengeId } = req.query;
  const { action } = req.body;

  if (!challengeId || typeof challengeId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Challenge ID is required' });
  }

  const validActions = ['accept', 'decline', 'surrender'];
  if (!action || !validActions.includes(action)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid action. Must be: accept, decline, or surrender',
    });
  }

  try {
    const challengeData = await db
      .select({ id: challenges.id, status: challenges.status, scope: challenges.scope })
      .from(challenges)
      .where(eq(challenges.id, challengeId))
      .limit(1);

    const challenge = challengeData[0];

    if (!challenge) {
      return res.status(404).json({ ok: false, error: 'Challenge not found' });
    }

    const participantData = await db
      .select({
        id: challengeParticipants.id,
        user_id: challengeParticipants.user_id,
        role: challengeParticipants.role,
        state: challengeParticipants.state,
      })
      .from(challengeParticipants)
      .where(and(eq(challengeParticipants.challenge_id, challengeId), eq(challengeParticipants.user_id, session.id)))
      .limit(1);

    const participant = participantData[0];

    if (!participant) {
      return res.status(403).json({ ok: false, error: 'You are not a participant in this challenge' });
    }

    let newState: string;
    let newChallengeStatus: string | null = null;

    switch (action) {
      case 'accept':
        if (participant.state !== 'invited') {
          return res.status(400).json({ ok: false, error: 'Can only accept invited challenges' });
        }
        if (challenge.status !== 'pending') {
          return res.status(400).json({ ok: false, error: 'Challenge is not pending' });
        }
        newState = 'accepted';
        newChallengeStatus = 'active';
        break;

      case 'decline':
        if (participant.state !== 'invited') {
          return res.status(400).json({ ok: false, error: 'Can only decline invited challenges' });
        }
        newState = 'declined';
        newChallengeStatus = 'cancelled';
        break;

      case 'surrender':
        if (!['accepted', 'invited'].includes(participant.state)) {
          return res.status(400).json({ ok: false, error: 'Cannot surrender from current state' });
        }
        newState = 'surrendered';
        if (challenge.scope === 'solo') {
          newChallengeStatus = 'cancelled';
        } else if (challenge.status === 'active') {
          newChallengeStatus = 'completed';
        } else {
          newChallengeStatus = 'cancelled';
        }
        break;

      default:
        return res.status(400).json({ ok: false, error: 'Invalid action' });
    }

    await db
      .update(challengeParticipants)
      .set({ state: newState })
      .where(eq(challengeParticipants.id, participant.id));

    if (newChallengeStatus) {
      const updateData: any = { status: newChallengeStatus };

      if (action === 'surrender' && challenge.status === 'active') {
        const otherParticipantData = await db
          .select({ user_id: challengeParticipants.user_id })
          .from(challengeParticipants)
          .where(and(eq(challengeParticipants.challenge_id, challengeId), ne(challengeParticipants.user_id, session.id)))
          .limit(1);

        const otherParticipant = otherParticipantData[0];

        if (otherParticipant) {
          updateData.winner_user_id = otherParticipant.user_id;
          updateData.completed_at = new Date();
          updateData.result_json = {
            type: 'surrender',
            surrendered_by: session.id,
            winner_by_default: otherParticipant.user_id,
          };
        }
      }

      await db.update(challenges).set(updateData).where(eq(challenges.id, challengeId));
    }

    let message: string;
    if (action === 'accept') {
      message = 'Challenge accepted! The battle begins.';
    } else if (action === 'decline') {
      message = 'Challenge declined.';
    } else if (action === 'surrender' && challenge.scope === 'solo') {
      message = 'Lone Wolf Mission cancelled';
    } else {
      message = 'You have surrendered.';
    }

    return res.status(200).json({
      ok: true,
      message,
      redirect: action === 'surrender' && challenge.scope === 'solo' ? '/warzone' : undefined,
    });
  } catch (error) {
    console.error('Error in respond:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
