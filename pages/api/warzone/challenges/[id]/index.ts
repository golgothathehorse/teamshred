// pages/api/warzone/challenges/[id]/index.ts
// GET - Get challenge details with auto-complete if end date passed
// DELETE - Delete a challenge (admin only)

import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../../../lib/auth';
import { db, users, challenges, challengeParticipants, challengeTasks, challengeEntries, userTeams, flapsLog, activityLog, exerciseTypes, weights, bodyFatLogs, waistLogs } from '../../../../../lib/db';
import { eq, and, inArray, ne, sql, desc, gte, asc, lte } from 'drizzle-orm';
import { calculateChallengeResult } from '../../../../../lib/warzone/statusEngine';
import { getSydneyDateString } from '../../../../../lib/dateUtils';

type ApiResponse =
  | { ok: true; challenge?: any; message?: string }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method === 'DELETE') {
    return handleDelete(req, res);
  }

  if (req.method === 'PATCH') {
    return handlePatch(req, res);
  }

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
    return res.status(401).json({ ok: false, error: 'Please log in to use Warzone' });
  }

  const { id: challengeId } = req.query;

  if (!challengeId || typeof challengeId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Challenge ID is required' });
  }

  try {
    const challengeData = await db.select().from(challenges).where(eq(challenges.id, challengeId)).limit(1);
    const challenge = challengeData[0];

    if (!challenge) {
      return res.status(404).json({ ok: false, error: 'Challenge not found' });
    }

    const participants = await db
      .select({
        id: challengeParticipants.id,
        user_id: challengeParticipants.user_id,
        role: challengeParticipants.role,
        state: challengeParticipants.state,
        joined_at: challengeParticipants.joined_at,
      })
      .from(challengeParticipants)
      .where(eq(challengeParticipants.challenge_id, challengeId));

    const participantUserIds = participants.map((p) => p.user_id);
    const usersData = participantUserIds.length > 0
      ? await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, participantUserIds))
      : [];

    const userMap = new Map<string, string>();
    usersData.forEach((u) => userMap.set(u.id, u.username));

    const isParticipant = participants.some((p) => p.user_id === session.id);

    let hasAccess = isParticipant;
    if (!hasAccess && (challenge.scope === 'solo' || challenge.scope === 'team')) {
      const currentUserData = await db
        .select({ active_team_id: users.active_team_id })
        .from(users)
        .where(eq(users.id, session.id))
        .limit(1);

      const currentUser = currentUserData[0];

      if (currentUser?.active_team_id) {
        const teamMembers = await db
          .select({ user_id: userTeams.user_id })
          .from(userTeams)
          .where(eq(userTeams.team_id, currentUser.active_team_id));

        const teamUserIds = teamMembers.map((tm) => tm.user_id);
        if (challenge.created_by_user_id && teamUserIds.includes(challenge.created_by_user_id)) {
          hasAccess = true;
        }
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ ok: false, error: 'You are not a participant in this challenge' });
    }

    const formattedParticipants = participants.map((p) => ({
      id: p.id,
      user_id: p.user_id,
      username: userMap.get(p.user_id) || 'Unknown',
      role: p.role,
      state: p.state,
    }));

    const allRepTasks = await db
      .select({
        id: challengeTasks.id,
        name: challengeTasks.name,
        unit_type: challengeTasks.unit_type,
        target_type: challengeTasks.target_type,
        target_value: challengeTasks.target_value,
      })
      .from(challengeTasks)
      .where(eq(challengeTasks.challenge_id, challengeId));

    const repTask = allRepTasks[0] || null;
    const isRepChallenge = repTask && !challenge.template_key;

    const today = getSydneyDateString();
    const challengeStartDate = new Date(challenge.starts_on);
    const challengeEndDate = new Date(challenge.ends_on);
    const totalDays = Math.max(1, Math.ceil((challengeEndDate.getTime() - challengeStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const shouldAutoComplete =
      challenge.status === 'active' && !challenge.completed_at && challenge.ends_on < today;
    
    // Also check for expired pending challenges - mark as failed
    const shouldMarkFailed =
      challenge.status === 'pending' && !challenge.completed_at && challenge.ends_on < today;

    let resultData = challenge.result_json;
    let repLeaderboard: any[] | null = null;
    let repTasksProgress: any[] | null = null;

    let dailyTimeline: any[] = [];
    
    // Progress insights - initialized outside to be accessible in response
    let progressInsights: {
      days_remaining: number;
      days_elapsed: number;
      total_days: number;
      pace_indicator: 'ahead' | 'on_track' | 'behind';
      daily_average: number;
      best_day: { date: string; total: number } | null;
      current_streak: number;
      longest_streak: number;
      overall_percent: number;
      milestones: { quarter: boolean; half: boolean; threeQuarter: boolean; complete: boolean };
      active_days: number;
    } | null = null;
    
    // All participants insights - new structure for showing everyone's stats
    let allParticipantInsights: {
      user_id: string;
      username: string;
      pace_indicator: 'ahead' | 'on_track' | 'behind';
      current_streak: number;
      longest_streak: number;
      overall_percent: number;
      milestones: { quarter: boolean; half: boolean; threeQuarter: boolean; complete: boolean };
      active_days: number;
      by_exercise: {
        exercise_name: string;
        unit_type: string;
        daily_average: number;
        best_day: { date: string; total: number } | null;
        total: number;
        target: number;
        is_leading: boolean;
        goal_percent: number;
      }[];
    }[] = [];
    
    if (isRepChallenge && allRepTasks.length > 0) {
      const taskIds = allRepTasks.map((t) => t.id);
      const allEntries = await db
        .select({
          task_id: challengeEntries.task_id,
          user_id: challengeEntries.user_id,
          value: challengeEntries.value,
          entry_date: challengeEntries.entry_date,
        })
        .from(challengeEntries)
        .where(inArray(challengeEntries.task_id, taskIds));

      const totalsPerTask: Record<string, Record<string, number>> = {};
      const todayStr = getSydneyDateString();
      const todayTotalsPerTask: Record<string, Record<string, number>> = {};
      for (const entry of allEntries) {
        if (!totalsPerTask[entry.task_id]) {
          totalsPerTask[entry.task_id] = {};
        }
        const val = Number(entry.value) || 0;
        totalsPerTask[entry.task_id][entry.user_id] = (totalsPerTask[entry.task_id][entry.user_id] || 0) + val;
        if (entry.entry_date === todayStr) {
          if (!todayTotalsPerTask[entry.task_id]) {
            todayTotalsPerTask[entry.task_id] = {};
          }
          todayTotalsPerTask[entry.task_id][entry.user_id] = (todayTotalsPerTask[entry.task_id][entry.user_id] || 0) + val;
        }
      }

      const activeParticipants = formattedParticipants.filter(
        (p) => p.state === 'accepted' || p.state === 'latecomer'
      );

      repTasksProgress = allRepTasks.map((task) => {
        const taskTotals = totalsPerTask[task.id] || {};
        const todayTotals = todayTotalsPerTask[task.id] || {};
        const rawTarget = task.target_value ? Number(task.target_value) : null;
        const effectiveTarget = (rawTarget && task.target_type === 'per_day' && totalDays > 0)
          ? rawTarget * totalDays
          : rawTarget;
        const leaderboard = activeParticipants
          .map((p) => ({
            user_id: p.user_id,
            username: p.username,
            total: taskTotals[p.user_id] || 0,
            today_total: todayTotals[p.user_id] || 0,
          }))
          .sort((a, b) => b.total - a.total);

        return {
          task_id: task.id,
          task_name: task.name,
          unit_type: task.unit_type || 'reps',
          target_type: task.target_type,
          target_value: rawTarget,
          effective_target: effectiveTarget,
          leaderboard,
        };
      });

      const firstTaskTotals = totalsPerTask[repTask.id] || {};
      repLeaderboard = activeParticipants
        .map((p) => ({
          user_id: p.user_id,
          username: p.username,
          total: firstTaskTotals[p.user_id] || 0,
        }))
        .sort((a, b) => b.total - a.total);

      // Build daily timeline - group entries by date
      const taskNameMap = new Map(allRepTasks.map(t => [t.id, t.name]));
      const taskUnitMap = new Map(allRepTasks.map(t => [t.id, t.unit_type || 'reps']));
      const usernameMap = new Map(activeParticipants.map(p => [p.user_id, p.username]));
      
      const entriesByDate: Record<string, { user_id: string; username: string; task_name: string; unit_type: string; value: number }[]> = {};
      for (const entry of allEntries) {
        const dateKey = entry.entry_date;
        if (!entriesByDate[dateKey]) {
          entriesByDate[dateKey] = [];
        }
        entriesByDate[dateKey].push({
          user_id: entry.user_id,
          username: usernameMap.get(entry.user_id) || 'Unknown',
          task_name: taskNameMap.get(entry.task_id) || 'Unknown',
          unit_type: taskUnitMap.get(entry.task_id) || 'reps',
          value: Number(entry.value) || 0,
        });
      }
      
      // Sort dates descending (most recent first)
      dailyTimeline = Object.entries(entriesByDate)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, entries]) => ({ date, entries }));

      // Calculate Progress Insights - use current user if participant, otherwise fallback to creator/first participant
      const insightUserId = isParticipant ? session.id
        : (challenge.created_by_user_id || activeParticipants[0]?.user_id || session.id);
      const userEntries = allEntries.filter(e => e.user_id === insightUserId);
      
      // Group user entries by date for streak and daily calculations
      const userEntriesByDate: Record<string, number> = {};
      for (const entry of userEntries) {
        const dateKey = entry.entry_date;
        userEntriesByDate[dateKey] = (userEntriesByDate[dateKey] || 0) + (Number(entry.value) || 0);
      }
      
      // Days calculations
      const startDate = new Date(challenge.starts_on);
      const endDate = new Date(challenge.ends_on);
      const todayDate = new Date(today);
      const daysElapsed = Math.max(0, Math.ceil((todayDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)));
      
      // Calculate user's total progress
      const userTotalProgress = Object.values(userEntriesByDate).reduce((sum, v) => sum + v, 0);
      
      // Daily average (only count days with activity)
      const activeDays = Object.keys(userEntriesByDate).length;
      const dailyAverage = activeDays > 0 ? Math.round((userTotalProgress / activeDays) * 10) / 10 : 0;
      
      // Best day
      const dailyTotals = Object.entries(userEntriesByDate).map(([date, total]) => ({ date, total }));
      const bestDay = dailyTotals.length > 0 
        ? dailyTotals.reduce((best, curr) => curr.total > best.total ? curr : best)
        : null;
      
      // Streak calculations
      const sortedDates = Object.keys(userEntriesByDate).sort();
      let currentStreak = 0;
      let longestStreak = 0;
      let tempStreak = 0;
      
      // Check for streaks
      for (let i = 0; i < sortedDates.length; i++) {
        if (i === 0) {
          tempStreak = 1;
        } else {
          const prevDate = new Date(sortedDates[i - 1]);
          const currDate = new Date(sortedDates[i]);
          const dayDiff = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (dayDiff === 1) {
            tempStreak++;
          } else {
            longestStreak = Math.max(longestStreak, tempStreak);
            tempStreak = 1;
          }
        }
        longestStreak = Math.max(longestStreak, tempStreak);
      }
      
      // Current streak - must include today or yesterday
      if (sortedDates.length > 0) {
        const lastActivityDate = sortedDates[sortedDates.length - 1];
        const lastDate = new Date(lastActivityDate);
        const daysSinceLastActivity = Math.round((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysSinceLastActivity <= 1) {
          // Count backwards from last activity
          currentStreak = 1;
          for (let i = sortedDates.length - 2; i >= 0; i--) {
            const prevDate = new Date(sortedDates[i]);
            const currDate = new Date(sortedDates[i + 1]);
            const dayDiff = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
            if (dayDiff === 1) {
              currentStreak++;
            } else {
              break;
            }
          }
        }
      }
      
      // Calculate overall target and progress for pace calculation
      let totalTarget = 0;
      let currentProgress = 0;
      for (const task of repTasksProgress || []) {
        const target = task.target_value || 0;
        // Adjust target for per_day challenges
        const effectiveTarget = task.target_type === 'per_day' ? target * totalDays : target;
        totalTarget += effectiveTarget;
        
        const userEntry = task.leaderboard.find((e: any) => e.user_id === insightUserId);
        currentProgress += userEntry?.total || 0;
      }
      
      // Pace calculation
      const expectedProgress = totalDays > 0 ? Math.round((totalTarget / totalDays) * daysElapsed) : 0;
      let paceIndicator: 'ahead' | 'on_track' | 'behind' = 'on_track';
      if (currentProgress > expectedProgress * 1.1) {
        paceIndicator = 'ahead';
      } else if (currentProgress < expectedProgress * 0.9) {
        paceIndicator = 'behind';
      }
      
      // Milestone calculations
      const overallPercent = totalTarget > 0 ? Math.round((currentProgress / totalTarget) * 100) : 0;
      const milestones = {
        quarter: overallPercent >= 25,
        half: overallPercent >= 50,
        threeQuarter: overallPercent >= 75,
        complete: overallPercent >= 100,
      };
      
      // Assign progress insights (for current user - kept for backwards compatibility)
      progressInsights = {
        days_remaining: daysRemaining,
        days_elapsed: daysElapsed,
        total_days: totalDays,
        pace_indicator: paceIndicator,
        daily_average: dailyAverage,
        best_day: bestDay,
        current_streak: currentStreak,
        longest_streak: longestStreak,
        overall_percent: overallPercent,
        milestones,
        active_days: activeDays,
      };
      
      // Calculate insights for ALL participants with per-exercise breakdowns
      for (const participant of activeParticipants) {
        const pEntries = allEntries.filter(e => e.user_id === participant.user_id);
        
        // Group entries by date for overall stats
        const pEntriesByDate: Record<string, number> = {};
        for (const entry of pEntries) {
          pEntriesByDate[entry.entry_date] = (pEntriesByDate[entry.entry_date] || 0) + (Number(entry.value) || 0);
        }
        
        // Group entries by date AND task for per-exercise stats
        const pEntriesByTaskAndDate: Record<string, Record<string, number>> = {};
        for (const entry of pEntries) {
          if (!pEntriesByTaskAndDate[entry.task_id]) {
            pEntriesByTaskAndDate[entry.task_id] = {};
          }
          pEntriesByTaskAndDate[entry.task_id][entry.entry_date] = 
            (pEntriesByTaskAndDate[entry.task_id][entry.entry_date] || 0) + (Number(entry.value) || 0);
        }
        
        // Active days for this participant
        const pActiveDays = Object.keys(pEntriesByDate).length;
        
        // Streak calculations
        const pSortedDates = Object.keys(pEntriesByDate).sort();
        let pCurrentStreak = 0;
        let pLongestStreak = 0;
        let pTempStreak = 0;
        
        for (let i = 0; i < pSortedDates.length; i++) {
          if (i === 0) {
            pTempStreak = 1;
          } else {
            const prevDate = new Date(pSortedDates[i - 1]);
            const currDate = new Date(pSortedDates[i]);
            const dayDiff = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (dayDiff === 1) {
              pTempStreak++;
            } else {
              pLongestStreak = Math.max(pLongestStreak, pTempStreak);
              pTempStreak = 1;
            }
          }
          pLongestStreak = Math.max(pLongestStreak, pTempStreak);
        }
        
        // Current streak - must include today or yesterday
        if (pSortedDates.length > 0) {
          const lastActivityDate = pSortedDates[pSortedDates.length - 1];
          const lastDate = new Date(lastActivityDate);
          const daysSinceLastActivity = Math.round((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysSinceLastActivity <= 1) {
            pCurrentStreak = 1;
            for (let i = pSortedDates.length - 2; i >= 0; i--) {
              const prevDate = new Date(pSortedDates[i]);
              const currDate = new Date(pSortedDates[i + 1]);
              const dayDiff = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
              if (dayDiff === 1) {
                pCurrentStreak++;
              } else {
                break;
              }
            }
          }
        }
        
        // Per-exercise breakdown
        const byExercise: {
          exercise_name: string;
          unit_type: string;
          daily_average: number;
          best_day: { date: string; total: number } | null;
          total: number;
          target: number;
          is_leading: boolean;
          goal_percent: number;
        }[] = [];
        
        let pTotalTarget = 0;
        let pCurrentProgress = 0;
        
        for (const task of allRepTasks) {
          const taskEntries = pEntriesByTaskAndDate[task.id] || {};
          const taskActiveDays = Object.keys(taskEntries).length;
          const taskTotal = Object.values(taskEntries).reduce((sum, v) => sum + v, 0);
          
          // Daily average for this exercise
          const taskDailyAvg = taskActiveDays > 0 ? Math.round((taskTotal / taskActiveDays) * 10) / 10 : 0;
          
          // Best day for this exercise
          const taskDailyTotals = Object.entries(taskEntries).map(([date, total]) => ({ date, total }));
          const taskBestDay = taskDailyTotals.length > 0 
            ? taskDailyTotals.reduce((best, curr) => curr.total > best.total ? curr : best)
            : null;
          
          // Target calculation
          const target = Number(task.target_value) || 0;
          const effectiveTarget = task.target_type === 'per_day' ? target * totalDays : target;
          
          // Check if this participant is leading for this task
          const taskProgress = repTasksProgress?.find((tp: any) => tp.task_id === task.id);
          const isLeadingForTask = taskProgress?.leaderboard?.[0]?.user_id === participant.user_id && taskTotal > 0;
          const goalPercent = effectiveTarget > 0 ? Math.round((taskTotal / effectiveTarget) * 100) : 0;
          
          byExercise.push({
            exercise_name: task.name,
            unit_type: task.unit_type || 'reps',
            daily_average: taskDailyAvg,
            best_day: taskBestDay,
            total: taskTotal,
            target: effectiveTarget,
            is_leading: isLeadingForTask,
            goal_percent: goalPercent,
          });
          
          pTotalTarget += effectiveTarget;
          pCurrentProgress += taskTotal;
        }
        
        // Pace calculation for this participant
        const pExpectedProgress = totalDays > 0 ? Math.round((pTotalTarget / totalDays) * daysElapsed) : 0;
        let pPaceIndicator: 'ahead' | 'on_track' | 'behind' = 'on_track';
        if (pCurrentProgress > pExpectedProgress * 1.1) {
          pPaceIndicator = 'ahead';
        } else if (pCurrentProgress < pExpectedProgress * 0.9) {
          pPaceIndicator = 'behind';
        }
        
        // Milestones for this participant
        const pOverallPercent = pTotalTarget > 0 ? Math.round((pCurrentProgress / pTotalTarget) * 100) : 0;
        const pMilestones = {
          quarter: pOverallPercent >= 25,
          half: pOverallPercent >= 50,
          threeQuarter: pOverallPercent >= 75,
          complete: pOverallPercent >= 100,
        };
        
        allParticipantInsights.push({
          user_id: participant.user_id,
          username: participant.username,
          pace_indicator: pPaceIndicator,
          current_streak: pCurrentStreak,
          longest_streak: pLongestStreak,
          overall_percent: pOverallPercent,
          milestones: pMilestones,
          active_days: pActiveDays,
          by_exercise: byExercise,
        });
      }
      
      // Records & Challenge Stats - compute per-user best day per exercise and challenge stats
      try {
        const exerciseNames = allRepTasks.map(t => t.name);
        const participantUserIds = activeParticipants.map(p => p.user_id);
        
        if (participantUserIds.length > 0 && exerciseNames.length > 0) {
          // 1. Get historical best day per user per exercise from past challenges
          const pastChallengeData = await db
            .select({ challenge_id: challenges.id })
            .from(challenges)
            .innerJoin(challengeParticipants, eq(challengeParticipants.challenge_id, challenges.id))
            .where(
              and(
                inArray(challengeParticipants.user_id, participantUserIds),
                eq(challenges.status, 'completed'),
                ne(challenges.id, challengeId)
              )
            );
          
          const pastChallengeIds = Array.from(new Set(pastChallengeData.map(pc => pc.challenge_id)));
          
          // Historical best day per user per exercise
          type HistBests = Record<string, Record<string, number>>;
          const historicalBestDay: HistBests = {};
          for (const uid of participantUserIds) {
            historicalBestDay[uid] = {};
            for (const name of exerciseNames) {
              historicalBestDay[uid][name] = 0;
            }
          }
          
          if (pastChallengeIds.length > 0) {
            const pastTasks = await db
              .select({ task_id: challengeTasks.id, task_name: challengeTasks.name, challenge_id: challengeTasks.challenge_id })
              .from(challengeTasks)
              .where(and(inArray(challengeTasks.challenge_id, pastChallengeIds), inArray(challengeTasks.name, exerciseNames)));
            
            const pastTaskIds = pastTasks.map(pt => pt.task_id);
            if (pastTaskIds.length > 0) {
              const pastEntries = await db
                .select({ task_id: challengeEntries.task_id, user_id: challengeEntries.user_id, entry_date: challengeEntries.entry_date, value: challengeEntries.value })
                .from(challengeEntries)
                .where(and(inArray(challengeEntries.task_id, pastTaskIds), inArray(challengeEntries.user_id, participantUserIds)));
              
              // Build task_id -> name map for fast lookup
              const taskIdToName = new Map(pastTasks.map(pt => [pt.task_id, pt.task_name]));
              
              // Group by user -> exercise -> date and find best day
              const pastDayTotals: Record<string, Record<string, Record<string, number>>> = {};
              for (const entry of pastEntries) {
                const eName = taskIdToName.get(entry.task_id);
                if (!eName) continue;
                const uid = entry.user_id;
                if (!pastDayTotals[uid]) pastDayTotals[uid] = {};
                if (!pastDayTotals[uid][eName]) pastDayTotals[uid][eName] = {};
                pastDayTotals[uid][eName][entry.entry_date] = (pastDayTotals[uid][eName][entry.entry_date] || 0) + (Number(entry.value) || 0);
              }
              
              for (const uid of participantUserIds) {
                for (const eName of exerciseNames) {
                  const dates = pastDayTotals[uid]?.[eName] || {};
                  const maxDay = Math.max(...Object.values(dates), 0);
                  if (maxDay > historicalBestDay[uid][eName]) {
                    historicalBestDay[uid][eName] = maxDay;
                  }
                }
              }
            }
          }
          
          // 2. Also check activity_log for historical daily bests
          const exerciseTypeRows = await db
            .select({ id: exerciseTypes.id, name: exerciseTypes.name })
            .from(exerciseTypes)
            .where(inArray(exerciseTypes.name, exerciseNames));
          
          const exerciseIdToName = new Map(exerciseTypeRows.map(e => [e.id, e.name]));
          const exerciseTypeIdsForLog = exerciseTypeRows.map(e => e.id);
          
          if (exerciseTypeIdsForLog.length > 0) {
            const activityEntries = await db
              .select({ user_id: activityLog.user_id, exercise_type_id: activityLog.exercise_type_id, entry_date: activityLog.entry_date, value: activityLog.value })
              .from(activityLog)
              .where(and(inArray(activityLog.user_id, participantUserIds), inArray(activityLog.exercise_type_id, exerciseTypeIdsForLog)));
            
            const actDayTotals: Record<string, Record<string, Record<string, number>>> = {};
            for (const entry of activityEntries) {
              const eName = exerciseIdToName.get(entry.exercise_type_id);
              if (!eName) continue;
              const uid = entry.user_id;
              if (!actDayTotals[uid]) actDayTotals[uid] = {};
              if (!actDayTotals[uid][eName]) actDayTotals[uid][eName] = {};
              actDayTotals[uid][eName][entry.entry_date] = (actDayTotals[uid][eName][entry.entry_date] || 0) + (Number(entry.value) || 0);
            }
            
            for (const uid of participantUserIds) {
              for (const eName of exerciseNames) {
                const dates = actDayTotals[uid]?.[eName] || {};
                const maxDay = Math.max(...Object.values(dates), 0);
                if (maxDay > historicalBestDay[uid][eName]) {
                  historicalBestDay[uid][eName] = maxDay;
                }
              }
            }
          }
          
          // 3. Build new records: only entries where current best day > historical best
          type NewRecord = {
            user_id: string;
            username: string;
            exercise: string;
            value: number;
            previous_best: number;
            best_day_date: string | null;
          };
          const newRecords: NewRecord[] = [];
          
          // 4. Collect all best days across users for top 3
          type BiggestDayEntry = { username: string; exercise: string; total: number; date: string };
          const allBigDays: BiggestDayEntry[] = [];
          
          // 5. Build pace tracker per user: needed_per_day to finish by end date
          type PaceEntry = {
            user_id: string;
            username: string;
            daily_avg: number;
            needed_per_day: number;
            remaining: number;
            target_total: number;
            status: 'ahead' | 'on_track' | 'behind' | 'done';
          };
          const paceTracker: PaceEntry[] = [];
          
          const daysRemaining = progressInsights ? (progressInsights as any).days_remaining || 0 : 0;
          
          for (const participant of activeParticipants) {
            const pInsight = allParticipantInsights.find(p => p.user_id === participant.user_id);
            if (!pInsight) continue;
            
            let userTotalReps = 0;
            let userTargetTotal = 0;
            
            for (const exerciseData of pInsight.by_exercise || []) {
              const eName = exerciseData.exercise_name;
              const currentBestDay = exerciseData.best_day?.total || 0;
              const currentBestDayDate = exerciseData.best_day?.date || null;
              const histBest = historicalBestDay[participant.user_id]?.[eName] || 0;
              
              userTotalReps += exerciseData.total || 0;
              userTargetTotal += exerciseData.target || 0;
              
              if (currentBestDay > histBest && histBest > 0) {
                newRecords.push({
                  user_id: participant.user_id,
                  username: participant.username,
                  exercise: eName,
                  value: currentBestDay,
                  previous_best: histBest,
                  best_day_date: currentBestDayDate,
                });
              }
              
              if (currentBestDay > 0) {
                allBigDays.push({
                  username: participant.username,
                  exercise: eName,
                  total: currentBestDay,
                  date: currentBestDayDate || '',
                });
              }
            }
            
            const activeDays = pInsight.active_days || 0;
            const dailyAvg = activeDays > 0 ? userTotalReps / activeDays : 0;
            const remaining = Math.max(0, userTargetTotal - userTotalReps);
            const neededPerDay = daysRemaining > 0 ? remaining / daysRemaining : 0;
            
            let status: 'ahead' | 'on_track' | 'behind' | 'done' = 'on_track';
            if (userTargetTotal > 0) {
              if (remaining <= 0) {
                status = 'done';
              } else if (neededPerDay <= dailyAvg * 0.9) {
                status = 'ahead';
              } else if (neededPerDay <= dailyAvg * 1.15) {
                status = 'on_track';
              } else {
                status = 'behind';
              }
            }
            
            paceTracker.push({
              user_id: participant.user_id,
              username: participant.username,
              daily_avg: Math.round(dailyAvg),
              needed_per_day: Math.round(neededPerDay),
              remaining: Math.round(remaining),
              target_total: userTargetTotal,
              status,
            });
          }
          
          paceTracker.sort((a, b) => {
            const statusOrder = { done: 0, ahead: 1, on_track: 2, behind: 3 };
            return (statusOrder[a.status] || 2) - (statusOrder[b.status] || 2);
          });
          
          allBigDays.sort((a, b) => b.total - a.total);
          const biggestDays = allBigDays.slice(0, 3);
          
          if (progressInsights) {
            (progressInsights as any).new_records = newRecords;
            (progressInsights as any).biggest_days = biggestDays;
            (progressInsights as any).pace_tracker = paceTracker;
            (progressInsights as any).past_challenges_count = pastChallengeIds.length;
          }
        }
      } catch (prError) {
        console.error('Error calculating records:', prError);
      }
      
      // Daily Leader Changes - for Showdown and Team Blitzkrieg (rep-based only, not Flaps)
      if ((challenge.scope === 'duel' || challenge.scope === 'team') && isRepChallenge) {
        try {
          // Build cumulative totals per participant per day
          const cumulativeByDay: Record<string, Record<string, number>> = {};
          const sortedEntryDates = Array.from(new Set(allEntries.map(e => e.entry_date))).sort();
          
          // Initialize cumulative totals
          const runningTotals: Record<string, number> = {};
          for (const participant of formattedParticipants) {
            if (participant.state === 'accepted' || participant.state === 'latecomer') {
              runningTotals[participant.user_id] = 0;
            }
          }
          
          // Calculate cumulative totals for each day
          for (const date of sortedEntryDates) {
            const dayEntries = allEntries.filter(e => e.entry_date === date);
            for (const entry of dayEntries) {
              if (runningTotals[entry.user_id] !== undefined) {
                runningTotals[entry.user_id] += Number(entry.value) || 0;
              }
            }
            cumulativeByDay[date] = { ...runningTotals };
          }
          
          // Build leader changes timeline
          // Calculate total target for overall percentage
          const totalTarget = (repTasksProgress || []).reduce((sum: number, task: any) => {
            const targetVal = task.target_value || 0;
            const targetType = task.target_type || 'total';
            if (targetType === 'per_day') {
              return sum + (targetVal * totalDays);
            }
            return sum + targetVal;
          }, 0);
          
          const leaderChanges: { date: string; leader_id: string; leader_username: string; total: number; percent: number }[] = [];
          let previousLeader: string | null = null;
          
          for (const date of sortedEntryDates) {
            const dayTotals = cumulativeByDay[date];
            const participants = Object.entries(dayTotals).map(([userId, total]) => ({
              user_id: userId,
              username: userMap.get(userId) || 'Unknown',
              total,
            }));
            
            const sorted = participants.sort((a, b) => b.total - a.total);
            const leader = sorted[0];
            
            if (leader && leader.total > 0 && leader.user_id !== previousLeader) {
              const percent = totalTarget > 0 ? Math.round((leader.total / totalTarget) * 100) : 0;
              leaderChanges.push({
                date,
                leader_id: leader.user_id,
                leader_username: leader.username,
                total: leader.total,
                percent,
              });
              previousLeader = leader.user_id;
            }
          }
          
          // Build daily standings (all days, not just lead changes)
          const dailyStandings: { date: string; standings: { user_id: string; username: string; total: number; daily: number; percent: number }[] }[] = [];
          let previousDayTotals: Record<string, number> = {};
          
          for (const date of sortedEntryDates) {
            const dayTotals = cumulativeByDay[date];
            const standings = Object.entries(dayTotals)
              .map(([userId, total]) => {
                const dailyAmount = total - (previousDayTotals[userId] || 0);
                const percent = totalTarget > 0 ? Math.round((total / totalTarget) * 100) : 0;
                return {
                  user_id: userId,
                  username: userMap.get(userId) || 'Unknown',
                  total,
                  daily: dailyAmount,
                  percent,
                };
              })
              .filter(s => s.daily > 0 || s.total > 0)  // Only include participants with activity
              .sort((a, b) => b.total - a.total);  // Sort by cumulative total
            
            if (standings.length > 0) {
              dailyStandings.push({ date, standings });
            }
            previousDayTotals = { ...dayTotals };
          }
          
          if (progressInsights) {
            (progressInsights as any).leader_changes = leaderChanges;
            (progressInsights as any).daily_standings = dailyStandings;
            (progressInsights as any).cumulative_by_day = cumulativeByDay;
          }
        } catch (lcError) {
          console.error('Error calculating leader changes:', lcError);
        }
      }

      if (shouldAutoComplete) {
        const sorted = [...repLeaderboard];
        
        // For Team Blitzkrieg (scope === 'team'), no winner - just track who completed their goals
        if (challenge.scope === 'team') {
          // Calculate who completed all their targets with per-task breakdown
          const participantResults: { 
            user_id: string; 
            username: string; 
            completed_all: boolean; 
            tasks_completed: number; 
            total_tasks: number;
            task_progress: { task_name: string; achieved: number; target: number; completed: boolean }[];
          }[] = [];
          
          const totalTasks = repTasksProgress?.length || 0;
          
          for (const participant of sorted) {
            let tasksCompleted = 0;
            const taskProgress: { task_name: string; achieved: number; target: number; completed: boolean }[] = [];
            
            for (const task of repTasksProgress || []) {
              const userEntry = task.leaderboard.find((e: any) => e.user_id === participant.user_id);
              const target = task.target_value || 0;
              const achieved = userEntry?.total || 0;
              const GOAL_TOLERANCE = 0.9;
              const completed = achieved >= target * GOAL_TOLERANCE;
              
              if (completed) {
                tasksCompleted++;
              }
              
              taskProgress.push({
                task_name: task.task_name,
                achieved,
                target,
                completed,
              });
            }
            
            // Only mark completed_all if there are actually tasks to complete
            participantResults.push({
              user_id: participant.user_id,
              username: participant.username,
              completed_all: totalTasks > 0 && tasksCompleted === totalTasks,
              tasks_completed: tasksCompleted,
              total_tasks: totalTasks,
              task_progress: taskProgress,
            });
          }
          
          // Only mark team as completed if there are tasks AND someone completed all
          const anyoneCompleted = totalTasks > 0 && participantResults.some(p => p.completed_all);
          
          const repResult = {
            leaderboard: repLeaderboard,
            winner_user_id: null, // No winner for Team Blitzkrieg
            is_tie: false,
            is_team_blitzkrieg: true,
            team_completed: anyoneCompleted,
            participant_results: participantResults,
          };

          await db
            .update(challenges)
            .set({
              status: 'completed',
              completed_at: new Date(),
              winner_user_id: null, // No winner for Team Blitzkrieg
              result_json: repResult,
            })
            .where(eq(challenges.id, challengeId));

          challenge.status = 'completed';
          challenge.completed_at = new Date();
          challenge.winner_user_id = null;
          resultData = repResult;
        } else {
          // For Showdown (duel) and Lone Wolf (solo) - determine winner by highest total
          let winnerId: string | null = null;
          let isTie = false;

          if (sorted.length >= 2 && sorted[0].total > sorted[1].total) {
            winnerId = sorted[0].user_id;
          } else if (sorted.length >= 2 && sorted[0].total === sorted[1].total) {
            isTie = true;
          } else if (sorted.length === 1) {
            winnerId = sorted[0].user_id;
          }

          const repResult = {
            leaderboard: repLeaderboard,
            winner_user_id: winnerId,
            is_tie: isTie,
          };

          await db
            .update(challenges)
            .set({
              status: 'completed',
              completed_at: new Date(),
              winner_user_id: winnerId,
              result_json: repResult,
            })
            .where(eq(challenges.id, challengeId));

          challenge.status = 'completed';
          challenge.completed_at = new Date();
          challenge.winner_user_id = winnerId;
          resultData = repResult;
        }
      }
    } else if (challenge.template_key && !['lone_flaps', 'flap_off', 'team_flaps'].includes(challenge.template_key)) {
      // Only process weight-based template challenges (not Flaps)
      if (shouldAutoComplete) {
        const result = await calculateChallengeResult(
          challenge.id,
          challenge.template_key,
          challenge.starts_on,
          challenge.ends_on,
          formattedParticipants.map((p) => ({ user_id: p.user_id, username: p.username })),
          true,
          challenge.target_weight_kg ? Number(challenge.target_weight_kg) : null
        );

        const isCustomComplete = challenge.template_key === 'custom' && result.is_complete;
        const allHaveValidData = result.participants.every((p: any) => p.has_valid_data);

        if (allHaveValidData || isCustomComplete) {
          await db
            .update(challenges)
            .set({
              status: 'completed',
              completed_at: new Date(),
              winner_user_id: result.winner_user_id,
              result_json: result,
            })
            .where(eq(challenges.id, challengeId));

          challenge.status = 'completed';
          challenge.completed_at = new Date();
          challenge.winner_user_id = result.winner_user_id;
          resultData = result;
        } else {
          resultData = result;
        }
      }

      if (challenge.status === 'active' && !resultData) {
        try {
          resultData = await calculateChallengeResult(
            challenge.id,
            challenge.template_key,
            challenge.starts_on,
            challenge.ends_on,
            formattedParticipants.map((p) => ({ user_id: p.user_id, username: p.username })),
            false,
            challenge.target_weight_kg ? Number(challenge.target_weight_kg) : null
          );
        } catch (e) {
          console.error('Error calculating current snapshot:', e);
        }
      }
    }

    let shredOffProgress: any = null;
    const isShredOff = challenge.template_key && !['lone_flaps', 'flap_off', 'team_flaps'].includes(challenge.template_key) && !isRepChallenge;

    if (isShredOff) {
      const activeParticipants = formattedParticipants.filter(
        (p) => p.state === 'accepted' || p.state === 'latecomer'
      );

      const targetLoss = challenge.target_weight_kg ? Number(challenge.target_weight_kg) : null;
      const startDate = challenge.starts_on;
      const endDate = challenge.ends_on;
      const today = getSydneyDateString();
      const effectiveEnd = endDate < today ? endDate : today;

      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate).getTime();
      const todayMs = new Date(today).getTime();
      const totalDays = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
      const daysElapsed = Math.max(0, Math.round((todayMs - startMs) / (1000 * 60 * 60 * 24)));
      const daysRemaining = Math.max(0, totalDays - daysElapsed);

      const participantProgress: any[] = [];

      for (const p of activeParticipants) {
        const weightData = await db
          .select({ weigh_date: weights.weigh_date, weight_kg: weights.weight_kg })
          .from(weights)
          .where(and(eq(weights.user_id, p.user_id), gte(weights.weigh_date, startDate), lte(weights.weigh_date, effectiveEnd)))
          .orderBy(asc(weights.weigh_date));

        const startWeightData = await db
          .select({ weight_kg: weights.weight_kg })
          .from(weights)
          .where(and(eq(weights.user_id, p.user_id), lte(weights.weigh_date, startDate)))
          .orderBy(desc(weights.weigh_date))
          .limit(1);

        const startWeight = startWeightData.length > 0 ? Number(startWeightData[0].weight_kg) : null;
        const latestWeight = weightData.length > 0 ? Number(weightData[weightData.length - 1].weight_kg) : startWeight;
        const weightLost = startWeight !== null && latestWeight !== null ? startWeight - latestWeight : null;

        let progressPercent = 0;
        if (targetLoss && targetLoss > 0 && weightLost !== null) {
          progressPercent = Math.min(100, Math.max(0, (weightLost / targetLoss) * 100));
        }

        const succeeded = targetLoss && weightLost !== null ? weightLost >= targetLoss * 0.85 : false;

        const bfData = await db
          .select({ log_date: bodyFatLogs.log_date, bf_percent: bodyFatLogs.bf_percent })
          .from(bodyFatLogs)
          .where(and(eq(bodyFatLogs.user_id, p.user_id), gte(bodyFatLogs.log_date, startDate), lte(bodyFatLogs.log_date, effectiveEnd)))
          .orderBy(asc(bodyFatLogs.log_date));

        const startBf = bfData.length > 0 ? Number(bfData[0].bf_percent) : null;
        const latestBf = bfData.length > 0 ? Number(bfData[bfData.length - 1].bf_percent) : null;
        const bfChange = startBf !== null && latestBf !== null ? latestBf - startBf : null;

        const waistData = await db
          .select({ log_date: waistLogs.log_date, waist_cm: waistLogs.waist_cm })
          .from(waistLogs)
          .where(and(eq(waistLogs.user_id, p.user_id), gte(waistLogs.log_date, startDate), lte(waistLogs.log_date, effectiveEnd)))
          .orderBy(asc(waistLogs.log_date));

        const startWaist = waistData.length > 0 ? Number(waistData[0].waist_cm) : null;
        const latestWaist = waistData.length > 0 ? Number(waistData[waistData.length - 1].waist_cm) : null;
        const waistChange = startWaist !== null && latestWaist !== null ? latestWaist - startWaist : null;

        let dailyAvgLoss = 0;
        let neededPerDay = 0;
        let paceStatus: 'ahead' | 'on_track' | 'behind' | 'done' = 'on_track';

        if (targetLoss && targetLoss > 0) {
          if (succeeded) {
            paceStatus = 'done';
          } else if (daysElapsed > 0 && weightLost !== null) {
            dailyAvgLoss = weightLost / daysElapsed;
            const remaining = targetLoss - (weightLost > 0 ? weightLost : 0);
            neededPerDay = daysRemaining > 0 ? remaining / daysRemaining : remaining;

            if (dailyAvgLoss >= neededPerDay * 1.1) {
              paceStatus = 'ahead';
            } else if (dailyAvgLoss >= neededPerDay * 0.9) {
              paceStatus = 'on_track';
            } else {
              paceStatus = 'behind';
            }
          }
        }

        let bestDayDrop: { date: string; drop: number } | null = null;
        for (let i = 1; i < weightData.length; i++) {
          const prev = Number(weightData[i - 1].weight_kg);
          const curr = Number(weightData[i].weight_kg);
          const drop = prev - curr;
          if (drop > 0 && (!bestDayDrop || drop > bestDayDrop.drop)) {
            bestDayDrop = { date: weightData[i].weigh_date, drop: Math.round(drop * 100) / 100 };
          }
        }

        const logCount = weightData.length;

        participantProgress.push({
          user_id: p.user_id,
          username: p.username,
          start_weight: startWeight,
          current_weight: latestWeight,
          weight_lost: weightLost !== null ? Math.round(weightLost * 100) / 100 : null,
          progress_percent: Math.round(progressPercent * 10) / 10,
          succeeded,
          start_bf: startBf,
          current_bf: latestBf,
          bf_change: bfChange !== null ? Math.round(bfChange * 10) / 10 : null,
          start_waist: startWaist,
          current_waist: latestWaist,
          waist_change: waistChange !== null ? Math.round(waistChange * 10) / 10 : null,
          daily_avg_loss: Math.round(dailyAvgLoss * 1000) / 1000,
          needed_per_day: Math.round(neededPerDay * 1000) / 1000,
          pace_status: paceStatus,
          best_day_drop: bestDayDrop,
          log_count: logCount,
          weight_entries: weightData.map(w => ({ date: w.weigh_date, weight: Number(w.weight_kg) })),
        });
      }

      participantProgress.sort((a, b) => (b.weight_lost || 0) - (a.weight_lost || 0));

      shredOffProgress = {
        target_loss: targetLoss,
        days_elapsed: daysElapsed,
        days_remaining: daysRemaining,
        total_days: totalDays,
        participants: participantProgress,
      };
    }

    // Flaps challenge data
    let flapsEntries: any[] = [];
    let flapsLeaderboard: any[] = [];
    const isFlapsChallenge = challenge.template_key ? ['lone_flaps', 'flap_off', 'team_flaps'].includes(challenge.template_key) : false;
    
    if (isFlapsChallenge) {
      // Fetch all flaps entries for this challenge
      const entries = await db
        .select({
          id: flapsLog.id,
          user_id: flapsLog.user_id,
          duration_minutes: flapsLog.duration_minutes,
          avg_heart_rate: flapsLog.avg_heart_rate,
          calories_burned: flapsLog.calories_burned,
          exercise_mode: flapsLog.exercise_mode,
          distance_km: flapsLog.distance_km,
          hiit_details: flapsLog.hiit_details,
          notes: flapsLog.notes,
          entry_date: flapsLog.entry_date,
          created_at: flapsLog.created_at,
        })
        .from(flapsLog)
        .where(eq(flapsLog.challenge_id, challengeId));

      flapsEntries = entries.map((e) => ({
        ...e,
        username: userMap.get(e.user_id) || 'Unknown',
        duration_minutes: Number(e.duration_minutes) || 0,
        avg_heart_rate: e.avg_heart_rate ? Number(e.avg_heart_rate) : null,
        calories_burned: e.calories_burned ? Number(e.calories_burned) : null,
        distance_km: e.distance_km ? Number(e.distance_km) : null,
        hiit_details: e.hiit_details || null,
        notes: e.notes || null,
        entry_date: e.entry_date,
        logged_at: e.created_at?.toISOString(),
      }));

      // Build leaderboard - aggregate by user (weighted avg HR by duration)
      const userStats: Record<string, {
        user_id: string;
        username: string;
        total_duration: number;
        total_calories: number;
        avg_hr: number | null;
        hr_duration_sum: number;
        hr_weighted_sum: number;
        entries_count: number;
      }> = {};

      for (const entry of flapsEntries) {
        if (!userStats[entry.user_id]) {
          userStats[entry.user_id] = {
            user_id: entry.user_id,
            username: entry.username,
            total_duration: 0,
            total_calories: 0,
            avg_hr: null,
            hr_duration_sum: 0,
            hr_weighted_sum: 0,
            entries_count: 0,
          };
        }
        const stats = userStats[entry.user_id];
        stats.total_duration += entry.duration_minutes;
        stats.total_calories += entry.calories_burned || 0;
        stats.entries_count++;
        if (entry.avg_heart_rate && entry.duration_minutes > 0) {
          stats.hr_weighted_sum += entry.avg_heart_rate * entry.duration_minutes;
          stats.hr_duration_sum += entry.duration_minutes;
          stats.avg_hr = Math.round(stats.hr_weighted_sum / stats.hr_duration_sum);
        }
      }

      // Dynamic tolerance: for challenges 5+ days, allow 2 missed days worth of effort.
      // A 7-day challenge: 5/7 ≈ 71%. Any challenge under 5 days stays at 90%.
      // Uses the worst-case (shortest allowed) ratio so all 5+ day challenges are equally forgiving.
      const FLAPS_TOLERANCE = totalDays >= 5 ? 5 / 7 : 0.9;

      // Check if user passed based on targets (with dynamic tolerance)
      const targetDuration = challenge.target_duration_minutes ? Number(challenge.target_duration_minutes) : 0;
      const targetCalories = challenge.target_calories ? Number(challenge.target_calories) : 0;
      const targetHR = challenge.target_avg_heart_rate ? Number(challenge.target_avg_heart_rate) : 0;

      flapsLeaderboard = Object.values(userStats).map((stats) => {
        const durationPassed = targetDuration === 0 || stats.total_duration >= targetDuration * FLAPS_TOLERANCE;
        const caloriesPassed = targetCalories === 0 || stats.total_calories >= targetCalories * FLAPS_TOLERANCE;
        const hrPassed = targetHR === 0 || (stats.avg_hr !== null && stats.avg_hr >= targetHR * FLAPS_TOLERANCE);
        
        return {
          user_id: stats.user_id,
          username: stats.username,
          total_duration: stats.total_duration,
          total_calories: stats.total_calories,
          avg_hr: stats.avg_hr,
          entries_count: stats.entries_count,
          passed: durationPassed && caloriesPassed && hrPassed,
        };
      });

      // Sort by total calories (descending) for leaderboard
      flapsLeaderboard.sort((a, b) => b.total_calories - a.total_calories);

      // Only finalise the challenge after the end date has passed (shouldAutoComplete).
      // Mid-challenge, the leaderboard "passed" indicators are shown as live progress only.
      const canFinalise = challenge.status === 'active' && !challenge.completed_at;

      if (canFinalise && shouldAutoComplete) {
        const allPassed = flapsLeaderboard.length > 0 && flapsLeaderboard.every((entry) => entry.passed);
        const anyPassed = flapsLeaderboard.some((entry) => entry.passed);

        let winnerId: string | null = null;
        let finalStatus: string = flapsLeaderboard.length === 0 ? 'failed' : 'completed';

        if (challenge.scope === 'solo' || challenge.scope === 'individual') {
          if (allPassed) {
            winnerId = flapsLeaderboard[0].user_id;
            finalStatus = 'completed';
          } else {
            finalStatus = 'failed';
          }
        } else if (challenge.scope === 'duel') {
          const passedEntries = flapsLeaderboard.filter((e) => e.passed);
          if (passedEntries.length >= 1) {
            finalStatus = 'completed';
            if (passedEntries.length === 1) {
              winnerId = passedEntries[0].user_id;
            } else {
              const sorted = [...passedEntries].sort((a, b) => b.total_calories - a.total_calories);
              winnerId = sorted[0].total_calories > sorted[1].total_calories ? sorted[0].user_id : null;
            }
          } else {
            finalStatus = 'failed';
          }
        } else if (challenge.scope === 'team') {
          finalStatus = anyPassed ? 'completed' : 'failed';
        }

        const flapsResult = {
          leaderboard: flapsLeaderboard,
          winner_user_id: winnerId,
          all_passed: allPassed,
          any_passed: anyPassed,
          is_flaps: true,
        };

        await db
          .update(challenges)
          .set({
            status: finalStatus,
            completed_at: new Date(),
            winner_user_id: winnerId,
            result_json: flapsResult,
          })
          .where(eq(challenges.id, challengeId));

        challenge.status = finalStatus;
        challenge.completed_at = new Date();
        challenge.winner_user_id = winnerId;
        resultData = flapsResult;
      }
    }

    // Handle expired pending challenges - mark as failed
    if (shouldMarkFailed) {
      await db
        .update(challenges)
        .set({
          status: 'failed',
          completed_at: new Date(),
          result_json: {
            reason: 'Challenge expired while pending - never started',
          },
        })
        .where(eq(challenges.id, challengeId));

      challenge.status = 'failed';
      challenge.completed_at = new Date();
    }

    // Generate dynamic activity summary from challenge tasks (separate from description/comments)
    let activitySummary: string | null = null;
    if (allRepTasks.length > 0) {
      const taskSummaries = allRepTasks.map(task => {
        const target = task.target_value ? Number(task.target_value) : 0;
        const targetType = task.target_type || 'total';
        const targetLabel = targetType === 'per_day' ? 'per day' : 'total';
        return `${target} ${task.name} ${targetLabel}`;
      });
      activitySummary = taskSummaries.join(', ');
    } else if (isFlapsChallenge) {
      // For Flaps challenges, generate summary from targets
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

    const currentUserParticipant = formattedParticipants.find((p) => p.user_id === session.id);

    return res.status(200).json({
      ok: true,
      challenge: {
        ...challenge,
        activity_summary: activitySummary,
        description: challenge.description,
        created_at: challenge.created_at?.toISOString(),
        completed_at: challenge.completed_at?.toISOString(),
        updated_at: challenge.updated_at?.toISOString(),
        target_weight_kg: challenge.target_weight_kg ? Number(challenge.target_weight_kg) : null,
        target_duration_minutes: challenge.target_duration_minutes ? Number(challenge.target_duration_minutes) : null,
        target_avg_heart_rate: challenge.target_avg_heart_rate ? Number(challenge.target_avg_heart_rate) : null,
        target_calories: challenge.target_calories ? Number(challenge.target_calories) : null,
        allowed_exercise_modes: challenge.allowed_exercise_modes || null,
        participants: formattedParticipants,
        result: resultData,
        rep_leaderboard: repLeaderboard,
        rep_task: repTask ? { ...repTask, target_value: repTask.target_value ? Number(repTask.target_value) : null } : null,
        rep_tasks_progress: repTasksProgress,
        tasks: allRepTasks,
        daily_timeline: dailyTimeline,
        is_rep_challenge: isRepChallenge,
        current_user_participant: currentUserParticipant,
        progress_insights: progressInsights,
        all_participant_insights: allParticipantInsights,
        flaps_entries: flapsEntries,
        flaps_leaderboard: flapsLeaderboard,
        shred_off_progress: shredOffProgress,
      },
    });
  } catch (error) {
    console.error('Error in GET challenge detail:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
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

  const { id: challengeId } = req.query;
  if (!challengeId || typeof challengeId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Challenge ID is required' });
  }

  const isAdmin = session.username.toLowerCase() === 'nox';

  if (!isAdmin) {
    return res.status(403).json({ ok: false, error: 'Only admin can edit challenges' });
  }

  try {
    const challengeData = await db.select().from(challenges).where(eq(challenges.id, challengeId)).limit(1);
    const challenge = challengeData[0];

    if (!challenge) {
      return res.status(404).json({ ok: false, error: 'Challenge not found' });
    }

    const { title, starts_on, ends_on, stake_text, stake_amount, description, target_weight_kg,
      target_duration_minutes, target_avg_heart_rate, target_calories,
      task_updates, entry_updates, entry_deletes } = req.body;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    const updateFields: any = { updated_at: new Date() };

    if (title !== undefined) updateFields.title = title;
    if (description !== undefined) updateFields.description = description;
    if (stake_text !== undefined) updateFields.stake_text = stake_text || null;
    if (stake_amount !== undefined) updateFields.stake_amount = stake_amount || null;
    if (target_weight_kg !== undefined) updateFields.target_weight_kg = target_weight_kg || null;
    if (target_duration_minutes !== undefined) updateFields.target_duration_minutes = target_duration_minutes || null;
    if (target_avg_heart_rate !== undefined) updateFields.target_avg_heart_rate = target_avg_heart_rate || null;
    if (target_calories !== undefined) updateFields.target_calories = target_calories || null;

    if (starts_on) {
      if (!dateRegex.test(starts_on)) {
        return res.status(400).json({ ok: false, error: 'starts_on must be YYYY-MM-DD format' });
      }
      updateFields.starts_on = starts_on;
    }
    if (ends_on) {
      if (!dateRegex.test(ends_on)) {
        return res.status(400).json({ ok: false, error: 'ends_on must be YYYY-MM-DD format' });
      }
      updateFields.ends_on = ends_on;
    }

    const newStartsOn = starts_on || challenge.starts_on;
    const newEndsOn = ends_on || challenge.ends_on;
    if (newEndsOn < newStartsOn) {
      return res.status(400).json({ ok: false, error: 'End date cannot be before start date' });
    }

    await db.update(challenges).set(updateFields).where(eq(challenges.id, challengeId));

    if (task_updates && Array.isArray(task_updates)) {
      for (const tu of task_updates) {
        if (!tu.id) continue;
        const taskUpdate: any = {};
        if (tu.target_value !== undefined) taskUpdate.target_value = String(tu.target_value);
        if (tu.target_type !== undefined) taskUpdate.target_type = tu.target_type;
        if (tu.name !== undefined) taskUpdate.name = tu.name;
        if (Object.keys(taskUpdate).length > 0) {
          await db.update(challengeTasks).set(taskUpdate).where(
            and(eq(challengeTasks.id, tu.id), eq(challengeTasks.challenge_id, challengeId))
          );
        }
      }
    }

    const isFlapsChallenge = challenge.template_key ? ['lone_flaps', 'flap_off', 'team_flaps'].includes(challenge.template_key) : false;

    if (entry_updates && Array.isArray(entry_updates)) {
      for (const eu of entry_updates) {
        if (!eu.id) continue;
        if (isFlapsChallenge) {
          const flapsUpdate: any = {};
          if (eu.value !== undefined) flapsUpdate.duration_minutes = Number(eu.value);
          if (eu.entry_date !== undefined) flapsUpdate.entry_date = eu.entry_date;
          if (eu.avg_heart_rate !== undefined) flapsUpdate.avg_heart_rate = eu.avg_heart_rate !== null ? Number(eu.avg_heart_rate) : null;
          if (eu.calories_burned !== undefined) flapsUpdate.calories_burned = eu.calories_burned !== null ? Number(eu.calories_burned) : null;
          if (eu.exercise_mode !== undefined && eu.exercise_mode !== null) flapsUpdate.exercise_mode = eu.exercise_mode;
          if (Object.keys(flapsUpdate).length > 0) {
            await db.update(flapsLog).set(flapsUpdate).where(
              and(eq(flapsLog.id, eu.id), eq(flapsLog.challenge_id, challengeId))
            );
          }
        } else {
          const entryUpdate: any = {};
          if (eu.value !== undefined) entryUpdate.value = String(eu.value);
          if (eu.entry_date !== undefined) entryUpdate.entry_date = eu.entry_date;
          if (Object.keys(entryUpdate).length > 0) {
            await db.update(challengeEntries).set(entryUpdate).where(
              and(eq(challengeEntries.id, eu.id), eq(challengeEntries.challenge_id, challengeId))
            );
          }
        }
      }
    }

    if (entry_deletes && Array.isArray(entry_deletes)) {
      for (const entryId of entry_deletes) {
        if (entryId) {
          if (isFlapsChallenge) {
            await db.delete(flapsLog).where(
              and(eq(flapsLog.id, entryId), eq(flapsLog.challenge_id, challengeId))
            );
          } else {
            await db.delete(challengeEntries).where(
              and(eq(challengeEntries.id, entryId), eq(challengeEntries.challenge_id, challengeId))
            );
          }
        }
      }
    }

    return res.status(200).json({ ok: true, message: 'Challenge updated successfully' });
  } catch (error) {
    console.error('Error in PATCH challenge:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
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

  const { id: challengeId } = req.query;
  if (!challengeId || typeof challengeId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Challenge ID is required' });
  }

  const isAdmin = session.username.toLowerCase() === 'nox';

  try {
    const challengeData = await db
      .select({ id: challenges.id, created_by_user_id: challenges.created_by_user_id })
      .from(challenges)
      .where(eq(challenges.id, challengeId))
      .limit(1);

    const challenge = challengeData[0];

    if (!challenge) {
      return res.status(404).json({ ok: false, error: 'Challenge not found' });
    }

    const isCreator = challenge.created_by_user_id === session.id;
    if (!isAdmin && !isCreator) {
      return res.status(403).json({ ok: false, error: 'Only admin or challenge creator can delete challenges' });
    }

    const tasks = await db.select({ id: challengeTasks.id }).from(challengeTasks).where(eq(challengeTasks.challenge_id, challengeId));
    const taskIds = tasks.map((t) => t.id);

    if (taskIds.length > 0) {
      await db.delete(challengeEntries).where(inArray(challengeEntries.task_id, taskIds));
    }

    await db.delete(challengeTasks).where(eq(challengeTasks.challenge_id, challengeId));
    await db.delete(challengeParticipants).where(eq(challengeParticipants.challenge_id, challengeId));
    await db.delete(flapsLog).where(eq(flapsLog.challenge_id, challengeId));
    await db.delete(challenges).where(eq(challenges.id, challengeId));

    return res.status(200).json({ ok: true, message: 'Challenge deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE challenge:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
