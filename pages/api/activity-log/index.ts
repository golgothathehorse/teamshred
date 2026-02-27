// pages/api/activity-log/index.ts
// API for logging and fetching user activities (shared across challenges)

import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { db, challengeEntries, challengeTasks, challenges, challengeParticipants, exerciseTypes, activityLog } from '../../../lib/db';
import { eq, and, desc, gte, inArray } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../../lib/auth';
import { getSydneyDateString } from '../../../lib/dateUtils';
import { getUnitLabel, FALLBACK_EXERCISE_TYPES } from '../../../lib/exercises';

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
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, session);
  } else if (req.method === 'POST') {
    return handlePost(req, res, session);
  } else {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  session: { id: string; username: string }
) {
  try {
    const { date_range, start_date, end_date } = req.query;

    let startDate: string | null = null;
    let endDate: string | null = null;
    const today = getSydneyDateString();

    // Handle custom date range with validation
    if (start_date && typeof start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      startDate = start_date;
    }
    if (end_date && typeof end_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      endDate = end_date;
    }
    
    // Ensure start is before end if both are provided
    if (startDate && endDate && startDate > endDate) {
      // Swap if reversed
      [startDate, endDate] = [endDate, startDate];
    }

    // Handle preset date ranges (only if custom dates not provided)
    if (!startDate && !endDate) {
      if (date_range === 'today') {
        startDate = today;
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

    // Query standalone activity_log entries (new entries always go here)
    const standaloneEntries = await db
      .select({
        id: activityLog.id,
        value: activityLog.value,
        entry_date: activityLog.entry_date,
        created_at: activityLog.created_at,
        exercise_type_id: activityLog.exercise_type_id,
      })
      .from(activityLog)
      .where(eq(activityLog.user_id, session.id))
      .orderBy(desc(activityLog.entry_date), desc(activityLog.created_at))
      .limit(100);

    // Get exercise types for standalone entries
    const exerciseTypeIds = Array.from(new Set(standaloneEntries.map((e) => e.exercise_type_id)));
    let exerciseTypesMap: Record<string, { name: string; unit_type: string; unit_label: string }> = {};

    if (exerciseTypeIds.length > 0) {
      const types = await db
        .select({
          id: exerciseTypes.id,
          name: exerciseTypes.name,
          unit_type: exerciseTypes.unit_type,
          unit_label: exerciseTypes.unit_label,
        })
        .from(exerciseTypes)
        .where(inArray(exerciseTypes.id, exerciseTypeIds));

      for (const type of types) {
        exerciseTypesMap[type.id] = { 
          name: type.name, 
          unit_type: type.unit_type || 'reps',
          unit_label: type.unit_label || 'reps'
        };
      }
    }

    // Add fallback exercise types to the map
    for (const ft of FALLBACK_EXERCISE_TYPES) {
      if (!exerciseTypesMap[ft.id]) {
        exerciseTypesMap[ft.id] = { name: ft.name, unit_type: ft.unit_type, unit_label: ft.unit_label };
      }
    }

    // Filter by date range and convert to unified activity format
    const standaloneFiltered = standaloneEntries.filter((e) => {
      if (startDate && e.entry_date < startDate) return false;
      if (endDate && e.entry_date > endDate) return false;
      return true;
    });

    const standaloneActivities = standaloneFiltered.map((entry) => {
      const exerciseType = exerciseTypesMap[entry.exercise_type_id] || { name: 'Unknown', unit_type: 'reps', unit_label: 'reps' };
      return {
        id: entry.id,
        value: Number(entry.value),
        entry_date: entry.entry_date,
        created_at: entry.created_at?.toISOString() ?? new Date().toISOString(),
        source: 'standalone' as const,
        exercise_types: {
          id: entry.exercise_type_id,
          name: exerciseType.name,
          unit_type: exerciseType.unit_type,
          unit_label: getUnitLabel(exerciseType.unit_type),
        },
      };
    });

    // Also query legacy challenge entries (for backwards compatibility)
    // These are entries created before standalone logging was added
    // IMPORTANT: We exclude entries with log_request_id since those were synced 
    // from a Quick Log action and are already represented in activity_log
    const legacyChallengeEntries = await db
      .select({
        id: challengeEntries.id,
        value: challengeEntries.value,
        entry_date: challengeEntries.entry_date,
        inserted_at: challengeEntries.inserted_at,
        task_id: challengeEntries.task_id,
        challenge_id: challengeEntries.challenge_id,
        log_request_id: challengeEntries.log_request_id,
      })
      .from(challengeEntries)
      .where(eq(challengeEntries.user_id, session.id))
      .orderBy(desc(challengeEntries.entry_date), desc(challengeEntries.inserted_at))
      .limit(100);
    
    // Filter out entries that have log_request_id - those are synced from Quick Log
    // and already represented in activity_log
    const trueLegacyEntries = legacyChallengeEntries.filter(e => !e.log_request_id);

    const taskIds = Array.from(new Set(trueLegacyEntries.map((e) => e.task_id)));
    let tasksMap: Record<string, { name: string; unit_type: string }> = {};

    if (taskIds.length > 0) {
      const tasks = await db
        .select({
          id: challengeTasks.id,
          name: challengeTasks.name,
          unit_type: challengeTasks.unit_type,
        })
        .from(challengeTasks)
        .where(inArray(challengeTasks.id, taskIds));

      for (const task of tasks) {
        tasksMap[task.id] = { name: task.name, unit_type: task.unit_type || 'reps' };
      }
    }

    const legacyFiltered = trueLegacyEntries.filter((e) => {
      if (startDate && e.entry_date < startDate) return false;
      if (endDate && e.entry_date > endDate) return false;
      return true;
    });

    // Deduplicate legacy challenge entries using log_request_id
    const deduplicatedLegacy: typeof legacyFiltered = [];
    const seenRequestIds = new Set<string>();
    const seenLegacyActions: { name: string; value: string | null; timestamp: number; challengeId: string }[] = [];

    for (const entry of legacyFiltered) {
      const task = tasksMap[entry.task_id] || { name: 'Unknown', unit_type: 'reps' };
      
      if (entry.log_request_id) {
        if (!seenRequestIds.has(entry.log_request_id)) {
          seenRequestIds.add(entry.log_request_id);
          deduplicatedLegacy.push(entry);
        }
      } else {
        const entryTimestamp = entry.inserted_at?.getTime() ?? 0;
        const isDuplicateFromMultiChallenge = seenLegacyActions.some(seen => 
          seen.name === task.name && 
          seen.value === entry.value &&
          Math.abs(seen.timestamp - entryTimestamp) < 100 &&
          seen.challengeId !== entry.challenge_id
        );
        
        if (!isDuplicateFromMultiChallenge) {
          deduplicatedLegacy.push(entry);
        }
        seenLegacyActions.push({ 
          name: task.name, 
          value: entry.value, 
          timestamp: entryTimestamp,
          challengeId: entry.challenge_id
        });
      }
    }

    const legacyActivities = deduplicatedLegacy.map((entry) => {
      const task = tasksMap[entry.task_id] || { name: 'Unknown', unit_type: 'reps' };
      return {
        id: entry.id,
        value: Number(entry.value),
        entry_date: entry.entry_date,
        created_at: entry.inserted_at?.toISOString() ?? new Date().toISOString(),
        source: 'challenge' as const,
        exercise_types: {
          id: '',
          name: task.name,
          unit_type: task.unit_type,
          unit_label: getUnitLabel(task.unit_type),
        },
      };
    });

    // Merge standalone and legacy activities
    // Standalone entries are the new source of truth
    // Legacy entries are from before standalone logging was added
    // Since both use different UUIDs, we just need to deduplicate by time proximity
    // (entries logged at the same time for same exercise from different sources)
    type ActivityItem = {
      id: string;
      value: number;
      entry_date: string;
      created_at: string;
      source: 'standalone' | 'challenge';
      exercise_types: {
        id: string;
        name: string;
        unit_type: string;
        unit_label: string;
      };
    };
    const allActivities: ActivityItem[] = [...standaloneActivities];
    const standaloneIds = new Set(standaloneActivities.map(a => a.id));
    
    // Track standalone entries by exercise name + value + timestamp for deduplication
    const standaloneSignatures = new Set<string>();
    for (const sa of standaloneActivities) {
      // Create a signature based on exercise name, value, and timestamp (rounded to 1s)
      const timestamp = new Date(sa.created_at).getTime();
      const roundedTs = Math.floor(timestamp / 1000);
      const sig = `${sa.exercise_types.name}|${sa.value}|${roundedTs}`;
      standaloneSignatures.add(sig);
    }
    
    // Add legacy entries that don't have a matching standalone entry
    for (const legacy of legacyActivities) {
      // Check if there's a standalone entry from the same log action
      const timestamp = new Date(legacy.created_at).getTime();
      const roundedTs = Math.floor(timestamp / 1000);
      const sig = `${legacy.exercise_types.name}|${legacy.value}|${roundedTs}`;
      
      // Skip if we have a matching standalone entry (same exercise, value, and time)
      if (standaloneSignatures.has(sig)) {
        continue;
      }
      
      if (!standaloneIds.has(legacy.id)) {
        allActivities.push(legacy);
      }
    }

    // Sort by date and created_at descending
    allActivities.sort((a, b) => {
      const dateCompare = b.entry_date.localeCompare(a.entry_date);
      if (dateCompare !== 0) return dateCompare;
      return b.created_at.localeCompare(a.created_at);
    });

    // Limit to 100 entries
    const activities = allActivities.slice(0, 100);

    const totals: Record<string, number> = {};
    for (const activity of activities) {
      const name = activity.exercise_types.name;
      totals[name] = (totals[name] || 0) + Number(activity.value);
    }

    const isAdmin = session.username?.toLowerCase() === 'nox';

    return res.status(200).json({
      ok: true,
      activities,
      totals,
      is_admin: isAdmin,
    });
  } catch (error) {
    console.error('Error in activity log GET:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  session: { id: string; username: string }
) {
  try {
    const { exercise_type_id, value, entry_date } = req.body;

    if (!exercise_type_id) {
      return res.status(400).json({ ok: false, error: 'Exercise type is required' });
    }

    const numValue = Number(value);
    if (isNaN(numValue) || numValue <= 0) {
      return res.status(400).json({ ok: false, error: 'Value must be a positive number' });
    }

    let exerciseType: { id: string; name: string; unit_type: string; unit_label: string } | null = null;

    const dbExerciseTypes = await db
      .select({
        id: exerciseTypes.id,
        name: exerciseTypes.name,
        unit_type: exerciseTypes.unit_type,
        unit_label: exerciseTypes.unit_label,
      })
      .from(exerciseTypes)
      .where(eq(exerciseTypes.id, exercise_type_id))
      .limit(1);

    if (dbExerciseTypes.length > 0) {
      const et = dbExerciseTypes[0];
      exerciseType = {
        id: et.id,
        name: et.name,
        unit_type: et.unit_type || 'reps',
        unit_label: et.unit_label || 'reps',
      };
    } else {
      const fallback = FALLBACK_EXERCISE_TYPES.find((et) => et.id === exercise_type_id);
      if (fallback) {
        exerciseType = fallback;
      }
    }

    if (!exerciseType) {
      return res.status(400).json({ ok: false, error: 'Invalid exercise type' });
    }

    const effectiveDate = entry_date || getSydneyDateString();
    
    // Generate a unique request ID to group all entries from this Quick Log action
    const logRequestId = randomUUID();
    
    // Always insert into standalone activity_log table first
    // This ensures exercise is logged even without active challenges
    const standaloneLogId = randomUUID();
    await db.insert(activityLog).values({
      id: standaloneLogId,
      user_id: session.id,
      exercise_type_id: exerciseType.id,
      value: numValue.toString(),
      entry_date: effectiveDate,
      created_at: new Date(),
    });

    // Additionally, insert into challenge entries for any active challenges with matching exercise
    const matchingTasks = await db
      .select({
        id: challengeTasks.id,
        challenge_id: challengeTasks.challenge_id,
        name: challengeTasks.name,
      })
      .from(challengeTasks)
      .where(eq(challengeTasks.name, exerciseType.name));

    for (const task of matchingTasks) {
      const challengeData = await db
        .select({
          id: challenges.id,
          status: challenges.status,
          starts_on: challenges.starts_on,
          ends_on: challenges.ends_on,
        })
        .from(challenges)
        .where(eq(challenges.id, task.challenge_id))
        .limit(1);

      const challenge = challengeData[0];

      // Check if within challenge date range
      if (
        challenge &&
        effectiveDate >= challenge.starts_on &&
        effectiveDate <= challenge.ends_on
      ) {
        // For active challenges: check if user is accepted/latecomer participant
        // For pending challenges: also allow if user is the creator (so they can log while waiting for opponent)
        let shouldSync = false;
        
        if (challenge.status === 'active') {
          // Active challenges - any accepted/latecomer participant can log
          const participantData = await db
            .select({ id: challengeParticipants.id })
            .from(challengeParticipants)
            .where(
              and(
                eq(challengeParticipants.challenge_id, challenge.id),
                eq(challengeParticipants.user_id, session.id),
                inArray(challengeParticipants.state, ['accepted', 'latecomer'])
              )
            )
            .limit(1);
          shouldSync = participantData.length > 0;
        } else if (challenge.status === 'pending') {
          // Pending challenges - only the creator can log (waiting for opponent to accept)
          const creatorData = await db
            .select({ id: challengeParticipants.id })
            .from(challengeParticipants)
            .where(
              and(
                eq(challengeParticipants.challenge_id, challenge.id),
                eq(challengeParticipants.user_id, session.id),
                eq(challengeParticipants.role, 'creator'),
                eq(challengeParticipants.state, 'accepted')
              )
            )
            .limit(1);
          shouldSync = creatorData.length > 0;
        }

        if (shouldSync) {
          await db.insert(challengeEntries).values({
            id: randomUUID(),
            challenge_id: challenge.id,
            task_id: task.id,
            user_id: session.id,
            entry_date: effectiveDate,
            value: numValue.toString(),
            log_request_id: logRequestId,
            inserted_at: new Date(),
          });
        }
      }
    }

    return res.status(200).json({
      ok: true,
      activity: { id: standaloneLogId, exercise_type_id, value: numValue, entry_date: effectiveDate },
      exercise_type: exerciseType,
    });
  } catch (error) {
    console.error('Error in activity log POST:', error);
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: `Internal server error: ${errMessage}` });
  }
}
