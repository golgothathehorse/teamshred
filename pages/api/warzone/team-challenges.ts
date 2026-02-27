// pages/api/warzone/team-challenges.ts
// GET - Return team challenges that the current user can join

import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, users, challenges, challengeParticipants, challengeTasks, challengeEntries, userTeams, flapsLog, weights } from '../../../lib/db';
import { eq, and, inArray, gte, lte, desc, asc, or, isNull } from 'drizzle-orm';
import { getSydneyDateString } from '../../../lib/dateUtils';

type ApiResponse =
  | { ok: true; challenges: any[]; current_user_id?: string; is_admin?: boolean }
  | { ok: false; error: string };

let teamIdBackfillDone = false;

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
    if (!teamIdBackfillDone) {
    const allChallengesForBackfill = await db
      .select({ id: challenges.id, scope: challenges.scope, team_id: challenges.team_id, created_by_user_id: challenges.created_by_user_id })
      .from(challenges);

    for (const c of allChallengesForBackfill) {
      const participants = await db
        .select({ user_id: challengeParticipants.user_id })
        .from(challengeParticipants)
        .where(eq(challengeParticipants.challenge_id, c.id));

      const participantIds = participants.map(p => p.user_id);
      let correctTeamId: string | null = null;

      if (participantIds.length > 1) {
        const participantTeams = await db
          .select({ user_id: userTeams.user_id, team_id: userTeams.team_id })
          .from(userTeams)
          .where(inArray(userTeams.user_id, participantIds));

        const teamCounts = new Map<string, number>();
        for (const pt of participantTeams) {
          teamCounts.set(pt.team_id, (teamCounts.get(pt.team_id) || 0) + 1);
        }

        let bestTeam: string | null = null;
        let bestCount = 0;
        for (const [teamId, count] of teamCounts.entries()) {
          if (count > bestCount) {
            bestCount = count;
            bestTeam = teamId;
          }
        }
        correctTeamId = bestTeam;
      }

      if (!correctTeamId && c.created_by_user_id) {
        const creatorTeamRows = await db
          .select({ team_id: userTeams.team_id })
          .from(userTeams)
          .where(eq(userTeams.user_id, c.created_by_user_id));
        if (creatorTeamRows.length === 1) {
          correctTeamId = creatorTeamRows[0].team_id;
        }
      }

      if (correctTeamId && correctTeamId !== c.team_id) {
        await db.update(challenges).set({ team_id: correctTeamId }).where(eq(challenges.id, c.id));
      }
    }
    teamIdBackfillDone = true;
    }

    const today = getSydneyDateString();

    const currentUserData = await db
      .select({ active_team_id: users.active_team_id })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    const currentUser = currentUserData[0];

    if (!currentUser?.active_team_id) {
      return res.status(200).json({ ok: true, challenges: [] });
    }

    const teamMembers = await db
      .select({ user_id: userTeams.user_id })
      .from(userTeams)
      .where(eq(userTeams.team_id, currentUser.active_team_id));

    const teamUserIds = teamMembers.map((tm) => tm.user_id);

    if (teamUserIds.length === 0) {
      return res.status(200).json({ ok: true, challenges: [] });
    }

    // Include active/pending challenges AND completed challenges from last 24 hours


    const teamChallenges = await db
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
        team_id: challenges.team_id,
        created_at: challenges.created_at,
        completed_at: challenges.completed_at,
        target_weight_kg: challenges.target_weight_kg,
        target_duration_minutes: challenges.target_duration_minutes,
        target_avg_heart_rate: challenges.target_avg_heart_rate,
        target_calories: challenges.target_calories,
      })
      .from(challenges)
      .where(
        and(
          or(eq(challenges.scope, 'team'), eq(challenges.scope, 'solo'), eq(challenges.scope, 'individual')),
          or(
            eq(challenges.team_id, currentUser.active_team_id),
            and(
              or(eq(challenges.scope, 'solo'), eq(challenges.scope, 'individual')),
              inArray(challenges.created_by_user_id, teamUserIds)
            )
          ),
          or(
            and(
              or(eq(challenges.status, 'active'), eq(challenges.status, 'pending')),
              gte(challenges.ends_on, today)
            ),
            and(
              eq(challenges.status, 'completed'),
              gte(challenges.ends_on, today)
            )
          )
        )
      )
      .orderBy(desc(challenges.created_at));

    if (teamChallenges.length === 0) {
      return res.status(200).json({ ok: true, challenges: [] });
    }

    const challengeIds = teamChallenges.map((c) => c.id);

    const creatorIds = Array.from(new Set(teamChallenges.map((c) => c.created_by_user_id).filter(Boolean))) as string[];
    const creators = creatorIds.length > 0
      ? await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, creatorIds))
      : [];

    const creatorMap = new Map<string, string>();
    creators.forEach((u) => creatorMap.set(u.id, u.username));

    const allParticipants = await db
      .select({
        challenge_id: challengeParticipants.challenge_id,
        user_id: challengeParticipants.user_id,
        state: challengeParticipants.state,
        role: challengeParticipants.role,
      })
      .from(challengeParticipants)
      .where(inArray(challengeParticipants.challenge_id, challengeIds));

    const participantUserIds = Array.from(new Set(allParticipants.map((p) => p.user_id)));
    const participantUsernameMap = new Map<string, string>();

    if (participantUserIds.length > 0) {
      const participantUsers = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, participantUserIds));

      participantUsers.forEach((u) => participantUsernameMap.set(u.id, u.username));
    }

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
      .where(inArray(challengeTasks.challenge_id, challengeIds));

    const tasksByChallengeId = new Map<string, any[]>();
    tasks.forEach((t) => {
      const list = tasksByChallengeId.get(t.challenge_id) || [];
      list.push(t);
      tasksByChallengeId.set(t.challenge_id, list);
    });

    const taskIds = tasks.map((t) => t.id);
    const entriesByTask = new Map<string, any[]>();

    if (taskIds.length > 0) {
      const entries = await db
        .select({ 
          task_id: challengeEntries.task_id, 
          user_id: challengeEntries.user_id, 
          value: challengeEntries.value,
          entry_date: challengeEntries.entry_date,
        })
        .from(challengeEntries)
        .where(inArray(challengeEntries.task_id, taskIds));

      entries.forEach((e) => {
        const list = entriesByTask.get(e.task_id) || [];
        list.push(e);
        entriesByTask.set(e.task_id, list);
      });
    }

    // Fetch flaps entries for flaps challenges
    const flapsChallengeIds = teamChallenges
      .filter(c => ['lone_flaps', 'flap_off', 'team_flaps'].includes(c.template_key || ''))
      .map(c => c.id);

    const flapsEntriesByChallenge = new Map<string, any[]>();
    if (flapsChallengeIds.length > 0) {
      const allFlapsEntries = await db
        .select({
          challenge_id: flapsLog.challenge_id,
          user_id: flapsLog.user_id,
          duration_minutes: flapsLog.duration_minutes,
          avg_heart_rate: flapsLog.avg_heart_rate,
          calories_burned: flapsLog.calories_burned,
          exercise_mode: flapsLog.exercise_mode,
          entry_date: flapsLog.entry_date,
        })
        .from(flapsLog)
        .where(inArray(flapsLog.challenge_id, flapsChallengeIds));

      allFlapsEntries.forEach((e) => {
        const cid = e.challenge_id || '';
        const list = flapsEntriesByChallenge.get(cid) || [];
        list.push(e);
        flapsEntriesByChallenge.set(cid, list);
      });
    }

    const enrichedChallenges = await Promise.all(teamChallenges.map(async (challenge) => {
      const participants = allParticipants
        .filter((p) => p.challenge_id === challenge.id)
        .map((p) => ({
          user_id: p.user_id,
          username: participantUsernameMap.get(p.user_id) || 'Unknown',
          state: p.state,
          role: p.role,
        }));

      const challengeTasks = tasksByChallengeId.get(challenge.id) || [];
      const task = challengeTasks[0]; // Primary task for rep challenges
      const isRepChallenge = task && !challenge.template_key;

      let repLeaderboard: any[] | null = null;
      let totalTarget = 0;
      let totalProgress = 0;
      let taskBreakdown: any[] = [];
      let leaderData: any = null;
      let laggerData: any = null;

      if (isRepChallenge) {
        // Get active participants for this challenge
        const activeParticipantsForTasks = participants.filter(
          (p) => p.state === 'accepted' || p.state === 'latecomer'
        );
        
        // Build task breakdown with per-task progress AND per-participant breakdown
        for (const t of challengeTasks) {
          const taskTarget = Number(t.target_value) || 0;
          totalTarget += taskTarget;
          const isPerDay = t.target_type === 'per_day';
          
          const entries = entriesByTask.get(t.id) || [];
          const taskProgress = entries.reduce((sum, e) => sum + Number(e.value), 0);
          
          // Calculate today's progress for per_day challenges
          const todayEntries = entries.filter(e => e.entry_date === today);
          const todayProgress = todayEntries.reduce((sum, e) => sum + Number(e.value), 0);
          
          // Calculate per-participant progress for this task (total and today)
          const participantProgress: Record<string, number> = {};
          const participantTodayProgress: Record<string, number> = {};
          for (const entry of entries) {
            participantProgress[entry.user_id] = (participantProgress[entry.user_id] || 0) + Number(entry.value);
            if (entry.entry_date === today) {
              participantTodayProgress[entry.user_id] = (participantTodayProgress[entry.user_id] || 0) + Number(entry.value);
            }
          }
          
          // Build participants array with progress
          const taskParticipants = activeParticipantsForTasks.map(p => ({
            user_id: p.user_id,
            username: p.username,
            value: participantProgress[p.user_id] || 0,
            today_value: participantTodayProgress[p.user_id] || 0,
          })).sort((a, b) => isPerDay 
            ? b.today_value - a.today_value  // Sort by today's progress for daily targets
            : b.value - a.value              // Sort by total for total targets
          );
          
          // Calculate days in challenge for overall completion
          const startDate = challenge.starts_on ? new Date(challenge.starts_on) : null;
          const endDate = challenge.ends_on ? new Date(challenge.ends_on) : null;
          const todayDate = new Date(today);
          let daysElapsed = 1;
          let totalDays = 1;
          if (startDate && endDate) {
            totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
            daysElapsed = Math.max(1, Math.min(totalDays, Math.ceil((todayDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1));
          }
          
          // For per_day, calculate how many days met the target
          let daysMet = 0;
          if (isPerDay) {
            const entriesByDate: Record<string, number> = {};
            for (const entry of entries) {
              entriesByDate[entry.entry_date] = (entriesByDate[entry.entry_date] || 0) + Number(entry.value);
            }
            const GOAL_TOLERANCE = 0.9;
            daysMet = Object.values(entriesByDate).filter(v => v >= taskTarget * GOAL_TOLERANCE).length;
          }
          
          taskBreakdown.push({
            task_id: t.id,
            name: t.name,
            unit_type: t.unit_type,
            target_type: t.target_type || 'total',
            target: taskTarget,
            progress: taskProgress,
            today_progress: todayProgress,
            days_elapsed: daysElapsed,
            total_days: totalDays,
            days_met: daysMet,
            participants: taskParticipants,
          });
        }

        // Calculate entries and totals per user, broken down by task
        const userTaskTotals: Record<string, Record<string, number>> = {};
        const totalsMap: Record<string, number> = {};
        
        for (const t of challengeTasks) {
          const entries = entriesByTask.get(t.id) || [];
          for (const entry of entries) {
            totalsMap[entry.user_id] = (totalsMap[entry.user_id] || 0) + Number(entry.value);
            
            if (!userTaskTotals[entry.user_id]) {
              userTaskTotals[entry.user_id] = {};
            }
            userTaskTotals[entry.user_id][t.name] = (userTaskTotals[entry.user_id][t.name] || 0) + Number(entry.value);
          }
        }

        // Calculate overall progress (sum of all participants)
        totalProgress = Object.values(totalsMap).reduce((sum, v) => sum + v, 0);

        const activeParticipants = participants.filter(
          (p) => p.state === 'accepted' || p.state === 'latecomer'
        );

        // Build leaderboard with per-task breakdown
        const leaderboardWithBreakdown = activeParticipants
          .map((p) => ({
            user_id: p.user_id,
            username: p.username,
            total: totalsMap[p.user_id] || 0,
            tasks: userTaskTotals[p.user_id] || {},
          }))
          .sort((a, b) => b.total - a.total);

        repLeaderboard = leaderboardWithBreakdown.slice(0, 5);
        
        // Set leader (first) and lagger (last with >0 or just last if all same)
        if (leaderboardWithBreakdown.length > 0) {
          leaderData = leaderboardWithBreakdown[0];
          if (leaderboardWithBreakdown.length > 1) {
            laggerData = leaderboardWithBreakdown[leaderboardWithBreakdown.length - 1];
          }
        }
      }

      const currentUserParticipant = participants.find((p) => p.user_id === session.id);

      // Build flaps progress summary for flaps challenges
      let flapsProgress: any = null;
      const isFlapsChallenge = ['lone_flaps', 'flap_off', 'team_flaps'].includes(challenge.template_key || '');
      if (isFlapsChallenge) {
        const flapsEntries = flapsEntriesByChallenge.get(challenge.id) || [];
        const totalDuration = flapsEntries.reduce((sum, e) => sum + (Number(e.duration_minutes) || 0), 0);
        const totalCalories = flapsEntries.reduce((sum, e) => sum + (Number(e.calories_burned) || 0), 0);
        const hrEntries = flapsEntries.filter(e => Number(e.avg_heart_rate) > 0);
        const avgHR = hrEntries.length > 0
          ? Math.round(hrEntries.reduce((sum, e) => sum + Number(e.avg_heart_rate), 0) / hrEntries.length)
          : 0;
        const sessionCount = flapsEntries.length;

        flapsProgress = {
          total_duration: totalDuration,
          total_calories: totalCalories,
          avg_heart_rate: avgHR,
          session_count: sessionCount,
          target_duration: Number(challenge.target_duration_minutes) || 0,
          target_calories: Number(challenge.target_calories) || 0,
          target_avg_heart_rate: Number(challenge.target_avg_heart_rate) || 0,
        };
      }

      // Build Shred Off progress summary
      let shredOffProgress: any = null;
      const isShredOff = challenge.template_key && !isFlapsChallenge && !isRepChallenge;
      if (isShredOff) {
        const activeParticipants = participants.filter(
          (p) => p.state === 'accepted' || p.state === 'latecomer'
        );
        const targetLoss = challenge.target_weight_kg ? Number(challenge.target_weight_kg) : null;
        const startDate = challenge.starts_on;
        const effectiveEnd = challenge.ends_on < today ? challenge.ends_on : today;

        const participantSummaries: any[] = [];
        for (const p of activeParticipants) {
          const startWeightData = await db
            .select({ weight_kg: weights.weight_kg })
            .from(weights)
            .where(and(eq(weights.user_id, p.user_id), lte(weights.weigh_date, startDate)))
            .orderBy(desc(weights.weigh_date))
            .limit(1);

          const latestWeightData = await db
            .select({ weight_kg: weights.weight_kg })
            .from(weights)
            .where(and(eq(weights.user_id, p.user_id), gte(weights.weigh_date, startDate), lte(weights.weigh_date, effectiveEnd)))
            .orderBy(desc(weights.weigh_date))
            .limit(1);

          const startWeight = startWeightData.length > 0 ? Number(startWeightData[0].weight_kg) : null;
          const hasRecentData = latestWeightData.length > 0;
          const latestWeight = hasRecentData ? Number(latestWeightData[0].weight_kg) : null;
          const weightLost = startWeight !== null && latestWeight !== null ? Math.round((startWeight - latestWeight) * 100) / 100 : null;
          const progressPercent = targetLoss && targetLoss > 0 && weightLost !== null && weightLost > 0
            ? Math.min(100, Math.round((weightLost / targetLoss) * 100))
            : 0;

          participantSummaries.push({
            user_id: p.user_id,
            username: p.username,
            weight_lost: weightLost,
            progress_percent: progressPercent,
            has_data: hasRecentData,
          });
        }

        participantSummaries.sort((a, b) => (b.weight_lost || 0) - (a.weight_lost || 0));

        shredOffProgress = {
          target_loss: targetLoss,
          participants: participantSummaries,
        };
      }

      return {
        ...challenge,
        created_at: challenge.created_at?.toISOString(),
        creator_username: challenge.created_by_user_id ? creatorMap.get(challenge.created_by_user_id) || 'Unknown' : 'Unknown',
        participants,
        participant_count: participants.filter((p) => p.state === 'accepted' || p.state === 'latecomer').length,
        is_rep_challenge: isRepChallenge,
        rep_leaderboard: repLeaderboard,
        total_target: totalTarget,
        total_progress: totalProgress,
        task_breakdown: taskBreakdown,
        leader_data: leaderData,
        lagger_data: laggerData,
        flaps_progress: flapsProgress,
        shred_off_progress: shredOffProgress,
        current_user_participant: currentUserParticipant,
        user_has_joined: !!currentUserParticipant && ['accepted', 'latecomer'].includes(currentUserParticipant.state),
      };
    }));

    return res.status(200).json({
      ok: true,
      challenges: enrichedChallenges,
      current_user_id: session.id,
      is_admin: session.username.toLowerCase() === 'nox',
    });
  } catch (error) {
    console.error('Error in team-challenges:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
