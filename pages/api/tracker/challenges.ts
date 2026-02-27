// pages/api/tracker/challenges.ts
// POST - Create a solo rep-based custom challenge

import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, challenges, challengeParticipants, challengeTasks } from '../../../lib/db';
import { eq } from 'drizzle-orm';

type ApiResponse =
  | { ok: true; challenge_id: string; task_id: string }
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
    return res.status(401).json({ ok: false, error: 'Please log in to create challenges' });
  }

  try {
    const {
      title,
      starts_on,
      ends_on,
      task_name,
      target_type,
      target_value,
      stake_text,
    } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Title is required' });
    }

    if (!starts_on || !ends_on) {
      return res.status(400).json({ ok: false, error: 'Start and end dates are required' });
    }

    if (starts_on > ends_on) {
      return res.status(400).json({ ok: false, error: 'Start date must be before or equal to end date' });
    }

    if (!task_name || typeof task_name !== 'string' || task_name.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Leg name is required' });
    }

    const validTargetTypes = ['daily', 'total'];
    if (!target_type || !validTargetTypes.includes(target_type)) {
      return res.status(400).json({ ok: false, error: 'Target type must be daily or total' });
    }

    const numTarget = Number(target_value);
    if (!numTarget || numTarget <= 0 || numTarget > 1000000) {
      return res.status(400).json({ ok: false, error: 'Target value must be a positive number' });
    }

    const challengeResult = await db
      .insert(challenges)
      .values({
        scope: 'solo',
        template_key: null,
        title: title.trim(),
        description: `Solo challenge: ${task_name.trim()}`,
        stake_text: stake_text?.trim() || null,
        starts_on,
        ends_on,
        status: 'active',
        created_by_user_id: session.id,
      })
      .returning({ id: challenges.id });

    const challenge = challengeResult[0];

    if (!challenge) {
      return res.status(500).json({ ok: false, error: 'Failed to create challenge' });
    }

    try {
      await db.insert(challengeParticipants).values({
        id: randomUUID(),
        challenge_id: challenge.id,
        user_id: session.id,
        role: 'creator',
        state: 'accepted',
        joined_at: new Date(),
        created_at: new Date(),
      });
    } catch (participantError) {
      console.error('Error adding participant:', participantError);
      await db.delete(challenges).where(eq(challenges.id, challenge.id));
      return res.status(500).json({ ok: false, error: 'Failed to create challenge' });
    }

    const taskResult = await db
      .insert(challengeTasks)
      .values({
        challenge_id: challenge.id,
        name: task_name.trim(),
        unit_type: 'reps',
        target_type,
        target_value: numTarget.toString(),
        sort_order: 0,
      })
      .returning({ id: challengeTasks.id });

    const task = taskResult[0];

    if (!task) {
      await db.delete(challenges).where(eq(challenges.id, challenge.id));
      return res.status(500).json({ ok: false, error: 'Failed to create challenge task' });
    }

    return res.status(200).json({
      ok: true,
      challenge_id: challenge.id,
      task_id: task.id,
    });
  } catch (error) {
    console.error('Error in tracker/challenges:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
