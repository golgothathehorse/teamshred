// pages/api/warzone/challenges/index.ts
// GET - List challenges for current user
// POST - Create a new attack challenge

import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { parseSessionFromRequest } from '../../../../lib/auth';
import { db, users, challenges, challengeParticipants, challengeTasks, challengeEntries, exerciseTypes } from '../../../../lib/db';
import { eq, and, or, inArray, desc, lte, gte } from 'drizzle-orm';
import { getTemplateById } from '../../../../lib/warzone/templates';
import { calculateChallengeResult, getChallengeDates } from '../../../../lib/warzone/statusEngine';
import { getFallbackExerciseById } from '../../../../lib/exercises';

import { getSydneyDateString } from '../../../../lib/dateUtils';

async function getExerciseTypeById(id: string): Promise<{ name: string; unit_type: string } | null> {
  try {
    const data = await db
      .select({ id: exerciseTypes.id, name: exerciseTypes.name, unit_type: exerciseTypes.unit_type })
      .from(exerciseTypes)
      .where(eq(exerciseTypes.id, id))
      .limit(1);

    if (data.length === 0) {
      const fallback = getFallbackExerciseById(id);
      return fallback ? { name: fallback.name, unit_type: fallback.unit_type } : null;
    }
    return { name: data[0].name, unit_type: data[0].unit_type || 'reps' };
  } catch (e) {
    const fallback = getFallbackExerciseById(id);
    return fallback ? { name: fallback.name, unit_type: fallback.unit_type } : null;
  }
}

// Backfill same-day entries from other ACTIVE challenges for participants
// This ensures activity logged before challenge creation counts toward the new challenge
// Only backfills from challenges that are currently active and overlap with today
async function backfillSameDayEntries(
  challengeId: string,
  taskId: string,
  taskName: string,
  participantUserIds: string[],
  startDate: string
): Promise<void> {
  const today = getSydneyDateString();
  
  // Only backfill if challenge starts today
  if (startDate !== today) {
    return;
  }

  try {
    // Check if we've already backfilled for this challenge+task (idempotency)
    const existingBackfill = await db
      .select({ id: challengeEntries.id })
      .from(challengeEntries)
      .where(
        and(
          eq(challengeEntries.challenge_id, challengeId),
          eq(challengeEntries.task_id, taskId)
        )
      )
      .limit(1);
    
    // If entries already exist for this task, don't backfill again
    if (existingBackfill.length > 0) {
      return;
    }

    // Find all tasks with the same name across OTHER challenges
    const matchingTasks = await db
      .select({ id: challengeTasks.id, challenge_id: challengeTasks.challenge_id })
      .from(challengeTasks)
      .where(eq(challengeTasks.name, taskName));

    // Filter to only active challenges that include today, excluding current challenge
    const otherChallengeIds = matchingTasks
      .filter(t => t.challenge_id !== challengeId)
      .map(t => t.challenge_id);

    if (otherChallengeIds.length === 0) {
      return;
    }

    // Get only ACTIVE challenges that overlap with today (date range includes today)
    const activeChallenges = await db
      .select({ id: challenges.id })
      .from(challenges)
      .where(
        and(
          inArray(challenges.id, otherChallengeIds),
          eq(challenges.status, 'active'),
          // Challenge date range must include today
          lte(challenges.starts_on, today),
          gte(challenges.ends_on, today)
        )
      );

    const activeOtherChallengeIds = activeChallenges.map(c => c.id);
    if (activeOtherChallengeIds.length === 0) {
      return;
    }

    // Get task IDs from those active challenges only
    const validTaskIds = matchingTasks
      .filter(t => activeOtherChallengeIds.includes(t.challenge_id))
      .map(t => t.id);

    if (validTaskIds.length === 0) {
      return;
    }

    for (const userId of participantUserIds) {
      // Find today's entries for this user from active challenges with same exercise
      const existingEntries = await db
        .select({
          id: challengeEntries.id,
          value: challengeEntries.value,
          entry_date: challengeEntries.entry_date,
          log_request_id: challengeEntries.log_request_id,
          inserted_at: challengeEntries.inserted_at,
        })
        .from(challengeEntries)
        .where(
          and(
            inArray(challengeEntries.task_id, validTaskIds),
            eq(challengeEntries.user_id, userId),
            eq(challengeEntries.entry_date, today)
          )
        );

      // Create corresponding entries for the new challenge
      // Group by log_request_id to avoid duplicates from the same Quick Log action
      // For legacy entries without log_request_id, use value+timestamp to detect duplicates
      const seenRequestIds = new Set<string>();
      const seenLegacyKeys = new Set<string>();
      
      for (const entry of existingEntries) {
        if (entry.log_request_id) {
          // Skip if we've already processed an entry from the same Quick Log action
          if (seenRequestIds.has(entry.log_request_id)) {
            continue;
          }
          seenRequestIds.add(entry.log_request_id);
        } else {
          // For legacy entries, deduplicate by value + approximate timestamp
          const timestamp = entry.inserted_at?.getTime() ?? 0;
          const roundedTimestamp = Math.floor(timestamp / 1000); // Round to nearest second
          const legacyKey = `${entry.value}-${roundedTimestamp}`;
          if (seenLegacyKeys.has(legacyKey)) {
            continue;
          }
          seenLegacyKeys.add(legacyKey);
        }

        await db.insert(challengeEntries).values({
          id: randomUUID(),
          challenge_id: challengeId,
          task_id: taskId,
          user_id: userId,
          entry_date: entry.entry_date,
          value: entry.value,
          log_request_id: entry.log_request_id || `backfill-${entry.id}`,
          inserted_at: new Date(),
        });
      }
    }
  } catch (error) {
    // Log but don't fail challenge creation if backfill fails
    console.error('Error backfilling same-day entries:', error);
  }
}

type ApiResponse =
  | { ok: true; challenges?: any[]; challenge?: any; current_user_id?: string; is_admin?: boolean }
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
    return res.status(401).json({ ok: false, error: 'Please log in to use Warzone' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, session);
  }

  if (req.method === 'POST') {
    return handlePost(req, res, session);
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse<ApiResponse>, session: { id: string; username: string }) {
  try {
    const participantData = await db
      .select({ challenge_id: challengeParticipants.challenge_id })
      .from(challengeParticipants)
      .where(eq(challengeParticipants.user_id, session.id));

    const challengeIds = participantData.map((p) => p.challenge_id);

    if (challengeIds.length === 0) {
      return res.status(200).json({
        ok: true,
        challenges: [],
        current_user_id: session.id,
        is_admin: session.username.toLowerCase() === 'nox',
      });
    }

    // For active view: show active/pending AND completed whose end date hasn't passed yet
    const today = getSydneyDateString();

    const challengesData = await db
      .select({
        id: challenges.id,
        scope: challenges.scope,
        template_key: challenges.template_key,
        title: challenges.title,
        description: challenges.description,
        stake_text: challenges.stake_text,
        starts_on: challenges.starts_on,
        ends_on: challenges.ends_on,
        status: challenges.status,
        created_by_user_id: challenges.created_by_user_id,
        created_at: challenges.created_at,
        target_weight_kg: challenges.target_weight_kg,
        completed_at: challenges.completed_at,
      })
      .from(challenges)
      .where(
        and(
          inArray(challenges.id, challengeIds),
          or(
            or(eq(challenges.status, 'active'), eq(challenges.status, 'pending')),
            and(
              eq(challenges.status, 'completed'),
              gte(challenges.ends_on, today)
            )
          )
        )
      )
      .orderBy(desc(challenges.created_at));

    const allParticipants = await db
      .select({
        id: challengeParticipants.id,
        challenge_id: challengeParticipants.challenge_id,
        user_id: challengeParticipants.user_id,
        role: challengeParticipants.role,
        state: challengeParticipants.state,
        joined_at: challengeParticipants.joined_at,
      })
      .from(challengeParticipants)
      .where(inArray(challengeParticipants.challenge_id, challengeIds));

    const allParticipantUserIds = Array.from(new Set(allParticipants.map((p) => p.user_id)));
    const participantUsers = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, allParticipantUserIds));

    const participantUserMap = new Map<string, string>();
    participantUsers.forEach((u) => participantUserMap.set(u.id, u.username));

    const participantsByChallenge = new Map<string, any[]>();
    allParticipants.forEach((p) => {
      const list = participantsByChallenge.get(p.challenge_id) || [];
      list.push({
        id: p.id,
        user_id: p.user_id,
        username: participantUserMap.get(p.user_id) || 'Unknown',
        role: p.role,
        state: p.state,
      });
      participantsByChallenge.set(p.challenge_id, list);
    });

    const allTasks = await db
      .select({
        id: challengeTasks.id,
        challenge_id: challengeTasks.challenge_id,
        name: challengeTasks.name,
        unit_type: challengeTasks.unit_type,
        target_value: challengeTasks.target_value,
      })
      .from(challengeTasks)
      .where(inArray(challengeTasks.challenge_id, challengeIds));

    const tasksByChallengeId = new Map<string, any[]>();
    allTasks.forEach((t) => {
      const list = tasksByChallengeId.get(t.challenge_id) || [];
      list.push(t);
      tasksByChallengeId.set(t.challenge_id, list);
    });

    const taskIds = allTasks.map((t) => t.id);
    const entriesByTask = new Map<string, any[]>();

    if (taskIds.length > 0) {
      const entries = await db
        .select({
          task_id: challengeEntries.task_id,
          user_id: challengeEntries.user_id,
          value: challengeEntries.value,
        })
        .from(challengeEntries)
        .where(inArray(challengeEntries.task_id, taskIds));

      entries.forEach((e) => {
        const list = entriesByTask.get(e.task_id) || [];
        list.push(e);
        entriesByTask.set(e.task_id, list);
      });
    }

    const enrichedChallenges = await Promise.all(
      challengesData.map(async (challenge) => {
        const participants = participantsByChallenge.get(challenge.id) || [];
        const challengeTaskList = tasksByChallengeId.get(challenge.id) || [];
        const task = challengeTaskList[0]; // Primary task

        let leaderSnapshot = null;
        let repLeaderboard: any[] | null = null;
        let totalTarget = 0;
        let totalProgress = 0;

        // Calculate totals from all tasks
        for (const t of challengeTaskList) {
          totalTarget += Number(t.target_value) || 0;
        }

        // Calculate progress for active challenges AND pending challenges (for creator)
        // This allows the creator to see their logged progress while waiting for opponent to accept
        const isCreator = challenge.created_by_user_id === session.id;
        const shouldCalculateProgress = challenge.status === 'active' || (challenge.status === 'pending' && isCreator);
        
        if (shouldCalculateProgress) {
          if (task && !challenge.template_key) {
            const totalsMap: Record<string, number> = {};

            for (const t of challengeTaskList) {
              const entries = entriesByTask.get(t.id) || [];
              for (const entry of entries) {
                const val = Number(entry.value) || 0;
                totalsMap[entry.user_id] = (totalsMap[entry.user_id] || 0) + val;
              }
            }

            // Calculate overall progress
            totalProgress = Object.values(totalsMap).reduce((sum, v) => sum + v, 0);

            // For pending challenges, show creator's progress; for active, show all accepted participants
            const eligibleParticipants = challenge.status === 'pending'
              ? participants.filter((p: any) => p.role === 'creator' && p.state === 'accepted')
              : participants.filter((p: any) => p.state === 'accepted' || p.state === 'latecomer');

            repLeaderboard = eligibleParticipants
              .map((p: any) => ({
                user_id: p.user_id,
                username: p.username,
                total: totalsMap[p.user_id] || 0,
              }))
              .sort((a: any, b: any) => b.total - a.total)
              .slice(0, 5);
          } else if (challenge.template_key) {
            try {
              const result = await calculateChallengeResult(
                challenge.id,
                challenge.template_key || 'epic_weekend',
                challenge.starts_on,
                challenge.ends_on,
                participants.map((p: any) => ({ user_id: p.user_id, username: p.username })),
                false,
                challenge.target_weight_kg ? Number(challenge.target_weight_kg) : null
              );
              leaderSnapshot = result;
            } catch (e) {
              console.error('Error calculating leader snapshot:', e);
            }
          }
        }

        return {
          ...challenge,
          created_at: challenge.created_at?.toISOString(),
          target_weight_kg: challenge.target_weight_kg ? Number(challenge.target_weight_kg) : null,
          participants,
          leader_snapshot: leaderSnapshot,
          rep_leaderboard: repLeaderboard,
          total_target: totalTarget,
          total_progress: totalProgress,
          is_rep_challenge: task && !challenge.template_key,
          current_user_participant: participants.find((p: any) => p.user_id === session.id),
        };
      })
    );

    return res.status(200).json({
      ok: true,
      challenges: enrichedChallenges,
      current_user_id: session.id,
      is_admin: session.username.toLowerCase() === 'nox',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in GET /api/warzone/challenges:', errorMessage, error);
    return res.status(500).json({ ok: false, error: `Server error: ${errorMessage}` });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse<ApiResponse>, session: { id: string; username: string }) {
  try {
    const userData = await db.select({ active_team_id: users.active_team_id }).from(users).where(eq(users.id, session.id)).limit(1);
    const creatorTeamId = userData[0]?.active_team_id || null;

    const {
      template_key,
      opponent_user_id,
      stake_text,
      challenge_kind,
      scope,
      title,
      starts_on,
      ends_on,
      exercise_type_id,
      task_name,
      target_type,
      target_value,
      legs,
      target_weight_kg,
    } = req.body;

    if (template_key) {
      return handleStatusChallenge(req, res, session, {
        template_key,
        opponent_user_id,
        stake_text,
        starts_on,
        ends_on,
        target_weight_kg,
        scope,
        team_id: creatorTeamId,
      });
    } else if (challenge_kind === 'custom' && legs && Array.isArray(legs)) {
      return handleCustomChallenge(req, res, session, {
        scope,
        title,
        starts_on,
        ends_on,
        legs,
        opponent_user_id,
        stake_text,
        team_id: creatorTeamId,
      });
    } else if (challenge_kind === 'reps') {
      return handleRepChallenge(req, res, session, {
        scope,
        title,
        starts_on,
        ends_on,
        exercise_type_id,
        task_name,
        target_type,
        target_value,
        opponent_user_id,
        stake_text,
        team_id: creatorTeamId,
      });
    } else if (challenge_kind === 'flaps') {
      const { target_avg_heart_rate, target_calories, target_duration_minutes, allowed_exercise_modes, comments } = req.body;
      return handleFlapsChallenge(req, res, session, {
        scope,
        title,
        starts_on,
        ends_on,
        target_avg_heart_rate,
        target_calories,
        target_duration_minutes,
        allowed_exercise_modes,
        opponent_user_id,
        stake_text,
        comments,
        team_id: creatorTeamId,
      });
    } else {
      return res.status(400).json({ ok: false, error: 'Either template_key or challenge_kind=reps/flaps is required' });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in POST /api/warzone/challenges:', errorMessage, error);
    return res.status(500).json({ ok: false, error: `Server error: ${errorMessage}` });
  }
}

async function handleStatusChallenge(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  session: { id: string; username: string },
  params: {
    template_key: string;
    opponent_user_id?: string;
    stake_text?: string;
    starts_on?: string;
    ends_on?: string;
    target_weight_kg?: number;
    scope?: string;
    team_id?: string | null;
  }
) {
  const { template_key, opponent_user_id, stake_text, starts_on: providedStartsOn, ends_on: providedEndsOn, target_weight_kg, team_id } = params;
  const isTeam = params.scope === 'team';

  const isCustom = template_key === 'custom';

  let template = null;
  if (!isCustom) {
    template = getTemplateById(template_key);
    if (!template) {
      return res.status(400).json({ ok: false, error: 'Invalid template' });
    }
  }

  if (!isTeam) {
    if (!opponent_user_id) {
      return res.status(400).json({ ok: false, error: 'Opponent is required' });
    }

    if (opponent_user_id === session.id) {
      return res.status(400).json({ ok: false, error: 'Cannot challenge yourself' });
    }
  }

  let opponent: { id: string; username: string } | null = null;
  if (!isTeam && opponent_user_id) {
    const opponentData = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, opponent_user_id))
      .limit(1);

    opponent = opponentData[0] || null;

    if (!opponent) {
      return res.status(400).json({ ok: false, error: 'Opponent not found' });
    }
  }

  let finalStartsOn: string;
  let finalEndsOn: string;

  if (providedStartsOn && providedEndsOn) {
    finalStartsOn = providedStartsOn;
    finalEndsOn = providedEndsOn;
  } else if (!isCustom) {
    const dates = getChallengeDates(template_key);
    finalStartsOn = dates.starts_on;
    finalEndsOn = dates.ends_on;
  } else {
    return res.status(400).json({ ok: false, error: 'Start and end dates are required for custom challenges' });
  }

  let challengeTitle: string;
  let challengeDescription: string;

  if (isCustom) {
    if (!target_weight_kg) {
      return res.status(400).json({ ok: false, error: 'Target weight loss is required for custom challenges' });
    }
    const prefix = isTeam ? 'Team Shred Off' : 'Custom Shred Off';
    challengeTitle = `${prefix} - Lose ${target_weight_kg}kg`;
    challengeDescription = isTeam
      ? `Team challenge to lose ${target_weight_kg}kg from starting weight. Everyone competes!`
      : `Race to lose ${target_weight_kg}kg from your starting weight. First to hit the target wins!`;
  } else {
    const prefix = isTeam ? 'Team ' : '';
    challengeTitle = `${prefix}${template!.name} Attack`;
    challengeDescription = template!.description;
  }

  const challengeScope = isTeam ? 'team' : 'duel';
  const challengeStatus = isTeam ? 'active' : 'pending';

  const challengeResult = await db
    .insert(challenges)
    .values({
      scope: challengeScope,
      template_key: template_key,
      title: challengeTitle,
      description: challengeDescription,
      stake_text: stake_text || null,
      starts_on: finalStartsOn,
      ends_on: finalEndsOn,
      status: challengeStatus,
      created_by_user_id: session.id,
      team_id: team_id || null,
      target_weight_kg: isCustom ? target_weight_kg?.toString() : null,
    })
    .returning();

  const challenge = challengeResult[0];

  if (!challenge) {
    return res.status(500).json({ ok: false, error: 'Failed to create challenge' });
  }

  try {
    if (isTeam) {
      await db.insert(challengeParticipants).values([
        { id: randomUUID(), challenge_id: challenge.id, user_id: session.id, role: 'creator', state: 'accepted', created_at: new Date() },
      ]);
    } else {
      await db.insert(challengeParticipants).values([
        { id: randomUUID(), challenge_id: challenge.id, user_id: session.id, role: 'creator', state: 'accepted', created_at: new Date() },
        { id: randomUUID(), challenge_id: challenge.id, user_id: opponent_user_id!, role: 'invited', state: 'invited', created_at: new Date() },
      ]);
    }
  } catch (participantsError) {
    console.error('Error creating participants:', participantsError);
    await db.delete(challenges).where(eq(challenges.id, challenge.id));
    return res.status(500).json({ ok: false, error: 'Failed to create challenge participants' });
  }

  const participants: any[] = [
    { user_id: session.id, username: session.username, role: 'creator', state: 'accepted' },
  ];
  if (!isTeam && opponent) {
    participants.push({ user_id: opponent.id, username: opponent.username, role: 'invited', state: 'invited' });
  }

  return res.status(201).json({
    ok: true,
    challenge: {
      ...challenge,
      created_at: challenge.created_at?.toISOString(),
      participants,
    },
  });
}

async function handleRepChallenge(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  session: { id: string; username: string },
  params: {
    scope: string;
    title: string;
    starts_on: string;
    ends_on: string;
    exercise_type_id?: string;
    task_name?: string;
    target_type: string;
    target_value: number;
    opponent_user_id?: string;
    stake_text?: string;
    team_id?: string | null;
  }
) {
  const { scope, title, starts_on, ends_on, exercise_type_id, task_name, target_type, target_value, opponent_user_id, stake_text, team_id } = params;

  if (!scope || !['duel', 'team', 'solo'].includes(scope)) {
    return res.status(400).json({ ok: false, error: 'Scope must be duel, team, or solo' });
  }

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'Title is required' });
  }

  if (!starts_on || !ends_on) {
    return res.status(400).json({ ok: false, error: 'Start and end dates are required' });
  }
  if (starts_on > ends_on) {
    return res.status(400).json({ ok: false, error: 'Start date must be before or equal to end date' });
  }

  let exerciseType: { name: string; unit_type: string } | null = null;
  if (exercise_type_id) {
    exerciseType = await getExerciseTypeById(exercise_type_id);
    if (!exerciseType) {
      return res.status(400).json({ ok: false, error: 'Invalid exercise type' });
    }
  }

  if (!exerciseType && (!task_name || typeof task_name !== 'string' || task_name.trim().length === 0)) {
    return res.status(400).json({ ok: false, error: 'Exercise type is required' });
  }

  const validTargetTypes = ['daily', 'per_day', 'total'];
  if (!target_type || !validTargetTypes.includes(target_type)) {
    return res.status(400).json({ ok: false, error: 'Target type must be daily, per_day, or total' });
  }
  
  // Normalize 'daily' to 'per_day' for consistency
  const normalizedTargetType = target_type === 'daily' ? 'per_day' : target_type;

  const numTarget = Number(target_value);
  if (!numTarget || numTarget <= 0 || numTarget > 1000000) {
    return res.status(400).json({ ok: false, error: 'Target value must be a positive number' });
  }

  let opponent: { id: string; username: string } | null = null;
  if (scope === 'duel') {
    if (!opponent_user_id) {
      return res.status(400).json({ ok: false, error: 'Opponent is required for 1v1 challenges' });
    }
    if (opponent_user_id === session.id) {
      return res.status(400).json({ ok: false, error: 'Cannot challenge yourself' });
    }

    const oppData = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, opponent_user_id))
      .limit(1);

    if (oppData.length === 0) {
      return res.status(400).json({ ok: false, error: 'Opponent not found' });
    }
    opponent = oppData[0];
  }

  const challengeStatus = scope === 'team' || scope === 'solo' ? 'active' : 'pending';
  const legName = exerciseType ? exerciseType.name : task_name?.trim() || 'Unknown';
  const legUnitType = exerciseType ? exerciseType.unit_type : 'reps';

  const challengeResult = await db
    .insert(challenges)
    .values({
      scope,
      template_key: null,
      title: title.trim(),
      description: null,
      stake_text: stake_text?.trim() || null,
      starts_on,
      ends_on,
      status: challengeStatus,
      created_by_user_id: session.id,
      team_id: team_id || null,
    })
    .returning();

  const challenge = challengeResult[0];

  if (!challenge) {
    return res.status(500).json({ ok: false, error: 'Failed to create challenge' });
  }

  const taskResult = await db
    .insert(challengeTasks)
    .values({
      challenge_id: challenge.id,
      name: legName,
      unit_type: legUnitType,
      target_type: normalizedTargetType,
      target_value: numTarget.toString(),
      sort_order: 0,
    })
    .returning({ id: challengeTasks.id });

  const task = taskResult[0];

  if (!task) {
    await db.delete(challenges).where(eq(challenges.id, challenge.id));
    return res.status(500).json({ ok: false, error: 'Failed to create challenge task' });
  }

  const participantRecords: any[] = [
    { id: randomUUID(), challenge_id: challenge.id, user_id: session.id, role: 'creator', state: 'accepted', joined_at: new Date(), created_at: new Date() },
  ];

  if (scope === 'duel' && opponent) {
    participantRecords.push({
      id: randomUUID(),
      challenge_id: challenge.id,
      user_id: opponent.id,
      role: 'invited',
      state: 'invited',
      created_at: new Date(),
    });
  }

  try {
    await db.insert(challengeParticipants).values(participantRecords);
  } catch (participantsError) {
    console.error('Error creating participants:', participantsError);
    await db.delete(challenges).where(eq(challenges.id, challenge.id));
    return res.status(500).json({ ok: false, error: 'Failed to create challenge participants' });
  }

  const participants = [{ user_id: session.id, username: session.username, role: 'creator', state: 'accepted' }];

  if (scope === 'duel' && opponent) {
    participants.push({ user_id: opponent.id, username: opponent.username, role: 'invited', state: 'invited' });
  }

  // Backfill same-day entries for solo challenges (for duel, opponent hasn't accepted yet)
  if (scope === 'solo') {
    await backfillSameDayEntries(challenge.id, task.id, legName, [session.id], starts_on);
  }

  return res.status(201).json({
    ok: true,
    challenge: {
      ...challenge,
      created_at: challenge.created_at?.toISOString(),
      participants,
    },
  });
}

async function handleCustomChallenge(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  session: { id: string; username: string },
  params: {
    scope: string;
    title: string;
    starts_on: string;
    ends_on: string;
    legs: any[];
    opponent_user_id?: string;
    stake_text?: string;
    team_id?: string | null;
  }
) {
  const { scope, title, starts_on, ends_on, legs, opponent_user_id, stake_text, team_id } = params;

  if (!scope || !['duel', 'team', 'solo'].includes(scope)) {
    return res.status(400).json({ ok: false, error: 'Scope must be duel, team, or solo' });
  }

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'Title is required' });
  }

  if (!starts_on || !ends_on) {
    return res.status(400).json({ ok: false, error: 'Start and end dates are required' });
  }

  if (!legs || !Array.isArray(legs) || legs.length === 0) {
    return res.status(400).json({ ok: false, error: 'At least one leg is required' });
  }

  // Validate all legs upfront before creating anything
  const validatedLegs: { name: string; unit_type: string; target_type: string; target_value: string }[] = [];
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    let legName = leg.task_name || leg.name || null;
    let legUnitType = 'reps';

    if (leg.exercise_type_id) {
      const exerciseType = await getExerciseTypeById(leg.exercise_type_id);
      if (exerciseType) {
        legName = exerciseType.name;
        legUnitType = exerciseType.unit_type;
      } else {
        return res.status(400).json({ ok: false, error: `Invalid exercise type for leg ${i + 1}` });
      }
    }

    if (!legName) {
      return res.status(400).json({ ok: false, error: `Leg ${i + 1} is missing exercise type or name` });
    }

    const rawTargetType = leg.target_type || 'total';
    const normalizedLegTargetType = rawTargetType === 'daily' ? 'per_day' : rawTargetType;
    validatedLegs.push({
      name: legName,
      unit_type: legUnitType,
      target_type: normalizedLegTargetType,
      target_value: leg.target_value?.toString() || '0',
    });
  }

  let opponent: { id: string; username: string } | null = null;
  if (scope === 'duel') {
    if (!opponent_user_id) {
      return res.status(400).json({ ok: false, error: 'Opponent is required for 1v1 challenges' });
    }
    if (opponent_user_id === session.id) {
      return res.status(400).json({ ok: false, error: 'Cannot challenge yourself' });
    }

    const oppData = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, opponent_user_id))
      .limit(1);

    if (oppData.length === 0) {
      return res.status(400).json({ ok: false, error: 'Opponent not found' });
    }
    opponent = oppData[0];
  }

  const challengeStatus = scope === 'team' || scope === 'solo' ? 'active' : 'pending';

  // Description field is for creator comments only (activity summary is generated dynamically from tasks)
  const { comments: customComments } = req.body;

  // Create challenge, tasks, and participants atomically
  let challenge: any = null;
  
  try {
    const challengeResult = await db
      .insert(challenges)
      .values({
        scope,
        template_key: null,
        title: title.trim(),
        description: customComments?.trim() || null,
        stake_text: stake_text?.trim() || null,
        starts_on,
        ends_on,
        status: challengeStatus,
        created_by_user_id: session.id,
        team_id: team_id || null,
      })
      .returning();

    challenge = challengeResult[0];

    if (!challenge) {
      return res.status(500).json({ ok: false, error: 'Failed to create challenge' });
    }

    // Insert all tasks in batch and get their IDs for backfilling
    const taskRecords = validatedLegs.map((leg, i) => ({
      challenge_id: challenge.id,
      name: leg.name,
      unit_type: leg.unit_type,
      target_type: leg.target_type,
      target_value: leg.target_value,
      sort_order: i,
    }));

    await db.insert(challengeTasks).values(taskRecords);

    // Insert participants
    const participantRecords: any[] = [
      { id: randomUUID(), challenge_id: challenge.id, user_id: session.id, role: 'creator', state: 'accepted', joined_at: new Date(), created_at: new Date() },
    ];

    if (scope === 'duel' && opponent) {
      participantRecords.push({
        id: randomUUID(),
        challenge_id: challenge.id,
        user_id: opponent.id,
        role: 'invited',
        state: 'invited',
        created_at: new Date(),
      });
    }

    await db.insert(challengeParticipants).values(participantRecords);
  } catch (error) {
    console.error('Error creating custom challenge:', error);
    // Clean up if challenge was created but subsequent operations failed
    if (challenge?.id) {
      try {
        await db.delete(challengeTasks).where(eq(challengeTasks.challenge_id, challenge.id));
        await db.delete(challengeParticipants).where(eq(challengeParticipants.challenge_id, challenge.id));
        await db.delete(challenges).where(eq(challenges.id, challenge.id));
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }
    }
    return res.status(500).json({ ok: false, error: 'Failed to create challenge' });
  }

  const participants = [{ user_id: session.id, username: session.username, role: 'creator', state: 'accepted' }];

  if (scope === 'duel' && opponent) {
    participants.push({ user_id: opponent.id, username: opponent.username, role: 'invited', state: 'invited' });
  }

  // Backfill same-day entries for solo challenges (for duel, opponent hasn't accepted yet)
  if (scope === 'solo' && challenge?.id) {
    // Query tasks that were just created for backfilling
    const createdTasks = await db
      .select({ id: challengeTasks.id, name: challengeTasks.name })
      .from(challengeTasks)
      .where(eq(challengeTasks.challenge_id, challenge.id));
    
    for (const task of createdTasks) {
      if (task.name) {
        await backfillSameDayEntries(challenge.id, task.id, task.name, [session.id], starts_on);
      }
    }
  }

  return res.status(201).json({
    ok: true,
    challenge: {
      ...challenge,
      created_at: challenge.created_at?.toISOString(),
      participants,
    },
  });
}

// Handle Flaps challenges (Lone Flaps, Flap Off, Team Flaps)
async function handleFlapsChallenge(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  session: { id: string; username: string },
  params: {
    scope: string;
    title: string;
    starts_on: string;
    ends_on: string;
    target_avg_heart_rate?: number;
    target_calories?: number;
    target_duration_minutes?: number;
    allowed_exercise_modes?: string[];
    opponent_user_id?: string;
    stake_text?: string;
    comments?: string;
    team_id?: string | null;
  }
) {
  const { scope, title, starts_on, ends_on, target_avg_heart_rate, target_calories, target_duration_minutes, allowed_exercise_modes, opponent_user_id, stake_text, comments, team_id } = params;

  // Validate scope
  if (!scope || !['duel', 'team', 'solo'].includes(scope)) {
    return res.status(400).json({ ok: false, error: 'Scope must be duel (Flap Off), team (Team Flaps), or solo (Lone Flaps)' });
  }

  // Validate title
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'Title is required' });
  }

  // Validate dates
  if (!starts_on || !ends_on) {
    return res.status(400).json({ ok: false, error: 'Start and end dates are required' });
  }

  // Validate at least one target is set
  const hasTarget = (target_avg_heart_rate && target_avg_heart_rate > 0) || 
                    (target_calories && target_calories > 0) || 
                    (target_duration_minutes && target_duration_minutes > 0);
  if (!hasTarget) {
    return res.status(400).json({ ok: false, error: 'At least one target (heart rate, calories, or duration) is required' });
  }

  // Determine template_key based on scope
  const template_key = scope === 'solo' ? 'lone_flaps' : scope === 'duel' ? 'flap_off' : 'team_flaps';

  // For duel (Flap Off), validate opponent
  let opponent: { id: string; username: string } | null = null;
  if (scope === 'duel') {
    if (!opponent_user_id) {
      return res.status(400).json({ ok: false, error: 'Opponent is required for Flap Off challenges' });
    }
    if (opponent_user_id === session.id) {
      return res.status(400).json({ ok: false, error: 'Cannot challenge yourself' });
    }

    const oppData = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, opponent_user_id))
      .limit(1);

    if (oppData.length === 0) {
      return res.status(400).json({ ok: false, error: 'Opponent not found' });
    }
    opponent = oppData[0];
  }

  // Create the challenge
  const challengeResult = await db
    .insert(challenges)
    .values({
      scope: scope,
      template_key: template_key,
      title: title.trim(),
      description: comments?.trim() || null,
      stake_text: stake_text || null,
      starts_on: starts_on,
      ends_on: ends_on,
      status: scope === 'solo' ? 'active' : 'pending',
      created_by_user_id: session.id,
      team_id: team_id || null,
      target_avg_heart_rate: target_avg_heart_rate || null,
      target_calories: target_calories || null,
      target_duration_minutes: target_duration_minutes || null,
      allowed_exercise_modes: allowed_exercise_modes || [],
    })
    .returning({
      id: challenges.id,
      scope: challenges.scope,
      template_key: challenges.template_key,
      title: challenges.title,
      description: challenges.description,
      starts_on: challenges.starts_on,
      ends_on: challenges.ends_on,
      status: challenges.status,
      created_by_user_id: challenges.created_by_user_id,
      target_avg_heart_rate: challenges.target_avg_heart_rate,
      target_calories: challenges.target_calories,
      target_duration_minutes: challenges.target_duration_minutes,
      allowed_exercise_modes: challenges.allowed_exercise_modes,
      created_at: challenges.created_at,
    });

  const challenge = challengeResult[0];

  if (!challenge) {
    return res.status(500).json({ ok: false, error: 'Failed to create Flaps challenge' });
  }

  // Add participants
  const participantRecords: any[] = [
    { id: randomUUID(), challenge_id: challenge.id, user_id: session.id, role: 'creator', state: 'accepted', joined_at: new Date(), created_at: new Date() },
  ];

  if (scope === 'duel' && opponent) {
    participantRecords.push({
      id: randomUUID(),
      challenge_id: challenge.id,
      user_id: opponent.id,
      role: 'invited',
      state: 'invited',
      created_at: new Date(),
    });
  }

  try {
    await db.insert(challengeParticipants).values(participantRecords);
  } catch (participantsError) {
    console.error('Error creating Flaps participants:', participantsError);
    await db.delete(challenges).where(eq(challenges.id, challenge.id));
    return res.status(500).json({ ok: false, error: 'Failed to create challenge participants' });
  }

  const participants = [{ user_id: session.id, username: session.username, role: 'creator', state: 'accepted' }];

  if (scope === 'duel' && opponent) {
    participants.push({ user_id: opponent.id, username: opponent.username, role: 'invited', state: 'invited' });
  }

  return res.status(201).json({
    ok: true,
    challenge: {
      ...challenge,
      created_at: challenge.created_at?.toISOString(),
      participants,
    },
  });
}
