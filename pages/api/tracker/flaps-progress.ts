// pages/api/tracker/flaps-progress.ts
// GET user's active Flaps challenges with progress

import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, challenges, challengeParticipants, flapsLog } from '../../../lib/db';
import { eq, and, inArray } from 'drizzle-orm';

type ApiResponse =
  | { ok: true; challenges: any[] }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'GET') {
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

  try {
    // Get user's active Flaps challenge participations
    const participations = await db
      .select({
        challenge_id: challengeParticipants.challenge_id,
      })
      .from(challengeParticipants)
      .where(
        and(
          eq(challengeParticipants.user_id, session.id),
          inArray(challengeParticipants.state, ['accepted', 'latecomer'])
        )
      );

    const challengeIds = participations.map(p => p.challenge_id);
    
    if (challengeIds.length === 0) {
      return res.status(200).json({ ok: true, challenges: [] });
    }

    // Get Flaps challenges that are active
    const flapsChallenges = await db
      .select()
      .from(challenges)
      .where(
        and(
          inArray(challenges.id, challengeIds),
          inArray(challenges.template_key, ['lone_flaps', 'flap_off', 'team_flaps']),
          inArray(challenges.status, ['pending', 'active'])
        )
      );

    if (flapsChallenges.length === 0) {
      return res.status(200).json({ ok: true, challenges: [] });
    }

    // Get user's Flaps entries for these challenges
    const flapsEntries = await db
      .select()
      .from(flapsLog)
      .where(
        and(
          eq(flapsLog.user_id, session.id),
          inArray(flapsLog.challenge_id, flapsChallenges.map(c => c.id))
        )
      );

    // Build progress data for each challenge
    const progressData = flapsChallenges.map(challenge => {
      const entries = flapsEntries.filter(e => e.challenge_id === challenge.id);
      
      const totalDuration = entries.reduce((sum, e) => sum + (Number(e.duration_minutes) || 0), 0);
      const totalCalories = entries.reduce((sum, e) => sum + (Number(e.calories_burned) || 0), 0);
      const bestHr = entries.reduce((max, e) => {
        const hr = Number(e.avg_heart_rate) || 0;
        return hr > max ? hr : max;
      }, 0);

      return {
        challenge_id: challenge.id,
        title: challenge.title,
        template_key: challenge.template_key,
        starts_on: challenge.starts_on,
        ends_on: challenge.ends_on,
        target_duration: challenge.target_duration_minutes ? Number(challenge.target_duration_minutes) : null,
        target_calories: challenge.target_calories ? Number(challenge.target_calories) : null,
        target_hr: challenge.target_avg_heart_rate ? Number(challenge.target_avg_heart_rate) : null,
        total_duration: totalDuration,
        total_calories: totalCalories,
        best_hr: bestHr || null,
        entries_count: entries.length,
      };
    });

    return res.status(200).json({ ok: true, challenges: progressData });
  } catch (error) {
    console.error('Error fetching flaps progress:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
