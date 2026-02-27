// pages/api/tracker/flaps.ts
// POST - Log a Flaps activity (cardio/HIIT with HR, calories, duration)
// GET - Get Flaps history for the current user

import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, flapsLog, challenges, challengeParticipants, activityLog, exerciseTypes } from '../../../lib/db';
import { eq, and, desc, inArray, lte, gte, or } from 'drizzle-orm';
import { getSydneyDateString } from '../../../lib/dateUtils';
import { randomUUID } from 'crypto';

type ApiResponse =
  | { ok: true; entry?: any; entries?: any[]; totals?: Record<string, any> }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  let session = parseSessionFromRequest(req);

  if (!session && process.env.TEST_BYPASS_AUTH === 'true') {
    session = {
      id: '7d921803-163b-4f6e-827f-4c3a94ba9efb',
      username: 'Nox',
      isAdmin: true,
    };
  }

  if (!session) {
    return res.status(401).json({ ok: false, error: 'Please log in to use Flaps' });
  }

  if (req.method === 'POST') {
    return handlePost(req, res, session);
  }

  if (req.method === 'GET') {
    return handleGet(req, res, session);
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  session: { id: string; username: string }
) {
  try {
    const {
      entry_date,
      duration_minutes,
      avg_heart_rate,
      calories_burned,
      exercise_mode,
      distance_km,
      hiit_details,
      custom_exercise,
      notes,
      challenge_id,
    } = req.body;

    // Validate required fields
    if (!duration_minutes || duration_minutes <= 0) {
      return res.status(400).json({ ok: false, error: 'Duration is required' });
    }

    if (!exercise_mode) {
      return res.status(400).json({ ok: false, error: 'Exercise mode is required' });
    }

    const validModes = ['Ride', 'Run', 'Hike', 'Walk', 'Swim', 'HIIT', 'Custom'];
    if (!validModes.includes(exercise_mode)) {
      return res.status(400).json({ ok: false, error: 'Invalid exercise mode' });
    }

    if (exercise_mode === 'Custom' && (!custom_exercise || custom_exercise.trim().length === 0)) {
      return res.status(400).json({ ok: false, error: 'Custom exercise type is required' });
    }

    const today = getSydneyDateString();
    const logDate = entry_date || today;

    // Find active Flaps challenges the user is participating in
    // that overlap with the log date
    let linkedChallengeId = challenge_id || null;
    
    if (!linkedChallengeId) {
      // Auto-link to active Flaps challenges
      const activeFlapsParticipations = await db
        .select({ challenge_id: challengeParticipants.challenge_id })
        .from(challengeParticipants)
        .where(
          and(
            eq(challengeParticipants.user_id, session.id),
            or(
              eq(challengeParticipants.state, 'accepted'),
              eq(challengeParticipants.state, 'creator')
            )
          )
        );

      if (activeFlapsParticipations.length > 0) {
        const participatedChallengeIds = activeFlapsParticipations.map(p => p.challenge_id);
        
        // Find Flaps challenges that are active or pending (for accepted participants)
        // and overlap with log date
        const activeFlaps = await db
          .select({ id: challenges.id })
          .from(challenges)
          .where(
            and(
              inArray(challenges.id, participatedChallengeIds),
              inArray(challenges.status, ['active', 'pending']),
              inArray(challenges.template_key, ['lone_flaps', 'flap_off', 'team_flaps']),
              lte(challenges.starts_on, logDate),
              gte(challenges.ends_on, logDate)
            )
          )
          .limit(1);

        if (activeFlaps.length > 0) {
          linkedChallengeId = activeFlaps[0].id;
        }
      }
    }

    // Insert the flaps log entry
    const result = await db
      .insert(flapsLog)
      .values({
        user_id: session.id,
        entry_date: logDate,
        duration_minutes: duration_minutes,
        avg_heart_rate: avg_heart_rate || null,
        calories_burned: calories_burned || null,
        exercise_mode: exercise_mode,
        distance_km: distance_km?.toString() || null,
        hiit_details: hiit_details || null,
        custom_exercise: custom_exercise || null,
        notes: notes || null,
        challenge_id: linkedChallengeId,
      })
      .returning({
        id: flapsLog.id,
        entry_date: flapsLog.entry_date,
        duration_minutes: flapsLog.duration_minutes,
        avg_heart_rate: flapsLog.avg_heart_rate,
        calories_burned: flapsLog.calories_burned,
        exercise_mode: flapsLog.exercise_mode,
        distance_km: flapsLog.distance_km,
        challenge_id: flapsLog.challenge_id,
        created_at: flapsLog.created_at,
      });

    const entry = result[0];

    // Cross-log cardio activities (Ride, Run, Swim, Hike, Walk) to normal activity_log
    // This ensures Flaps cardio entries appear in Activity History too
    const cardioModes = ['Ride', 'Run', 'Swim', 'Hike', 'Walk'];
    if (cardioModes.includes(exercise_mode) && distance_km && parseFloat(distance_km) > 0) {
      try {
        const exerciseTypeResult = await db
          .select({ id: exerciseTypes.id })
          .from(exerciseTypes)
          .where(eq(exerciseTypes.name, exercise_mode))
          .limit(1);

        if (exerciseTypeResult.length > 0) {
          await db.insert(activityLog).values({
            id: randomUUID(),
            user_id: session.id,
            exercise_type_id: exerciseTypeResult[0].id,
            value: distance_km.toString(),
            entry_date: logDate,
            created_at: new Date(),
          });
        }
      } catch (crossLogError) {
        console.error('Error cross-logging to activity_log:', crossLogError);
      }
    }

    return res.status(201).json({ ok: true, entry });
  } catch (error) {
    console.error('Error logging flaps activity:', error);
    return res.status(500).json({ ok: false, error: 'Failed to log activity' });
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  session: { id: string; username: string }
) {
  try {
    const { date_range, start_date, end_date } = req.query;

    const today = getSydneyDateString();
    let startDate: string | null = null;
    let endDate: string | null = null;

    if (start_date && typeof start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      startDate = start_date;
    }
    if (end_date && typeof end_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      endDate = end_date;
    }

    if (startDate && endDate && startDate > endDate) {
      [startDate, endDate] = [endDate, startDate];
    }

    if (!startDate && !endDate) {
      if (date_range === 'today') {
        startDate = today;
        endDate = today;
      } else if (date_range === 'week') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        startDate = d.toISOString().split('T')[0];
      } else if (date_range === 'month') {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        startDate = d.toISOString().split('T')[0];
      }
    }

    // Build conditions for the query
    const conditions = [eq(flapsLog.user_id, session.id)];
    if (startDate) {
      conditions.push(gte(flapsLog.entry_date, startDate));
    }
    if (endDate) {
      conditions.push(lte(flapsLog.entry_date, endDate));
    }

    // Fetch all entries matching the date range (no artificial limit for totals)
    const allEntries = await db
      .select({
        id: flapsLog.id,
        entry_date: flapsLog.entry_date,
        duration_minutes: flapsLog.duration_minutes,
        avg_heart_rate: flapsLog.avg_heart_rate,
        calories_burned: flapsLog.calories_burned,
        exercise_mode: flapsLog.exercise_mode,
        distance_km: flapsLog.distance_km,
        hiit_details: flapsLog.hiit_details,
        custom_exercise: flapsLog.custom_exercise,
        notes: flapsLog.notes,
        challenge_id: flapsLog.challenge_id,
        created_at: flapsLog.created_at,
      })
      .from(flapsLog)
      .where(and(...conditions))
      .orderBy(desc(flapsLog.entry_date), desc(flapsLog.created_at));

    // Calculate totals from all matching entries
    const totals: Record<string, { duration: number; distance: number; calories: number; entries: number }> = {};
    for (const entry of allEntries) {
      const mode = entry.exercise_mode || 'Unknown';
      if (!totals[mode]) {
        totals[mode] = { duration: 0, distance: 0, calories: 0, entries: 0 };
      }
      totals[mode].duration += entry.duration_minutes || 0;
      totals[mode].distance += parseFloat(entry.distance_km || '0') || 0;
      totals[mode].calories += entry.calories_burned || 0;
      totals[mode].entries += 1;
    }

    // Limit entries for display (but totals are computed from all)
    const entries = allEntries.slice(0, 200);

    return res.status(200).json({ ok: true, entries, totals });
  } catch (error) {
    console.error('Error fetching flaps history:', error);
    return res.status(500).json({ ok: false, error: 'Failed to fetch history' });
  }
}
