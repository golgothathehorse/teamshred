// pages/api/stats/[username].ts
// API for fetching another user's shared workout history

import type { NextApiRequest, NextApiResponse } from 'next';
import { db, users, profiles, challengeEntries, challengeTasks, exerciseTypes, activityLog } from '../../../lib/db';
import { eq, desc, asc, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../../lib/auth';
import { getUnitLabel } from '../../../lib/exercises';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  const { username } = req.query;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ ok: false, error: 'Username required' });
  }

  try {
    // First try exact match, then case-insensitive
    let targetUsers = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.username, username.trim()))
      .limit(1);

    if (targetUsers.length === 0) {
      targetUsers = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(sql`LOWER(${users.username}) = LOWER(${username.trim()})`)
        .limit(1);
    }

    const targetUser = targetUsers[0];

    if (!targetUser) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const isOwnProfile = session.id === targetUser.id;

    if (!isOwnProfile) {
      const targetProfileData = await db
        .select({ share_workout_history: profiles.share_workout_history })
        .from(profiles)
        .where(eq(profiles.user_id, targetUser.id))
        .limit(1);

      const shareEnabled = targetProfileData[0]?.share_workout_history ?? false;

      if (!shareEnabled) {
        return res.status(403).json({
          ok: false,
          error: 'This user has not shared their workout history',
          shared: false,
        });
      }
    }

    const exerciseTypeId = req.query.exercise_type_id as string | undefined;
    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    // Fetch available exercise types for reference and mapping
    const allExerciseTypes = await db
      .select({
        id: exerciseTypes.id,
        name: exerciseTypes.name,
        unit_type: exerciseTypes.unit_type,
        unit_label: exerciseTypes.unit_label,
      })
      .from(exerciseTypes)
      .where(eq(exerciseTypes.is_active, true))
      .orderBy(asc(exerciseTypes.sort_order));

    // Create name-to-exerciseType mapping for matching task names to exercise types
    const exerciseTypeByName = new Map<string, (typeof allExerciseTypes)[0]>();
    for (const et of allExerciseTypes) {
      exerciseTypeByName.set(et.name.toLowerCase(), et);
    }

    // If filtering by exercise_type_id, get the exercise type name to filter by
    let filterByName: string | null = null;
    if (exerciseTypeId) {
      const matchingEt = allExerciseTypes.find(et => et.id === exerciseTypeId);
      if (matchingEt) {
        filterByName = matchingEt.name.toLowerCase();
      }
    }

    // ========== STANDALONE ACTIVITY LOG ENTRIES ==========
    const standaloneEntries = await db
      .select({
        id: activityLog.id,
        value: activityLog.value,
        entry_date: activityLog.entry_date,
        created_at: activityLog.created_at,
        exercise_type_id: activityLog.exercise_type_id,
      })
      .from(activityLog)
      .where(eq(activityLog.user_id, targetUser.id))
      .orderBy(desc(activityLog.entry_date), desc(activityLog.created_at))
      .limit(limit);

    // Create exercise types map by ID
    const exerciseTypesById = new Map<string, (typeof allExerciseTypes)[0]>();
    for (const et of allExerciseTypes) {
      exerciseTypesById.set(et.id, et);
    }

    // Format standalone activities
    const standaloneActivities = standaloneEntries
      .filter((e) => {
        if (startDate && e.entry_date < startDate) return false;
        if (endDate && e.entry_date > endDate) return false;
        if (exerciseTypeId && e.exercise_type_id !== exerciseTypeId) return false;
        return true;
      })
      .map((entry) => {
        const exerciseType = exerciseTypesById.get(entry.exercise_type_id);
        return {
          id: entry.id,
          value: Number(entry.value),
          entry_date: entry.entry_date,
          created_at: entry.created_at?.toISOString() ?? new Date().toISOString(),
          source: 'standalone' as const,
          notes: null,
          exercise_types: exerciseType ? {
            id: exerciseType.id,
            name: exerciseType.name,
            unit_type: exerciseType.unit_type || 'reps',
            unit_label: exerciseType.unit_label || getUnitLabel(exerciseType.unit_type || 'reps'),
          } : {
            id: entry.exercise_type_id,
            name: 'Unknown',
            unit_type: 'reps',
            unit_label: 'reps',
          },
        };
      });

    // ========== CHALLENGE ENTRIES ==========
    const challengeEntriesData = await db
      .select({
        id: challengeEntries.id,
        value: challengeEntries.value,
        entry_date: challengeEntries.entry_date,
        inserted_at: challengeEntries.inserted_at,
        task_id: challengeEntries.task_id,
        note: challengeEntries.note,
        challenge_id: challengeEntries.challenge_id,
        log_request_id: challengeEntries.log_request_id,
      })
      .from(challengeEntries)
      .where(eq(challengeEntries.user_id, targetUser.id))
      .orderBy(desc(challengeEntries.entry_date), desc(challengeEntries.inserted_at))
      .limit(limit);

    // Get unique task IDs to fetch task metadata
    const taskIds = Array.from(new Set(challengeEntriesData.map((e) => e.task_id)));

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

    // Filter and deduplicate challenge entries
    const filteredChallengeEntries = challengeEntriesData.filter((e) => {
      if (startDate && e.entry_date < startDate) return false;
      if (endDate && e.entry_date > endDate) return false;
      if (filterByName) {
        const task = tasksMap[e.task_id];
        if (!task || task.name.toLowerCase() !== filterByName) return false;
      }
      return true;
    });

    // Deduplicate challenge entries by log_request_id
    const deduplicatedChallengeEntries: typeof filteredChallengeEntries = [];
    const seenRequestIds = new Set<string>();
    const seenChallengeActions: { name: string; value: string | null; timestamp: number; challengeId: string }[] = [];

    for (const entry of filteredChallengeEntries) {
      const task = tasksMap[entry.task_id] || { name: 'Unknown', unit_type: 'reps' };
      
      if (entry.log_request_id) {
        if (!seenRequestIds.has(entry.log_request_id)) {
          seenRequestIds.add(entry.log_request_id);
          deduplicatedChallengeEntries.push(entry);
        }
      } else {
        const entryTimestamp = entry.inserted_at?.getTime() ?? 0;
        const isDuplicateFromMultiChallenge = seenChallengeActions.some(seen => 
          seen.name === task.name && 
          seen.value === entry.value &&
          Math.abs(seen.timestamp - entryTimestamp) < 100 &&
          seen.challengeId !== entry.challenge_id
        );
        
        if (!isDuplicateFromMultiChallenge) {
          deduplicatedChallengeEntries.push(entry);
        }
        seenChallengeActions.push({ 
          name: task.name, 
          value: entry.value, 
          timestamp: entryTimestamp,
          challengeId: entry.challenge_id
        });
      }
    }

    // Format challenge entries
    const challengeActivities = deduplicatedChallengeEntries.map((entry) => {
      const task = tasksMap[entry.task_id] || { name: 'Unknown', unit_type: 'reps' };
      const matchingExerciseType = exerciseTypeByName.get(task.name.toLowerCase());
      
      return {
        id: entry.id,
        value: Number(entry.value),
        entry_date: entry.entry_date,
        created_at: entry.inserted_at?.toISOString() ?? new Date().toISOString(),
        source: 'challenge' as const,
        notes: entry.note,
        exercise_types: matchingExerciseType ? {
          id: matchingExerciseType.id,
          name: matchingExerciseType.name,
          unit_type: matchingExerciseType.unit_type || task.unit_type,
          unit_label: matchingExerciseType.unit_label || getUnitLabel(task.unit_type),
        } : {
          id: entry.task_id,
          name: task.name,
          unit_type: task.unit_type,
          unit_label: getUnitLabel(task.unit_type),
        },
      };
    });

    // ========== MERGE AND DEDUPLICATE ==========
    type ActivityItem = {
      id: string;
      value: number;
      entry_date: string;
      created_at: string;
      source: 'standalone' | 'challenge';
      notes: string | null;
      exercise_types: {
        id: string;
        name: string;
        unit_type: string;
        unit_label: string;
      };
    };
    
    const allActivities: ActivityItem[] = [...standaloneActivities];
    
    // Track standalone entries by exercise name + value + timestamp for deduplication
    const standaloneSignatures = new Set<string>();
    for (const sa of standaloneActivities) {
      const timestamp = new Date(sa.created_at).getTime();
      const roundedTs = Math.floor(timestamp / 1000);
      const sig = `${sa.exercise_types.name}|${sa.value}|${roundedTs}`;
      standaloneSignatures.add(sig);
    }
    
    // Add challenge entries that don't have a matching standalone entry
    for (const challenge of challengeActivities) {
      const timestamp = new Date(challenge.created_at).getTime();
      const roundedTs = Math.floor(timestamp / 1000);
      const sig = `${challenge.exercise_types.name}|${challenge.value}|${roundedTs}`;
      
      if (!standaloneSignatures.has(sig)) {
        allActivities.push(challenge);
      }
    }

    // Sort by date and created_at descending
    allActivities.sort((a, b) => {
      const dateCompare = b.entry_date.localeCompare(a.entry_date);
      if (dateCompare !== 0) return dateCompare;
      return b.created_at.localeCompare(a.created_at);
    });

    // Limit results
    const formattedActivities = allActivities.slice(0, limit);

    // Calculate totals from all activities
    const totals: Record<string, number> = {};
    for (const activity of formattedActivities) {
      const etId = activity.exercise_types.id;
      totals[etId] = (totals[etId] || 0) + activity.value;
    }

    return res.status(200).json({
      ok: true,
      username: targetUser.username,
      activities: formattedActivities,
      totals,
      exercise_types: allExerciseTypes,
      is_own_profile: isOwnProfile,
    });
  } catch (error) {
    console.error('Error in stats API:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
