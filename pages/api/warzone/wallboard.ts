// pages/api/warzone/wallboard.ts
// GET - Return per-user stats for Warzone wallboard

import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, users, challenges, challengeParticipants, profiles, userTeams, challengeTasks, challengeEntries } from '../../../lib/db';
import { eq, and, inArray, sql } from 'drizzle-orm';

interface UserStats {
  user_id: string;
  username: string;
  // Showdown stats (5 columns)
  showdowns_launched: number;
  showdowns_accepted: number;
  showdowns_lost: number;
  showdowns_victories: number;
  showdowns_surrendered: number;
  // Blitzkrieg stats (5 columns)
  blitzkriegs_launched: number;
  blitzkriegs_joined: number;
  blitzkriegs_failed: number;
  blitzkriegs_completed: number;
  blitzkriegs_surrendered: number;
  // Lone Wolf stats (3 columns)
  lonewolf_launched: number;
  lonewolf_failed: number;
  lonewolf_completed: number;
  // Legacy fields for compatibility
  attacks_launched: number;
  surrenders: number;
  successful_lone_wolf: number;
  showdowns_won: number;
  blitzkrieg_completed: number;
  wins: number;
  losses: number;
  share_workout_history: boolean;
}

type ApiResponse = { ok: true; stats: UserStats[] } | { ok: false; error: string };

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
    return res.status(401).json({ ok: false, error: 'Please log in to view Wallboard' });
  }

  try {
    const currentUserData = await db
      .select({ active_team_id: users.active_team_id })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    let teamUserIds: string[] = [];

    if (currentUserData[0]?.active_team_id) {
      const teamMembers = await db
        .select({ user_id: userTeams.user_id })
        .from(userTeams)
        .where(eq(userTeams.team_id, currentUserData[0].active_team_id));

      teamUserIds = teamMembers.map((tm) => tm.user_id);
    }

    if (teamUserIds.length === 0) {
      teamUserIds = [session.id];
    }

    const usersData = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, teamUserIds));

    if (!usersData || usersData.length === 0) {
      return res.status(500).json({ ok: false, error: 'Failed to fetch users' });
    }

    const profilesData = await db
      .select({ user_id: profiles.user_id, share_workout_history: profiles.share_workout_history })
      .from(profiles)
      .where(inArray(profiles.user_id, teamUserIds));

    const shareSettings: Record<string, boolean> = {};
    profilesData.forEach((p) => {
      shareSettings[p.user_id] = p.share_workout_history ?? true;
    });

    const createdChallenges = await db
      .select({ id: challenges.id, created_by_user_id: challenges.created_by_user_id, scope: challenges.scope })
      .from(challenges)
      .where(and(inArray(challenges.scope, ['duel', 'team', 'individual', 'solo']), inArray(challenges.created_by_user_id, teamUserIds)));

    const participations = await db
      .select({
        user_id: challengeParticipants.user_id,
        state: challengeParticipants.state,
        challenge_id: challengeParticipants.challenge_id,
        role: challengeParticipants.role,
      })
      .from(challengeParticipants)
      .where(inArray(challengeParticipants.user_id, teamUserIds));

    const completedDuels = await db
      .select({ id: challenges.id, winner_user_id: challenges.winner_user_id })
      .from(challenges)
      .where(and(eq(challenges.scope, 'duel'), eq(challenges.status, 'completed')));

    const statsMap: Record<string, UserStats> = {};

    for (const user of usersData) {
      statsMap[user.id] = {
        user_id: user.id,
        username: user.username,
        // Showdown stats (5 columns)
        showdowns_launched: 0,
        showdowns_accepted: 0,
        showdowns_lost: 0,
        showdowns_victories: 0,
        showdowns_surrendered: 0,
        // Blitzkrieg stats (5 columns)
        blitzkriegs_launched: 0,
        blitzkriegs_joined: 0,
        blitzkriegs_failed: 0,
        blitzkriegs_completed: 0,
        blitzkriegs_surrendered: 0,
        // Lone Wolf stats (3 columns)
        lonewolf_launched: 0,
        lonewolf_failed: 0,
        lonewolf_completed: 0,
        // Legacy fields
        attacks_launched: 0,
        surrenders: 0,
        successful_lone_wolf: 0,
        showdowns_won: 0,
        blitzkrieg_completed: 0,
        wins: 0,
        losses: 0,
        share_workout_history: shareSettings[user.id] ?? true,
      };
    }

    // Count per-type launches using scope from query
    for (const c of createdChallenges) {
      if (c.created_by_user_id && statsMap[c.created_by_user_id]) {
        statsMap[c.created_by_user_id].attacks_launched++;
        
        // Count per-type launches
        if (c.scope === 'duel') {
          statsMap[c.created_by_user_id].showdowns_launched++;
        } else if (c.scope === 'team') {
          statsMap[c.created_by_user_id].blitzkriegs_launched++;
        } else if (c.scope === 'solo' || c.scope === 'individual') {
          statsMap[c.created_by_user_id].lonewolf_launched++;
        }
      }
    }

    // Get challenge scopes for participation tracking
    const allChallengeIds = Array.from(new Set(participations.map(p => p.challenge_id)));
    const challengeScopeMap: Record<string, string> = {};
    
    if (allChallengeIds.length > 0) {
      const challengeScopes = await db
        .select({ id: challenges.id, scope: challenges.scope })
        .from(challenges)
        .where(inArray(challenges.id, allChallengeIds));
      
      for (const c of challengeScopes) {
        challengeScopeMap[c.id] = c.scope;
      }
    }

    for (const p of participations) {
      if (!statsMap[p.user_id]) continue;
      
      const scope = challengeScopeMap[p.challenge_id];
      
      // Count surrenders per type (only for duel and team, not solo)
      if (p.state === 'declined' || p.state === 'surrendered') {
        statsMap[p.user_id].surrenders++;
        if (scope === 'duel') {
          statsMap[p.user_id].showdowns_surrendered++;
        } else if (scope === 'team') {
          statsMap[p.user_id].blitzkriegs_surrendered++;
        }
      }
      
      // Count showdowns accepted (duel scope, accepted state)
      if (scope === 'duel' && (p.state === 'accepted' || p.state === 'latecomer')) {
        statsMap[p.user_id].showdowns_accepted++;
      }
      
      // Count blitzkriegs joined (team scope, accepted state)
      if (scope === 'team' && (p.state === 'accepted' || p.state === 'latecomer')) {
        statsMap[p.user_id].blitzkriegs_joined++;
      }
    }

    // Get all finished team challenges (completed or failed) for individual blitzkrieg stats
    const finishedTeamChallenges = await db
      .select({ id: challenges.id, status: challenges.status })
      .from(challenges)
      .where(and(
        eq(challenges.scope, 'team'),
        inArray(challenges.status, ['completed', 'failed'])
      ));

    const finishedTeamIds = finishedTeamChallenges.map(c => c.id);

    if (finishedTeamIds.length > 0) {
      // Get all tasks for finished team challenges
      const tasksData = await db
        .select({
          id: challengeTasks.id,
          challenge_id: challengeTasks.challenge_id,
          target_value: challengeTasks.target_value,
        })
        .from(challengeTasks)
        .where(inArray(challengeTasks.challenge_id, finishedTeamIds));

      // Get all participants for finished team challenges
      const teamParticipants = await db
        .select({ 
          user_id: challengeParticipants.user_id, 
          challenge_id: challengeParticipants.challenge_id 
        })
        .from(challengeParticipants)
        .where(
          and(
            inArray(challengeParticipants.challenge_id, finishedTeamIds),
            inArray(challengeParticipants.user_id, teamUserIds),
            inArray(challengeParticipants.state, ['accepted', 'latecomer'])
          )
        );

      // Get all entries for finished team challenges (summed per user per task)
      const taskIds = tasksData.map(t => t.id);
      let entriesByUserTask: Record<string, Record<string, number>> = {};
      
      if (taskIds.length > 0) {
        const entriesData = await db
          .select({
            user_id: challengeEntries.user_id,
            task_id: challengeEntries.task_id,
            value: challengeEntries.value,
          })
          .from(challengeEntries)
          .where(inArray(challengeEntries.task_id, taskIds));

        // Build lookup: user_id -> task_id -> total value
        for (const entry of entriesData) {
          if (!entriesByUserTask[entry.user_id]) {
            entriesByUserTask[entry.user_id] = {};
          }
          const currentVal = entriesByUserTask[entry.user_id][entry.task_id] || 0;
          entriesByUserTask[entry.user_id][entry.task_id] = currentVal + parseFloat(String(entry.value || 0));
        }
      }

      // Build lookup: challenge_id -> tasks with targets
      const tasksByChallenge: Record<string, { task_id: string; target: number }[]> = {};
      for (const task of tasksData) {
        if (!tasksByChallenge[task.challenge_id]) {
          tasksByChallenge[task.challenge_id] = [];
        }
        tasksByChallenge[task.challenge_id].push({
          task_id: task.id,
          target: parseFloat(String(task.target_value || 0)),
        });
      }

      // Evaluate each participant's individual success in each challenge
      for (const tp of teamParticipants) {
        if (!statsMap[tp.user_id]) continue;

        const challengeTasks = tasksByChallenge[tp.challenge_id] || [];
        const userEntries = entriesByUserTask[tp.user_id] || {};
        
        // Check if user met ALL task targets
        let allTargetsMet = true;
        for (const task of challengeTasks) {
          const userProgress = userEntries[task.task_id] || 0;
          if (userProgress < task.target) {
            allTargetsMet = false;
            break;
          }
        }

        if (allTargetsMet && challengeTasks.length > 0) {
          statsMap[tp.user_id].blitzkriegs_completed++;
          statsMap[tp.user_id].blitzkrieg_completed++; // Legacy field
        } else {
          statsMap[tp.user_id].blitzkriegs_failed++;
        }
      }
    }

    // Get finished solo challenges (completed or failed) for Lone Wolf stats
    const finishedSoloChallenges = await db
      .select({ id: challenges.id, created_by_user_id: challenges.created_by_user_id, status: challenges.status })
      .from(challenges)
      .where(and(
        inArray(challenges.scope, ['solo', 'individual']),
        inArray(challenges.status, ['completed', 'failed']),
        inArray(challenges.created_by_user_id, teamUserIds)
      ));

    for (const solo of finishedSoloChallenges) {
      if (solo.created_by_user_id && statsMap[solo.created_by_user_id]) {
        if (solo.status === 'completed') {
          statsMap[solo.created_by_user_id].lonewolf_completed++;
          statsMap[solo.created_by_user_id].successful_lone_wolf++; // Legacy
        } else if (solo.status === 'failed') {
          statsMap[solo.created_by_user_id].lonewolf_failed++;
        }
      }
    }

    const duelWinners: Record<string, string | null> = {};
    for (const d of completedDuels) {
      duelWinners[d.id] = d.winner_user_id;
    }

    const completedDuelIds = Object.keys(duelWinners);
    if (completedDuelIds.length > 0) {
      const duelParticipants = await db
        .select({
          user_id: challengeParticipants.user_id,
          challenge_id: challengeParticipants.challenge_id,
          state: challengeParticipants.state,
        })
        .from(challengeParticipants)
        .where(
          and(
            inArray(challengeParticipants.challenge_id, completedDuelIds),
            inArray(challengeParticipants.user_id, teamUserIds),
            inArray(challengeParticipants.state, ['accepted', 'latecomer'])
          )
        );

      for (const dp of duelParticipants) {
        if (!statsMap[dp.user_id]) continue;

        const winnerId = duelWinners[dp.challenge_id];
        if (winnerId === dp.user_id) {
          statsMap[dp.user_id].wins++;
        } else if (winnerId !== null) {
          statsMap[dp.user_id].losses++;
        }
      }
    }

    // Map legacy fields and new showdown stats
    for (const userId of Object.keys(statsMap)) {
      statsMap[userId].showdowns_won = statsMap[userId].wins;
      statsMap[userId].showdowns_victories = statsMap[userId].wins;
      statsMap[userId].showdowns_lost = statsMap[userId].losses;
    }

    const stats = Object.values(statsMap).sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.successful_lone_wolf !== a.successful_lone_wolf) return b.successful_lone_wolf - a.successful_lone_wolf;
      return a.losses - b.losses;
    });

    return res.status(200).json({ ok: true, stats });
  } catch (error) {
    console.error('Error in wallboard:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
