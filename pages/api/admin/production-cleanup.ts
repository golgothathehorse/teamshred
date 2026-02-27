import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, flapsLog, challenges, challengeParticipants, exerciseTypes } from '../../../lib/db';
import { eq, and, inArray, sql } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
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

  if (!session || session.username.toLowerCase() !== 'nox') {
    return res.status(403).json({ ok: false, error: 'Admin access required. Log in as nox first.' });
  }

  const results: string[] = [];

  try {
    const flapsIdsToDelete = [
      '95118000-d095-4fd0-ae90-cbf3079a0e71',
      '32150d72-b87b-4270-b9a5-c1bf6752f846',
    ];

    const existingFlaps = await db
      .select({ id: flapsLog.id })
      .from(flapsLog)
      .where(inArray(flapsLog.id, flapsIdsToDelete));

    if (existingFlaps.length > 0) {
      await db.delete(flapsLog).where(inArray(flapsLog.id, flapsIdsToDelete));
      results.push(`Deleted ${existingFlaps.length} duplicate/mistake flaps entries`);
    } else {
      results.push('Duplicate flaps entries already cleaned up');
    }

    const failedChallengeId = '3cfb73f3-cd02-4bd0-afe0-e27e085c7250';
    const existingChallenge = await db
      .select({ id: challenges.id })
      .from(challenges)
      .where(eq(challenges.id, failedChallengeId));

    if (existingChallenge.length > 0) {
      await db.delete(flapsLog).where(eq(flapsLog.challenge_id, failedChallengeId));
      await db.delete(challengeParticipants).where(eq(challengeParticipants.challenge_id, failedChallengeId));
      await db.delete(challenges).where(eq(challenges.id, failedChallengeId));
      results.push('Deleted failed challenge "2 Hours To Hell" and related data');
    } else {
      results.push('Failed challenge already cleaned up');
    }

    const sallyUpId = '07adae52-c610-4789-9ca1-d6768803fef7';
    const existingSallyUp = await db
      .select({ id: exerciseTypes.id })
      .from(exerciseTypes)
      .where(eq(exerciseTypes.id, sallyUpId));

    if (existingSallyUp.length === 0) {
      await db.insert(exerciseTypes).values({
        id: sallyUpId,
        name: 'Sally Up',
        unit_type: 'score',
        unit_label: 'score',
      });
      results.push('Inserted Sally Up exercise type');
    } else {
      results.push('Sally Up exercise type already exists');
    }

    return res.status(200).json({ ok: true, results });
  } catch (error) {
    console.error('Production cleanup error:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error', results });
  }
}
