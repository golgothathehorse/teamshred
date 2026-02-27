// pages/api/tracker/today.ts
// GET - Return user's active rep-based challenge tasks with progress

import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, challengeParticipants, challenges, challengeTasks, challengeEntries } from '../../../lib/db';
import { eq, and, inArray, lte, gte, asc } from 'drizzle-orm';
import { getSydneyDateString } from '../../../lib/dateUtils';
import { getUnitLabel } from '../../../lib/exercises';

interface TaskWithProgress {
  challenge_id: string;
  challenge_title: string;
  challenge_scope: string;
  starts_on: string;
  ends_on: string;
  task_id: string;
  task_name: string;
  unit_type: string;
  unit_label: string;
  target_type: string;
  target_value: number | null;
  today_progress: number;
  overall_progress: number;
}

type ApiResponse =
  | { ok: true; tasks: TaskWithProgress[]; today: string }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
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
    return res.status(401).json({ ok: false, error: 'Please log in to use Tracker' });
  }

  try {
    const today = getSydneyDateString();

    const participations = await db
      .select({ challenge_id: challengeParticipants.challenge_id })
      .from(challengeParticipants)
      .where(
        and(
          eq(challengeParticipants.user_id, session.id),
          inArray(challengeParticipants.state, ['accepted', 'latecomer'])
        )
      );

    const challengeIds = participations.map((p) => p.challenge_id);

    if (challengeIds.length === 0) {
      return res.status(200).json({ ok: true, tasks: [], today });
    }

    const activeChallenges = await db
      .select({
        id: challenges.id,
        title: challenges.title,
        starts_on: challenges.starts_on,
        ends_on: challenges.ends_on,
        status: challenges.status,
        scope: challenges.scope,
      })
      .from(challenges)
      .where(
        and(
          inArray(challenges.id, challengeIds),
          inArray(challenges.status, ['active', 'pending']),
          lte(challenges.starts_on, today),
          gte(challenges.ends_on, today)
        )
      );

    if (activeChallenges.length === 0) {
      return res.status(200).json({ ok: true, tasks: [], today });
    }

    const activeChallengeIds = activeChallenges.map((c) => c.id);

    const tasks = await db
      .select({
        id: challengeTasks.id,
        challenge_id: challengeTasks.challenge_id,
        name: challengeTasks.name,
        unit_type: challengeTasks.unit_type,
        target_type: challengeTasks.target_type,
        target_value: challengeTasks.target_value,
      })
      .from(challengeTasks)
      .where(inArray(challengeTasks.challenge_id, activeChallengeIds))
      .orderBy(asc(challengeTasks.sort_order));

    if (tasks.length === 0) {
      return res.status(200).json({ ok: true, tasks: [], today });
    }

    const taskIds = tasks.map((t) => t.id);

    const entries = await db
      .select({
        task_id: challengeEntries.task_id,
        entry_date: challengeEntries.entry_date,
        value: challengeEntries.value,
      })
      .from(challengeEntries)
      .where(
        and(
          inArray(challengeEntries.task_id, taskIds),
          eq(challengeEntries.user_id, session.id)
        )
      );

    const progressMap: Record<string, { today: number; overall: number }> = {};
    for (const task of tasks) {
      progressMap[task.id] = { today: 0, overall: 0 };
    }

    for (const entry of entries) {
      if (progressMap[entry.task_id]) {
        const val = Number(entry.value) || 0;
        progressMap[entry.task_id].overall += val;
        const entryDateStr = String(entry.entry_date).split('T')[0];
        if (entryDateStr === today) {
          progressMap[entry.task_id].today += val;
        }
      }
    }

    const challengeMap: Record<string, (typeof activeChallenges)[0]> = {};
    for (const c of activeChallenges) {
      challengeMap[c.id] = c;
    }

    const result: TaskWithProgress[] = tasks.map((task) => {
      const challenge = challengeMap[task.challenge_id];
      return {
        challenge_id: task.challenge_id,
        challenge_title: challenge?.title || 'Unknown Challenge',
        challenge_scope: challenge?.scope || 'solo',
        starts_on: challenge?.starts_on || '',
        ends_on: challenge?.ends_on || '',
        task_id: task.id,
        task_name: task.name,
        unit_type: task.unit_type || 'reps',
        unit_label: getUnitLabel(task.unit_type || 'reps'),
        target_type: task.target_type || 'none',
        target_value: task.target_value ? Number(task.target_value) : null,
        today_progress: progressMap[task.id]?.today || 0,
        overall_progress: progressMap[task.id]?.overall || 0,
      };
    });

    return res.status(200).json({ ok: true, tasks: result, today });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in tracker/today:', errorMessage, error);
    return res.status(500).json({ ok: false, error: `Server error: ${errorMessage}` });
  }
}
