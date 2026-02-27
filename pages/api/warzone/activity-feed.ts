// pages/api/warzone/activity-feed.ts
// API for fetching recent challenge activity for the team

import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, users, challenges, challengeParticipants, activityLog, exerciseTypes, userTeams, challengeEntries, challengeTasks, gymSessions, gymSessionExercises, gymSessionSets, gymExercises, banners } from '../../../lib/db';
import { eq, and, inArray, gte, isNotNull, desc, ne, lt, sql, or, max, not } from 'drizzle-orm';
import { getSydneyDateString } from '../../../lib/dateUtils';

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

  try {
    const userData = await db
      .select({ active_team_id: users.active_team_id })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    if (!userData[0]?.active_team_id) {
      return res.status(200).json({ ok: true, activities: [] });
    }

    const teamId = userData[0].active_team_id;

    const teamMembers = await db.select({ user_id: userTeams.user_id }).from(userTeams).where(eq(userTeams.team_id, teamId));

    if (teamMembers.length === 0) {
      return res.status(200).json({ ok: true, activities: [] });
    }

    const memberIds = teamMembers.map((m) => m.user_id);

    const now = new Date();
    const sydneyOffset = 11;
    const sydneyNow = new Date(now.getTime() + sydneyOffset * 60 * 60 * 1000);
    const sydney5am = new Date(sydneyNow);
    sydney5am.setHours(5, 0, 0, 0);
    if (sydneyNow < sydney5am) {
      sydney5am.setDate(sydney5am.getDate() - 1);
    }
    const utc5amSydney = new Date(sydney5am.getTime() - sydneyOffset * 60 * 60 * 1000);

    const activities: any[] = [];

    const completedChallenges = await db
      .select({
        id: challenges.id,
        title: challenges.title,
        status: challenges.status,
        scope: challenges.scope,
        template_key: challenges.template_key,
        winner_user_id: challenges.winner_user_id,
        ends_on: challenges.ends_on,
        completed_at: challenges.completed_at,
        team_id: challenges.team_id,
      })
      .from(challenges)
      .where(
        and(
          eq(challenges.status, 'completed'),
          isNotNull(challenges.completed_at),
          gte(challenges.completed_at, utc5amSydney),
          or(
            eq(challenges.team_id, teamId),
            and(
              or(eq(challenges.scope, 'solo'), eq(challenges.scope, 'individual')),
              inArray(challenges.created_by_user_id, memberIds)
            )
          )
        )
      );

    for (const c of completedChallenges) {
      const isLoneWolf = c.scope === 'solo' || c.scope === 'individual' || c.template_key === 'lone_flaps';
      const isTeamChallenge = c.scope === 'team';
      const timestamp = c.completed_at ? new Date(c.completed_at).toISOString() : new Date().toISOString();

      if (c.winner_user_id && memberIds.includes(c.winner_user_id)) {
        const winnerData = await db.select({ username: users.username }).from(users).where(eq(users.id, c.winner_user_id)).limit(1);
        activities.push({
          type: isLoneWolf ? 'challenge_completed' : 'challenge_won',
          username: winnerData[0]?.username || 'Unknown',
          title: c.title,
          timestamp,
        });
      } else if (!c.winner_user_id) {
        // Team/flaps challenges that completed without a specific winner
        activities.push({
          type: 'challenge_completed',
          username: isTeamChallenge ? 'Team' : 'Team',
          title: c.title,
          timestamp,
        });
      }
    }

    const recentJoins = await db
      .select({
        user_id: challengeParticipants.user_id,
        joined_at: challengeParticipants.joined_at,
        challenge_id: challengeParticipants.challenge_id,
        state: challengeParticipants.state,
        role: challengeParticipants.role,
      })
      .from(challengeParticipants)
      .where(and(
        inArray(challengeParticipants.user_id, memberIds), 
        gte(challengeParticipants.joined_at, utc5amSydney),
        inArray(challengeParticipants.state, ['accepted', 'latecomer'])
      ))
      .orderBy(desc(challengeParticipants.joined_at))
      .limit(10);

    if (recentJoins.length > 0) {
      const challengeIdsForJoins = recentJoins.map((j) => j.challenge_id);
      const challengeInfo = await db
        .select({ id: challenges.id, title: challenges.title, scope: challenges.scope })
        .from(challenges)
        .where(and(
          inArray(challenges.id, challengeIdsForJoins),
          or(
            eq(challenges.team_id, teamId),
            and(
              or(eq(challenges.scope, 'solo'), eq(challenges.scope, 'individual')),
              inArray(challenges.created_by_user_id, memberIds)
            )
          )
        ));
      const challengeMap = new Map(challengeInfo.map((c) => [c.id, c]));

      const userIdsForJoins = recentJoins.map((j) => j.user_id);
      const usersInfo = await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, userIdsForJoins));
      const userMap = new Map(usersInfo.map((u) => [u.id, u.username]));

      for (const join of recentJoins) {
        const challenge = challengeMap.get(join.challenge_id);
        if (challenge) {
          const isCreator = join.role === 'creator';
          activities.push({
            type: isCreator ? 'challenge_created' : 'challenge_joined',
            username: userMap.get(join.user_id) || 'Unknown',
            title: challenge.title,
            timestamp: join.joined_at?.toISOString(),
          });
        }
      }
    }

    const recentActivities = await db
      .select({
        id: activityLog.id,
        user_id: activityLog.user_id,
        value: activityLog.value,
        created_at: activityLog.created_at,
        exercise_type_id: activityLog.exercise_type_id,
        entry_date: activityLog.entry_date,
      })
      .from(activityLog)
      .where(and(inArray(activityLog.user_id, memberIds), gte(activityLog.created_at, utc5amSydney)))
      .orderBy(desc(activityLog.created_at));

    if (recentActivities.length > 0) {
      const todayStr = getSydneyDateString();

      const exerciseTypeIds = Array.from(new Set(recentActivities.map((a) => a.exercise_type_id).filter(Boolean))) as string[];
      const exerciseTypeInfo = exerciseTypeIds.length > 0
        ? await db.select({ id: exerciseTypes.id, name: exerciseTypes.name, unit_label: exerciseTypes.unit_label, unit_type: exerciseTypes.unit_type }).from(exerciseTypes).where(inArray(exerciseTypes.id, exerciseTypeIds))
        : [];
      const exerciseMap = new Map(exerciseTypeInfo.map((e) => [e.id, e]));

      const userIds = Array.from(new Set(recentActivities.map((a) => a.user_id)));
      const usersInfo = await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, userIds));
      const usernameMap = new Map(usersInfo.map((u) => [u.id, u.username]));

      const individualActivities: typeof recentActivities = [];
      const aggregatableActivities: typeof recentActivities = [];

      for (const activity of recentActivities) {
        const exerciseType = activity.exercise_type_id ? exerciseMap.get(activity.exercise_type_id) : null;
        const unitType = exerciseType?.unit_type || 'reps';
        const isRetro = activity.entry_date !== todayStr;
        if (unitType === 'score' || isRetro) {
          individualActivities.push(activity);
        } else {
          aggregatableActivities.push(activity);
        }
      }

      for (const activity of individualActivities) {
        const exerciseType = activity.exercise_type_id ? exerciseMap.get(activity.exercise_type_id) : null;
        const exerciseName = exerciseType?.name || 'exercise';
        const unit = exerciseType?.unit_label || (exerciseType?.unit_type === 'distance' ? 'km' : exerciseType?.unit_type === 'score' ? 'score' : 'reps');
        const username = usernameMap.get(activity.user_id) || 'Unknown';
        const isRetro = activity.entry_date !== todayStr;

        activities.push({
          type: 'activity_logged',
          username,
          exercise: `${Number(activity.value)} ${unit} ${exerciseName}`,
          value: Number(activity.value),
          unit,
          timestamp: activity.created_at?.toISOString() || new Date().toISOString(),
          ...(isRetro && activity.entry_date ? { entry_date: activity.entry_date } : {}),
        });
      }

      const userActivityMap: Record<string, { user_id: string; username: string; exercises: Record<string, { total: number; unit: string }>; latest_timestamp: string }> = {};

      for (const activity of aggregatableActivities) {
        const exerciseType = activity.exercise_type_id ? exerciseMap.get(activity.exercise_type_id) : null;
        const exerciseName = exerciseType?.name || 'exercise';
        const unit = exerciseType?.unit_label || 'reps';

        if (!userActivityMap[activity.user_id]) {
          userActivityMap[activity.user_id] = {
            user_id: activity.user_id,
            username: usernameMap.get(activity.user_id) || 'Unknown',
            exercises: {},
            latest_timestamp: activity.created_at?.toISOString() || new Date().toISOString(),
          };
        }

        if (!userActivityMap[activity.user_id].exercises[exerciseName]) {
          userActivityMap[activity.user_id].exercises[exerciseName] = { total: 0, unit };
        }
        userActivityMap[activity.user_id].exercises[exerciseName].total += Number(activity.value) || 0;

        const activityTime = activity.created_at?.toISOString() || new Date().toISOString();
        if (activityTime > userActivityMap[activity.user_id].latest_timestamp) {
          userActivityMap[activity.user_id].latest_timestamp = activityTime;
        }
      }

      for (const userActivity of Object.values(userActivityMap)) {
        const exerciseList = Object.entries(userActivity.exercises).map(([name, data]) => {
          return `${data.total} ${data.unit} ${name}`;
        });
        const exerciseSummary = exerciseList.join(', ');
        const totalValue = Object.values(userActivity.exercises).reduce((sum, data) => sum + data.total, 0);

        activities.push({
          type: 'activity_logged',
          username: userActivity.username,
          exercise: exerciseSummary,
          value: totalValue,
          unit: 'total',
          timestamp: userActivity.latest_timestamp,
        });
      }
    }

    // Record detection: check if any team member set a new daily best today
    try {
      const todayStr = getSydneyDateString();
      
      if (memberIds.length > 0) {
        // Get all of today's activity_log entries for team members, grouped by user + exercise
        const todayActivities = await db
          .select({
            user_id: activityLog.user_id,
            exercise_type_id: activityLog.exercise_type_id,
            value: activityLog.value,
            created_at: activityLog.created_at,
          })
          .from(activityLog)
          .where(
            and(
              inArray(activityLog.user_id, memberIds),
              eq(activityLog.entry_date, todayStr)
            )
          );
        
        if (todayActivities.length > 0) {
          // Sum today's totals per user per exercise + track latest timestamp
          const todayTotals: Record<string, Record<string, number>> = {};
          const todayLatestTime: Record<string, Record<string, string>> = {};
          for (const a of todayActivities) {
            if (!a.exercise_type_id) continue;
            if (!todayTotals[a.user_id]) todayTotals[a.user_id] = {};
            if (!todayLatestTime[a.user_id]) todayLatestTime[a.user_id] = {};
            todayTotals[a.user_id][a.exercise_type_id] = (todayTotals[a.user_id][a.exercise_type_id] || 0) + (Number(a.value) || 0);
            const ts = a.created_at?.toISOString() || new Date().toISOString();
            if (!todayLatestTime[a.user_id][a.exercise_type_id] || ts > todayLatestTime[a.user_id][a.exercise_type_id]) {
              todayLatestTime[a.user_id][a.exercise_type_id] = ts;
            }
          }
          
          // Get exercise type info for names
          const allExTypeIds = Array.from(new Set(todayActivities.map(a => a.exercise_type_id).filter(Boolean))) as string[];
          const exTypeInfo = allExTypeIds.length > 0
            ? await db.select({ id: exerciseTypes.id, name: exerciseTypes.name }).from(exerciseTypes).where(inArray(exerciseTypes.id, allExTypeIds))
            : [];
          const exIdToName = new Map(exTypeInfo.map(e => [e.id, e.name]));
          
          // Get historical best days from activity_log (all days before today)
          const histActivities = await db
            .select({
              user_id: activityLog.user_id,
              exercise_type_id: activityLog.exercise_type_id,
              entry_date: activityLog.entry_date,
              value: activityLog.value,
            })
            .from(activityLog)
            .where(
              and(
                inArray(activityLog.user_id, memberIds),
                inArray(activityLog.exercise_type_id, allExTypeIds),
                lt(activityLog.entry_date, todayStr)
              )
            );
          
          // Calculate historical best day per user per exercise from activity_log
          const histBestDay: Record<string, Record<string, number>> = {};
          const histByDate: Record<string, Record<string, Record<string, number>>> = {};
          for (const a of histActivities) {
            if (!a.exercise_type_id) continue;
            const uid = a.user_id;
            const eid = a.exercise_type_id;
            if (!histByDate[uid]) histByDate[uid] = {};
            if (!histByDate[uid][eid]) histByDate[uid][eid] = {};
            histByDate[uid][eid][a.entry_date] = (histByDate[uid][eid][a.entry_date] || 0) + (Number(a.value) || 0);
          }
          
          for (const [uid, exercises] of Object.entries(histByDate)) {
            if (!histBestDay[uid]) histBestDay[uid] = {};
            for (const [eid, dates] of Object.entries(exercises)) {
              histBestDay[uid][eid] = Math.max(...Object.values(dates), 0);
            }
          }
          
          // Also check challenge_entries for historical bests
          const exNameToId = new Map(exTypeInfo.map(e => [e.name, e.id]));
          const exNames = exTypeInfo.map(e => e.name);
          
          if (exNames.length > 0) {
            // Get completed challenge task entries matching these exercise names
            const pastChallengeTasks = await db
              .select({
                task_id: challengeTasks.id,
                task_name: challengeTasks.name,
              })
              .from(challengeTasks)
              .innerJoin(challenges, eq(challenges.id, challengeTasks.challenge_id))
              .where(
                and(
                  eq(challenges.status, 'completed'),
                  inArray(challengeTasks.name, exNames)
                )
              );
            
            const pastTaskIds = pastChallengeTasks.map(pt => pt.task_id);
            if (pastTaskIds.length > 0) {
              const pastChEntries = await db
                .select({
                  task_id: challengeEntries.task_id,
                  user_id: challengeEntries.user_id,
                  entry_date: challengeEntries.entry_date,
                  value: challengeEntries.value,
                })
                .from(challengeEntries)
                .where(
                  and(
                    inArray(challengeEntries.task_id, pastTaskIds),
                    inArray(challengeEntries.user_id, memberIds)
                  )
                );
              
              // Group by user -> exercise name -> date for best day
              for (const entry of pastChEntries) {
                const task = pastChallengeTasks.find(pt => pt.task_id === entry.task_id);
                if (!task) continue;
                const eid = exNameToId.get(task.task_name);
                if (!eid) continue;
                const uid = entry.user_id;
                if (!histBestDay[uid]) histBestDay[uid] = {};
                // We need to track by date for this challenge too
                if (!histByDate[uid]) histByDate[uid] = {};
                if (!histByDate[uid][eid]) histByDate[uid][eid] = {};
                histByDate[uid][eid][entry.entry_date] = (histByDate[uid][eid][entry.entry_date] || 0) + (Number(entry.value) || 0);
              }
              
              // Recalculate bests after adding challenge data
              for (const [uid, exercises] of Object.entries(histByDate)) {
                if (!histBestDay[uid]) histBestDay[uid] = {};
                for (const [eid, dates] of Object.entries(exercises)) {
                  // Exclude today from historical best
                  const pastDayTotals = Object.entries(dates).filter(([d]) => d !== todayStr).map(([_, v]) => v);
                  histBestDay[uid][eid] = pastDayTotals.length > 0 ? Math.max(...pastDayTotals) : 0;
                }
              }
            }
          }
          
          // Get usernames for record items
          const recordUserIds = Object.keys(todayTotals);
          const recordUsersInfo = recordUserIds.length > 0
            ? await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, recordUserIds))
            : [];
          const recordUsernameMap = new Map(recordUsersInfo.map(u => [u.id, u.username]));
          
          // Check for new daily bests
          for (const [uid, exercises] of Object.entries(todayTotals)) {
            for (const [eid, todayTotal] of Object.entries(exercises)) {
              const prevBest = histBestDay[uid]?.[eid] || 0;
              if (todayTotal > prevBest && prevBest > 0) {
                const exerciseName = exIdToName.get(eid) || 'exercise';
                const username = recordUsernameMap.get(uid) || 'Unknown';
                activities.push({
                  type: 'new_record' as any,
                  username,
                  exercise: `${exerciseName} daily best: ${todayTotal} (prev: ${prevBest})`,
                  value: todayTotal,
                  unit: 'record',
                  timestamp: todayLatestTime[uid]?.[eid] || new Date().toISOString(),
                });
              }
            }
          }
        }
      }
    } catch (recError) {
      console.error('Error detecting records for feed:', recError);
    }

    // Sesh completions and gym PBs
    try {
      const recentSessions = await db
        .select({
          id: gymSessions.id,
          user_id: gymSessions.user_id,
          finished_at: gymSessions.finished_at,
          name: gymSessions.name,
          status: gymSessions.status,
        })
        .from(gymSessions)
        .where(
          and(
            inArray(gymSessions.user_id, memberIds),
            eq(gymSessions.status, 'completed'),
            isNotNull(gymSessions.finished_at),
            gte(gymSessions.finished_at, utc5amSydney)
          )
        )
        .orderBy(desc(gymSessions.finished_at))
        .limit(10);

      if (recentSessions.length > 0) {
        const seshUserIds = Array.from(new Set(recentSessions.map(s => s.user_id)));
        const seshUsers = await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, seshUserIds));
        const seshUsernameMap = new Map(seshUsers.map(u => [u.id, u.username]));

        const sessionIds = recentSessions.map(s => s.id);
        const sessionExercises = await db
          .select({
            session_id: gymSessionExercises.session_id,
            exercise_id: gymSessionExercises.exercise_id,
            id: gymSessionExercises.id,
          })
          .from(gymSessionExercises)
          .where(inArray(gymSessionExercises.session_id, sessionIds));

        const exerciseIds = Array.from(new Set(sessionExercises.map(e => e.exercise_id)));
        const exerciseInfo = exerciseIds.length > 0
          ? await db.select({ id: gymExercises.id, name: gymExercises.name }).from(gymExercises).where(inArray(gymExercises.id, exerciseIds))
          : [];
        const exerciseNameMap = new Map(exerciseInfo.map(e => [e.id, e.name]));

        const sessionExIds = sessionExercises.map(e => e.id);
        const allSets = sessionExIds.length > 0
          ? await db
              .select({
                session_exercise_id: gymSessionSets.session_exercise_id,
                weight_kg: gymSessionSets.weight_kg,
                reps: gymSessionSets.reps,
              })
              .from(gymSessionSets)
              .where(inArray(gymSessionSets.session_exercise_id, sessionExIds))
          : [];

        const setsBySessionExId = new Map<string, typeof allSets>();
        for (const s of allSets) {
          const arr = setsBySessionExId.get(s.session_exercise_id) || [];
          arr.push(s);
          setsBySessionExId.set(s.session_exercise_id, arr);
        }

        // Calculate total volume (iron pumped) for each current session
        const currentSessionVolume = new Map<string, number>();
        for (const session of recentSessions) {
          const exsForSession = sessionExercises.filter(e => e.session_id === session.id);
          let vol = 0;
          for (const ex of exsForSession) {
            for (const s of (setsBySessionExId.get(ex.id) || [])) {
              vol += (Number(s.weight_kg) || 0) * (Number(s.reps) || 0);
            }
          }
          currentSessionVolume.set(session.id, vol);
        }

        // Get historical max total session volume per user (excluding current sessions)
        const prevMaxVolumeByUser = new Map<string, number>();
        if (seshUserIds.length > 0) {
          const historicalVolumes = await db
            .select({
              user_id: gymSessions.user_id,
              session_volume: sql<number>`SUM(COALESCE(${gymSessionSets.weight_kg}::numeric, 0) * COALESCE(${gymSessionSets.reps}, 0))`,
            })
            .from(gymSessions)
            .innerJoin(gymSessionExercises, eq(gymSessionExercises.session_id, gymSessions.id))
            .innerJoin(gymSessionSets, eq(gymSessionSets.session_exercise_id, gymSessionExercises.id))
            .where(
              and(
                inArray(gymSessions.user_id, seshUserIds),
                eq(gymSessions.status, 'completed'),
                not(inArray(gymSessions.id, sessionIds))
              )
            )
            .groupBy(gymSessions.user_id, gymSessions.id);

          for (const row of historicalVolumes) {
            const vol = Number(row.session_volume) || 0;
            const prev = prevMaxVolumeByUser.get(row.user_id) || 0;
            if (vol > prev) prevMaxVolumeByUser.set(row.user_id, vol);
          }
        }

        // Pre-compute all historical max weights per user+exercise (excluding today's sessions)
        // by getting max weight across ALL completed sessions before these recent ones
        const prevMaxWeights = new Map<string, number>();
        if (seshUserIds.length > 0 && exerciseIds.length > 0) {
          const allPrevMax = await db
            .select({
              user_id: gymSessions.user_id,
              exercise_id: gymSessionExercises.exercise_id,
              max_weight: max(gymSessionSets.weight_kg),
            })
            .from(gymSessionSets)
            .innerJoin(gymSessionExercises, eq(gymSessionSets.session_exercise_id, gymSessionExercises.id))
            .innerJoin(gymSessions, eq(gymSessionExercises.session_id, gymSessions.id))
            .where(
              and(
                inArray(gymSessions.user_id, seshUserIds),
                inArray(gymSessionExercises.exercise_id, exerciseIds),
                eq(gymSessions.status, 'completed'),
                not(inArray(gymSessions.id, sessionIds))
              )
            )
            .groupBy(gymSessions.user_id, gymSessionExercises.exercise_id);

          for (const row of allPrevMax) {
            prevMaxWeights.set(`${row.user_id}:${row.exercise_id}`, Number(row.max_weight) || 0);
          }
        }

        for (const session of recentSessions) {
          const username = seshUsernameMap.get(session.user_id) || 'Unknown';
          const exsForSession = sessionExercises.filter(e => e.session_id === session.id);
          const exerciseCount = exsForSession.length;
          let totalSets = 0;
          for (const ex of exsForSession) {
            totalSets += (setsBySessionExId.get(ex.id) || []).length;
          }

          const seshLabel = session.name || 'Gym Sesh';
          activities.push({
            type: 'sesh_completed' as any,
            username,
            exercise: `completed ${seshLabel} (${exerciseCount} exercises, ${totalSets} sets)`,
            timestamp: session.finished_at?.toISOString() || new Date().toISOString(),
          });

          // Check for gym PBs using precomputed max weights
          for (const ex of exsForSession) {
            const sets = setsBySessionExId.get(ex.id) || [];
            const exerciseName = exerciseNameMap.get(ex.exercise_id) || 'exercise';
            const maxWeight = Math.max(...sets.map(s => Number(s.weight_kg) || 0));
            if (maxWeight <= 0) continue;

            const prevMax = prevMaxWeights.get(`${session.user_id}:${ex.exercise_id}`);
            if (prevMax !== undefined && maxWeight > prevMax) {
              activities.push({
                type: 'gym_pb' as any,
                username,
                exercise: `new PB on ${exerciseName}: ${maxWeight}kg${prevMax > 0 ? ` (prev: ${prevMax}kg)` : ''}`,
                timestamp: session.finished_at?.toISOString() || new Date().toISOString(),
              });
            }
          }

          // Check for iron pumped (total session volume) PB
          const sessionVol = currentSessionVolume.get(session.id) || 0;
          if (sessionVol > 0) {
            const prevMaxVol = prevMaxVolumeByUser.get(session.user_id) || 0;
            if (sessionVol > prevMaxVol) {
              activities.push({
                type: 'iron_pb' as any,
                username,
                exercise: `Iron Pumped PB: ${Math.round(sessionVol).toLocaleString()}kg total volume${prevMaxVol > 0 ? ` (prev: ${Math.round(prevMaxVol).toLocaleString()}kg)` : ' (first session on record)'}`,
                timestamp: session.finished_at?.toISOString() || new Date().toISOString(),
              });
            }
          }
        }
      }
    } catch (seshError) {
      console.error('Error fetching sesh activities:', seshError);
    }

    // Weight performance banners (Epic Weekend, Ripper Week, etc.)
    try {
      const recentBanners = await db
        .select({
          message: banners.message,
          type: banners.type,
          created_at: banners.created_at,
          created_by: banners.created_by,
        })
        .from(banners)
        .where(
          and(
            eq(banners.team_id, teamId),
            gte(banners.created_at, utc5amSydney),
            or(
              eq(banners.type, 'weekend_epic'),
              eq(banners.type, 'weekend_solid'),
              eq(banners.type, 'weekly_ripper'),
              eq(banners.type, 'weekly_pisscutter')
            )
          )
        )
        .orderBy(desc(banners.created_at))
        .limit(10);

      if (recentBanners.length > 0) {
        const bannerUserIds = recentBanners.map(b => b.created_by).filter(Boolean) as string[];
        const bannerUsers = bannerUserIds.length > 0
          ? await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, bannerUserIds))
          : [];
        const bannerUsernameMap = new Map(bannerUsers.map(u => [u.id, u.username]));

        const typeMap: Record<string, string> = {
          'weekend_epic': 'weight_epic',
          'weekend_solid': 'weight_solid',
          'weekly_ripper': 'weight_ripper',
          'weekly_pisscutter': 'weight_pisscutter',
        };

        for (const b of recentBanners) {
          const username = b.created_by ? (bannerUsernameMap.get(b.created_by) || 'Unknown') : 'Unknown';
          activities.push({
            type: (typeMap[b.type] || 'activity_logged') as any,
            username,
            exercise: b.message,
            timestamp: b.created_at?.toISOString() || new Date().toISOString(),
          });
        }
      }
    } catch (bannerError) {
      console.error('Error fetching weight banners for feed:', bannerError);
    }

    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const limitedActivities = activities.slice(0, 20);

    return res.status(200).json({ ok: true, activities: limitedActivities });
  } catch (error) {
    console.error('Error fetching activity feed:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
