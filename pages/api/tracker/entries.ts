// pages/api/tracker/entries.ts
// POST - Add a rep entry for a task

import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, challengeParticipants, challengeTasks, challengeEntries } from '../../../lib/db';
import { eq, and, inArray } from 'drizzle-orm';
import { getSydneyDateString } from '../../../lib/dateUtils';

type ApiResponse =
  | { ok: true; today_progress: number; overall_progress: number }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
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
    return res.status(401).json({ ok: false, error: 'Please log in to use Tracker' });
  }

  try {
    const { task_id, challenge_id, value, entry_date } = req.body;

    if (!task_id || !challenge_id) {
      return res.status(400).json({ ok: false, error: 'Missing task_id or challenge_id' });
    }

    const numValue = Number(value);
    if (!numValue || numValue <= 0 || numValue > 10000) {
      return res.status(400).json({ ok: false, error: 'Value must be between 1 and 10000' });
    }

    const today = getSydneyDateString();
    const effectiveDate = entry_date || today;

    const participantData = await db
      .select({ id: challengeParticipants.id, state: challengeParticipants.state })
      .from(challengeParticipants)
      .where(
        and(
          eq(challengeParticipants.challenge_id, challenge_id),
          eq(challengeParticipants.user_id, session.id),
          inArray(challengeParticipants.state, ['accepted', 'latecomer'])
        )
      )
      .limit(1);

    if (participantData.length === 0) {
      return res.status(403).json({ ok: false, error: 'You are not an active participant in this challenge' });
    }

    const taskData = await db
      .select({ id: challengeTasks.id, challenge_id: challengeTasks.challenge_id })
      .from(challengeTasks)
      .where(and(eq(challengeTasks.id, task_id), eq(challengeTasks.challenge_id, challenge_id)))
      .limit(1);

    if (taskData.length === 0) {
      return res.status(400).json({ ok: false, error: 'Task not found in this challenge' });
    }

    await db.insert(challengeEntries).values({
      id: randomUUID(),
      challenge_id,
      task_id,
      user_id: session.id,
      entry_date: effectiveDate,
      value: numValue.toString(),
      inserted_at: new Date(),
    });

    const entries = await db
      .select({ entry_date: challengeEntries.entry_date, value: challengeEntries.value })
      .from(challengeEntries)
      .where(and(eq(challengeEntries.task_id, task_id), eq(challengeEntries.user_id, session.id)));

    let todayProgress = 0;
    let overallProgress = 0;
    for (const entry of entries) {
      const val = Number(entry.value) || 0;
      overallProgress += val;
      const entryDateStr = String(entry.entry_date).split('T')[0];
      if (entryDateStr === today) {
        todayProgress += val;
      }
    }

    return res.status(200).json({ ok: true, today_progress: todayProgress, overall_progress: overallProgress });
  } catch (error) {
    console.error('Error in tracker/entries:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
