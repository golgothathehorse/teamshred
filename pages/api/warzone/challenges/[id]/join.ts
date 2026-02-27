// pages/api/warzone/challenges/[id]/join.ts
// POST - Join a team challenge (opt-in)

import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../../../lib/auth';
import { db, challenges, challengeParticipants, challengeTasks, challengeEntries, activityLog, exerciseTypes } from '../../../../../lib/db';
import { eq, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getSydneyDateString } from '../../../../../lib/dateUtils';

type ApiResponse =
  | { ok: true; participant: any; is_latecomer: boolean; rejoined?: boolean }
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
    return res.status(401).json({ ok: false, error: 'Please log in to join challenges' });
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
        starts_on: challenges.starts_on,
        ends_on: challenges.ends_on,
      })
      .from(challenges)
      .where(eq(challenges.id, challengeId))
      .limit(1);

    const challenge = challengeData[0];

    if (!challenge) {
      return res.status(404).json({ ok: false, error: 'Challenge not found' });
    }

    if (challenge.scope !== 'team') {
      return res.status(400).json({ ok: false, error: 'Only team challenges allow open join' });
    }

    if (!['pending', 'active'].includes(challenge.status)) {
      return res.status(400).json({ ok: false, error: 'Challenge is not accepting participants' });
    }

    const existingData = await db
      .select({
        id: challengeParticipants.id,
        state: challengeParticipants.state,
        role: challengeParticipants.role,
      })
      .from(challengeParticipants)
      .where(and(eq(challengeParticipants.challenge_id, challengeId), eq(challengeParticipants.user_id, session.id)))
      .limit(1);

    const existingParticipant = existingData[0];

    if (existingParticipant) {
      if (existingParticipant.state === 'declined' || existingParticipant.state === 'left') {
        const today = getSydneyDateString();
        const isLatecomer = today >= challenge.starts_on;
        const newState = isLatecomer ? 'latecomer' : 'accepted';

        await db
          .update(challengeParticipants)
          .set({ state: newState, joined_at: new Date() })
          .where(eq(challengeParticipants.id, existingParticipant.id));

        // Credit today's activities retroactively when rejoining
        await creditTodaysActivities(challengeId, session.id, today);

        return res.status(200).json({
          ok: true,
          participant: { ...existingParticipant, state: newState },
          is_latecomer: isLatecomer,
          rejoined: true,
        });
      }

      return res.status(200).json({
        ok: true,
        participant: existingParticipant,
        is_latecomer: existingParticipant.state === 'latecomer',
      });
    }

    const today = getSydneyDateString();
    const isLatecomer = today >= challenge.starts_on;
    const state = isLatecomer ? 'latecomer' : 'accepted';

    const participantResult = await db
      .insert(challengeParticipants)
      .values({
        challenge_id: challengeId,
        user_id: session.id,
        role: 'participant',
        state,
        joined_at: new Date(),
      })
      .returning();

    const participant = participantResult[0];

    // Credit today's activities retroactively to the new challenge
    await creditTodaysActivities(challengeId, session.id, today);

    return res.status(200).json({
      ok: true,
      participant,
      is_latecomer: isLatecomer,
    });
  } catch (error) {
    console.error('Error in join challenge:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

// Credit today's activities to a newly joined challenge
async function creditTodaysActivities(challengeId: string, userId: string, today: string): Promise<void> {
  try {
    // 1. Get the challenge tasks for this challenge
    const tasks = await db
      .select({
        id: challengeTasks.id,
        name: challengeTasks.name,
        unit_type: challengeTasks.unit_type,
      })
      .from(challengeTasks)
      .where(eq(challengeTasks.challenge_id, challengeId));

    if (tasks.length === 0) return;

    // 2. Get exercise types to map names to IDs (exact matching)
    const allExerciseTypes = await db
      .select({
        id: exerciseTypes.id,
        name: exerciseTypes.name,
      })
      .from(exerciseTypes)
      .where(eq(exerciseTypes.is_active, true));

    // Create exercise_type_id to task mapping by matching names exactly
    // For each task name, find the matching exercise_type_id
    const exerciseTypeIdToTask: Record<string, typeof tasks[0]> = {};
    for (const task of tasks) {
      const matchingExerciseType = allExerciseTypes.find(
        et => et.name.toLowerCase() === task.name.toLowerCase()
      );
      if (matchingExerciseType) {
        exerciseTypeIdToTask[matchingExerciseType.id] = task;
      }
    }

    // 3. Get today's standalone activities for this user
    const standaloneToday = await db
      .select({
        id: activityLog.id,
        value: activityLog.value,
        exercise_type_id: activityLog.exercise_type_id,
        created_at: activityLog.created_at,
      })
      .from(activityLog)
      .where(and(
        eq(activityLog.user_id, userId),
        eq(activityLog.entry_date, today)
      ));

    // 4. Check existing entries for this challenge to avoid duplicates
    const existingEntries = await db
      .select({
        id: challengeEntries.id,
        value: challengeEntries.value,
        task_id: challengeEntries.task_id,
        inserted_at: challengeEntries.inserted_at,
        log_request_id: challengeEntries.log_request_id,
      })
      .from(challengeEntries)
      .where(and(
        eq(challengeEntries.challenge_id, challengeId),
        eq(challengeEntries.user_id, userId),
        eq(challengeEntries.entry_date, today)
      ));

    // Create a set of existing entry signatures to avoid duplicates
    const existingSignatures = new Set<string>();
    for (const entry of existingEntries) {
      const ts = entry.inserted_at?.getTime() ?? 0;
      const roundedTs = Math.floor(ts / 1000);
      const sig = `${entry.task_id}|${entry.value}|${roundedTs}`;
      existingSignatures.add(sig);
    }

    // 5. Create new challenge entries for matching standalone activities
    const newEntries: {
      id: string;
      challenge_id: string;
      user_id: string;
      task_id: string;
      value: string;
      entry_date: string;
      inserted_at: Date;
      log_request_id: string;
    }[] = [];

    // Create a log request ID for this batch (for traceability)
    const logRequestId = randomUUID();

    for (const activity of standaloneToday) {
      // Match by exercise_type_id directly to the mapped task
      const matchingTask = exerciseTypeIdToTask[activity.exercise_type_id];
      if (!matchingTask) continue;

      // Check if this entry already exists (avoid duplicates)
      const activityTs = activity.created_at?.getTime() ?? 0;
      const roundedTs = Math.floor(activityTs / 1000);
      const sig = `${matchingTask.id}|${activity.value}|${roundedTs}`;
      
      if (existingSignatures.has(sig)) continue;

      // Create new challenge entry
      newEntries.push({
        id: randomUUID(),
        challenge_id: challengeId,
        user_id: userId,
        task_id: matchingTask.id,
        value: String(activity.value),
        entry_date: today,
        inserted_at: activity.created_at || new Date(),
        log_request_id: logRequestId,
      });

      // Add to existing signatures to avoid duplicating within this batch
      existingSignatures.add(sig);
    }

    // 6. Insert new entries if any
    if (newEntries.length > 0) {
      await db.insert(challengeEntries).values(newEntries);
      console.log(`Credited ${newEntries.length} activities to challenge ${challengeId} for user ${userId} (request: ${logRequestId})`);
    }
  } catch (error) {
    console.error('Error crediting today\'s activities:', error);
    // Don't throw - this is a best-effort operation
  }
}
