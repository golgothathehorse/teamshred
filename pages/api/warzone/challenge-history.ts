// pages/api/warzone/challenge-history.ts
// GET - Fetch completed/cancelled/archived challenges with results

import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, challenges, challengeParticipants, users, flapsLog, challengeEntries, challengeTasks, userTeams } from '../../../lib/db';
import { inArray, desc, ne, and, eq, or } from 'drizzle-orm';
import { getSydneyDateString } from '../../../lib/dateUtils';

type HistoryChallenge = {
  id: string;
  title: string;
  scope: string;
  template_key: string | null;
  status: string;
  starts_on: string;
  ends_on: string;
  description: string | null;
  activity_summary: string | null;
  stake_text: string | null;
  result_json: any;
  created_by_user_id: string | null;
  created_by_username: string | null;
  created_at: string | null;
  winner_user_id: string | null;
  winner_username: string | null;
  surrendered_by_user_id: string | null;
  surrendered_by_username: string | null;
  completed_at: string | null;
  participants: {
    user_id: string;
    username: string;
    role: string;
    state: string;
  }[];
  outcome: 'winner' | 'cancelled' | 'surrendered' | 'completed' | 'failed' | 'expired' | 'active' | 'pending';
};

type ApiResponse =
  | { ok: true; history: HistoryChallenge[] }
  | { ok: false; error: string };

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
    return res.status(401).json({ ok: false, error: 'Please log in to view challenge history' });
  }

  try {
    const todayStr = getSydneyDateString();

    const userData = await db.select({ active_team_id: users.active_team_id }).from(users).where(eq(users.id, session.id)).limit(1);
    const activeTeamId = userData[0]?.active_team_id;

    if (!activeTeamId) {
      return res.status(200).json({ ok: true, history: [] });
    }

    const teamMembers = await db.select({ user_id: userTeams.user_id }).from(userTeams).where(eq(userTeams.team_id, activeTeamId));
    const teamMemberIds = teamMembers.map(m => m.user_id);

    const allChallengesRaw = await db
      .select({
        id: challenges.id,
        title: challenges.title,
        scope: challenges.scope,
        template_key: challenges.template_key,
        status: challenges.status,
        starts_on: challenges.starts_on,
        ends_on: challenges.ends_on,
        description: challenges.description,
        stake_text: challenges.stake_text,
        result_json: challenges.result_json,
        created_by_user_id: challenges.created_by_user_id,
        winner_user_id: challenges.winner_user_id,
        completed_at: challenges.completed_at,
        created_at: challenges.created_at,
        target_duration_minutes: challenges.target_duration_minutes,
        target_avg_heart_rate: challenges.target_avg_heart_rate,
        target_calories: challenges.target_calories,
      })
      .from(challenges)
      .where(
        or(
          eq(challenges.team_id, activeTeamId),
          and(
            or(eq(challenges.scope, 'solo'), eq(challenges.scope, 'individual')),
            inArray(challenges.created_by_user_id, teamMemberIds.length > 0 ? teamMemberIds : ['__none__'])
          )
        )
      )
      .orderBy(desc(challenges.created_at));

    const allChallenges = allChallengesRaw.filter(c => {
      if (c.ends_on >= todayStr) {
        return false;
      }
      return true;
    });

    if (allChallenges.length === 0) {
      return res.status(200).json({ ok: true, history: [] });
    }

    const challengeIds = allChallenges.map(c => c.id);

    // Get participants for all finished challenges
    const allParticipants = await db
      .select({
        challenge_id: challengeParticipants.challenge_id,
        user_id: challengeParticipants.user_id,
        role: challengeParticipants.role,
        state: challengeParticipants.state,
      })
      .from(challengeParticipants)
      .where(inArray(challengeParticipants.challenge_id, challengeIds));

    // Get all user IDs for username lookup
    const allUserIds = new Set<string>();
    allParticipants.forEach(p => allUserIds.add(p.user_id));
    allChallenges.forEach(c => {
      if (c.winner_user_id) allUserIds.add(c.winner_user_id);
      if (c.created_by_user_id) allUserIds.add(c.created_by_user_id);
    });

    const userList = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, Array.from(allUserIds)));

    const userMap = new Map<string, string>();
    userList.forEach(u => userMap.set(u.id, u.username));

    // Group participants by challenge
    const participantsByChallenge = new Map<string, typeof allParticipants>();
    allParticipants.forEach(p => {
      const list = participantsByChallenge.get(p.challenge_id) || [];
      list.push(p);
      participantsByChallenge.set(p.challenge_id, list);
    });

    // Get challenge tasks for all challenges (for dynamic activity summary)
    const allTasks = await db
      .select({
        challenge_id: challengeTasks.challenge_id,
        name: challengeTasks.name,
        unit_type: challengeTasks.unit_type,
        target_type: challengeTasks.target_type,
        target_value: challengeTasks.target_value,
      })
      .from(challengeTasks)
      .where(inArray(challengeTasks.challenge_id, challengeIds));

    // Group tasks by challenge
    const tasksByChallenge = new Map<string, typeof allTasks>();
    allTasks.forEach(t => {
      const list = tasksByChallenge.get(t.challenge_id) || [];
      list.push(t);
      tasksByChallenge.set(t.challenge_id, list);
    });

    // Check for expired active and pending challenges and update their status
    const todaySydney = getSydneyDateString();
    const expiredActiveIds: string[] = [];
    const expiredPendingIds: string[] = [];
    const expiredChallengeMap = new Map<string, typeof allChallenges[0]>();
    
    for (const c of allChallenges) {
      if (c.status === 'active' && c.ends_on < todaySydney) {
        expiredActiveIds.push(c.id);
        expiredChallengeMap.set(c.id, c);
      } else if (c.status === 'pending' && c.ends_on < todaySydney) {
        expiredPendingIds.push(c.id);
      }
    }
    
    // Update expired pending challenges to failed (never started)
    for (const challengeId of expiredPendingIds) {
      await db
        .update(challenges)
        .set({ 
          status: 'failed', 
          completed_at: new Date(),
          result_json: { reason: 'Challenge expired while pending - never started' }
        })
        .where(eq(challenges.id, challengeId));
      
      const localChallenge = allChallenges.find(ch => ch.id === challengeId);
      if (localChallenge) {
        (localChallenge as any).status = 'failed';
        (localChallenge as any).completed_at = new Date();
      }
    }

    // For expired challenges, check if they have logged entries to determine completed vs failed
    const entriesByChallengeId = new Map<string, number>();
    
    if (expiredActiveIds.length > 0) {
      // Check for rep-based entries
      const repEntries = await db
        .select({ challenge_id: challengeEntries.challenge_id })
        .from(challengeEntries)
        .where(inArray(challengeEntries.challenge_id, expiredActiveIds));
      
      repEntries.forEach(e => {
        if (e.challenge_id) {
          entriesByChallengeId.set(e.challenge_id, (entriesByChallengeId.get(e.challenge_id) || 0) + 1);
        }
      });

      // Check for flaps entries
      const flapsEntries = await db
        .select({ challenge_id: flapsLog.challenge_id })
        .from(flapsLog)
        .where(inArray(flapsLog.challenge_id, expiredActiveIds));
      
      flapsEntries.forEach(e => {
        if (e.challenge_id) {
          entriesByChallengeId.set(e.challenge_id, (entriesByChallengeId.get(e.challenge_id) || 0) + 1);
        }
      });

      // Update expired challenges in the database
      for (const challengeId of expiredActiveIds) {
        const hasEntries = (entriesByChallengeId.get(challengeId) || 0) > 0;
        const c = expiredChallengeMap.get(challengeId);
        const isLoneWolf = c?.scope === 'solo';
        
        // For Lone Wolf with no entries → failed, otherwise completed
        const newStatus = (isLoneWolf && !hasEntries) ? 'failed' : 'completed';
        
        await db
          .update(challenges)
          .set({ 
            status: newStatus, 
            completed_at: new Date() 
          })
          .where(eq(challenges.id, challengeId));
        
        // Update the local challenge object for correct response
        const localChallenge = allChallenges.find(ch => ch.id === challengeId);
        if (localChallenge) {
          (localChallenge as any).status = newStatus;
          (localChallenge as any).completed_at = new Date();
        }
      }
    }

    // Build history response
    const history: HistoryChallenge[] = allChallenges.map(challenge => {
      const participants = (participantsByChallenge.get(challenge.id) || []).map(p => ({
        user_id: p.user_id,
        username: userMap.get(p.user_id) || 'Unknown',
        role: p.role,
        state: p.state,
      }));

      // Find surrendered user - check result_json first, then participant state
      let surrenderedByUserId: string | null = null;
      let surrenderedByUsername: string | null = null;
      
      const resultJson = challenge.result_json as { type?: string; surrendered_by?: string } | null;
      if (resultJson?.type === 'surrender' && resultJson.surrendered_by) {
        surrenderedByUserId = resultJson.surrendered_by;
        surrenderedByUsername = userMap.get(resultJson.surrendered_by) || null;
      } else {
        // Fallback: find participant with surrendered state
        const surrenderer = participants.find(p => p.state === 'surrendered');
        if (surrenderer) {
          surrenderedByUserId = surrenderer.user_id;
          surrenderedByUsername = surrenderer.username;
        }
      }

      // Determine outcome based on status
      let outcome: HistoryChallenge['outcome'] = 'completed';
      
      if (challenge.status === 'active') {
        outcome = 'active';
      } else if (challenge.status === 'pending') {
        outcome = 'pending';
      } else if (surrenderedByUserId) {
        // Someone surrendered - this takes priority
        outcome = 'surrendered';
      } else if (challenge.status === 'cancelled') {
        outcome = 'cancelled';
      } else if (challenge.status === 'failed') {
        // Lone Wolf with no activity logged
        outcome = 'failed';
      } else if (challenge.winner_user_id) {
        outcome = 'winner';
      } else if (challenge.status === 'completed' || challenge.status === 'archived') {
        outcome = 'completed';
      } else {
        outcome = 'expired';
      }

      // Generate dynamic activity summary from challenge tasks (separate from description/comments)
      let activitySummary: string | null = null;
      const tasks = tasksByChallenge.get(challenge.id) || [];
      const isFlapsChallenge = challenge.template_key ? ['lone_flaps', 'flap_off', 'team_flaps'].includes(challenge.template_key) : false;
      
      if (tasks.length > 0) {
        const taskSummaries = tasks.map(task => {
          const target = task.target_value ? Number(task.target_value) : 0;
          const targetType = task.target_type || 'total';
          const targetLabel = targetType === 'per_day' ? 'per day' : 'total';
          return `${target} ${task.name} ${targetLabel}`;
        });
        activitySummary = taskSummaries.join(', ');
      } else if (isFlapsChallenge) {
        // For Flaps challenges, generate summary from target fields
        const targets: string[] = [];
        if (challenge.target_duration_minutes) {
          targets.push(`${Number(challenge.target_duration_minutes)} min Duration`);
        }
        if (challenge.target_avg_heart_rate) {
          targets.push(`${Number(challenge.target_avg_heart_rate)} bpm Avg HR`);
        }
        if (challenge.target_calories) {
          targets.push(`${Number(challenge.target_calories)} cal`);
        }
        if (targets.length > 0) {
          activitySummary = targets.join(', ');
        }
      }

      return {
        id: challenge.id,
        title: challenge.title,
        scope: challenge.scope,
        template_key: challenge.template_key,
        status: challenge.status,
        starts_on: challenge.starts_on,
        ends_on: challenge.ends_on,
        description: challenge.description,
        activity_summary: activitySummary,
        stake_text: challenge.stake_text,
        result_json: challenge.result_json,
        created_by_user_id: challenge.created_by_user_id,
        created_by_username: challenge.created_by_user_id ? (userMap.get(challenge.created_by_user_id) || null) : null,
        created_at: challenge.created_at?.toISOString() || null,
        winner_user_id: challenge.winner_user_id,
        winner_username: challenge.winner_user_id ? (userMap.get(challenge.winner_user_id) || null) : null,
        surrendered_by_user_id: surrenderedByUserId,
        surrendered_by_username: surrenderedByUsername,
        completed_at: challenge.completed_at?.toISOString() || null,
        participants,
        outcome,
      };
    });

    return res.status(200).json({ ok: true, history });
  } catch (error) {
    console.error('Error fetching challenge history:', error);
    return res.status(500).json({ ok: false, error: 'Failed to fetch challenge history' });
  }
}
