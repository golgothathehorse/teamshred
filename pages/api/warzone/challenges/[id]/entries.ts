import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../../../lib/auth';
import { db, challengeEntries, challengeTasks, challenges, users, flapsLog, challengeParticipants } from '../../../../../lib/db';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const isAdmin = session.username.toLowerCase() === 'nox';
  if (!isAdmin) {
    return res.status(403).json({ ok: false, error: 'Only admin can manage challenge entries' });
  }

  const { id: challengeId } = req.query;
  if (!challengeId || typeof challengeId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Challenge ID is required' });
  }

  if (req.method === 'GET') {
    return handleGet(challengeId, res);
  } else if (req.method === 'POST') {
    return handlePost(challengeId, req, res);
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

async function handleGet(challengeId: string, res: NextApiResponse) {
  try {
    const challengeData = await db
      .select({ template_key: challenges.template_key })
      .from(challenges)
      .where(eq(challenges.id, challengeId))
      .limit(1);

    if (!challengeData[0]) {
      return res.status(404).json({ ok: false, error: 'Challenge not found' });
    }

    const isFlapsChallenge = ['lone_flaps', 'flap_off', 'team_flaps'].includes(challengeData[0].template_key || '');

    if (isFlapsChallenge) {
      const entries = await db
        .select({
          id: flapsLog.id,
          user_id: flapsLog.user_id,
          entry_date: flapsLog.entry_date,
          duration_minutes: flapsLog.duration_minutes,
          avg_heart_rate: flapsLog.avg_heart_rate,
          calories_burned: flapsLog.calories_burned,
          exercise_mode: flapsLog.exercise_mode,
          distance_km: flapsLog.distance_km,
          notes: flapsLog.notes,
          created_at: flapsLog.created_at,
          username: users.username,
        })
        .from(flapsLog)
        .innerJoin(users, eq(flapsLog.user_id, users.id))
        .where(eq(flapsLog.challenge_id, challengeId))
        .orderBy(flapsLog.entry_date);

      const formattedEntries = entries.map(e => ({
        id: e.id,
        user_id: e.user_id,
        username: e.username,
        entry_date: e.entry_date,
        entry_type: 'flaps',
        value: String(e.duration_minutes || 0),
        display: `${e.exercise_mode} - ${e.duration_minutes}min${e.avg_heart_rate ? ` ${e.avg_heart_rate}bpm` : ''}${e.calories_burned ? ` ${e.calories_burned}cal` : ''}`,
        duration_minutes: Number(e.duration_minutes) || 0,
        avg_heart_rate: e.avg_heart_rate ? Number(e.avg_heart_rate) : null,
        calories_burned: e.calories_burned ? Number(e.calories_burned) : null,
        exercise_mode: e.exercise_mode,
        task_name: e.exercise_mode,
        task_unit_type: 'minutes',
      }));

      return res.status(200).json({ ok: true, entries: formattedEntries, entry_type: 'flaps' });
    } else {
      const entries = await db
        .select({
          id: challengeEntries.id,
          task_id: challengeEntries.task_id,
          user_id: challengeEntries.user_id,
          entry_date: challengeEntries.entry_date,
          value: challengeEntries.value,
          note: challengeEntries.note,
          inserted_at: challengeEntries.inserted_at,
          task_name: challengeTasks.name,
          task_unit_type: challengeTasks.unit_type,
          username: users.username,
        })
        .from(challengeEntries)
        .innerJoin(challengeTasks, eq(challengeEntries.task_id, challengeTasks.id))
        .innerJoin(users, eq(challengeEntries.user_id, users.id))
        .where(eq(challengeEntries.challenge_id, challengeId))
        .orderBy(challengeEntries.entry_date);

      const formattedEntries = entries.map(e => ({
        ...e,
        entry_type: 'rep',
        display: `${e.task_name}: ${e.value}`,
      }));

      return res.status(200).json({ ok: true, entries: formattedEntries, entry_type: 'rep' });
    }
  } catch (error) {
    console.error('Error fetching challenge entries:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

async function handlePost(challengeId: string, req: NextApiRequest, res: NextApiResponse) {
  try {
    const challengeData = await db
      .select({ template_key: challenges.template_key, id: challenges.id })
      .from(challenges)
      .where(eq(challenges.id, challengeId))
      .limit(1);

    if (!challengeData[0]) {
      return res.status(404).json({ ok: false, error: 'Challenge not found' });
    }

    const isFlapsChallenge = ['lone_flaps', 'flap_off', 'team_flaps'].includes(challengeData[0].template_key || '');

    if (isFlapsChallenge) {
      const { user_id, entry_date, duration_minutes, avg_heart_rate, calories_burned, exercise_mode, notes } = req.body;

      if (!user_id || !entry_date || !duration_minutes || !exercise_mode) {
        return res.status(400).json({ ok: false, error: 'user_id, entry_date, duration_minutes, and exercise_mode are required' });
      }

      const participantCheck = await db
        .select({ id: challengeParticipants.id })
        .from(challengeParticipants)
        .where(and(
          eq(challengeParticipants.challenge_id, challengeId),
          eq(challengeParticipants.user_id, user_id)
        ))
        .limit(1);

      if (!participantCheck[0]) {
        return res.status(400).json({ ok: false, error: 'User is not a participant in this challenge' });
      }

      const [newEntry] = await db
        .insert(flapsLog)
        .values({
          user_id,
          entry_date,
          duration_minutes: Math.round(Number(duration_minutes)),
          avg_heart_rate: avg_heart_rate ? Math.round(Number(avg_heart_rate)) : null,
          calories_burned: calories_burned ? Math.round(Number(calories_burned)) : null,
          exercise_mode,
          notes: notes || null,
          challenge_id: challengeId,
        })
        .returning({ id: flapsLog.id });

      return res.status(201).json({ ok: true, entry_id: newEntry.id, message: 'Flaps entry added' });
    } else {
      const { user_id, entry_date, value, task_id } = req.body;

      if (!user_id || !entry_date || value === undefined) {
        return res.status(400).json({ ok: false, error: 'user_id, entry_date, and value are required' });
      }

      const tasks = await db
        .select({ id: challengeTasks.id })
        .from(challengeTasks)
        .where(eq(challengeTasks.challenge_id, challengeId));

      if (tasks.length === 0) {
        return res.status(400).json({ ok: false, error: 'Challenge has no tasks' });
      }

      const targetTaskId = task_id || tasks[0].id;
      const validTask = tasks.find(t => t.id === targetTaskId);
      if (!validTask) {
        return res.status(400).json({ ok: false, error: 'Invalid task_id for this challenge' });
      }

      const [newEntry] = await db
        .insert(challengeEntries)
        .values({
          challenge_id: challengeId,
          task_id: targetTaskId,
          user_id,
          entry_date,
          value: String(value),
        })
        .returning({ id: challengeEntries.id });

      return res.status(201).json({ ok: true, entry_id: newEntry.id, message: 'Entry added' });
    }
  } catch (error) {
    console.error('Error adding challenge entry:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
