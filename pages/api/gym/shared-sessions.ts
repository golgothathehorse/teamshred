import type { NextApiRequest, NextApiResponse } from 'next';
import { db, users, profiles, userTeams, gymSessions, gymSessionExercises, gymSessionSets, gymExercises } from '../../../lib/db';
import { eq, desc, inArray, and, gte, lte } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../../lib/auth';
import { getSydneyDateString } from '../../../lib/dateUtils';

function getDateRangeFilter(dateRange: string, customStart?: string, customEnd?: string): { start: string | null; end: string | null } {
  const todayStr = getSydneyDateString();
  switch (dateRange) {
    case 'today':
      return { start: todayStr, end: todayStr };
    case 'week': {
      const [year, month, day] = todayStr.split('-').map(Number);
      const sydneyToday = new Date(year, month - 1, day);
      const last7Days = new Date(sydneyToday);
      last7Days.setDate(sydneyToday.getDate() - 6);
      const startStr = `${last7Days.getFullYear()}-${String(last7Days.getMonth() + 1).padStart(2, '0')}-${String(last7Days.getDate()).padStart(2, '0')}`;
      return { start: startStr, end: todayStr };
    }
    case 'month': {
      const [year, month, day] = todayStr.split('-').map(Number);
      const sydneyToday = new Date(year, month - 1, day);
      const last30Days = new Date(sydneyToday);
      last30Days.setDate(sydneyToday.getDate() - 29);
      const startStr = `${last30Days.getFullYear()}-${String(last30Days.getMonth() + 1).padStart(2, '0')}-${String(last30Days.getDate()).padStart(2, '0')}`;
      return { start: startStr, end: todayStr };
    }
    case 'custom':
      return { start: customStart || null, end: customEnd || null };
    default:
      return { start: null, end: null };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let session = parseSessionFromRequest(req);
  if (!session && process.env.TEST_BYPASS_AUTH === 'true') {
    session = { id: '7d921803-163b-4f6e-827f-4c3a94ba9efb', username: 'Nox', isAdmin: true };
  }
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const currentUser = await db
      .select({ active_team_id: users.active_team_id })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    const activeTeamId = currentUser[0]?.active_team_id;
    if (!activeTeamId) {
      return res.status(200).json({ ok: true, sessions: [], teamMembers: [] });
    }

    const teamMemberships = await db
      .select({ user_id: userTeams.user_id })
      .from(userTeams)
      .where(eq(userTeams.team_id, activeTeamId));

    const teamMemberIds = teamMemberships.map(m => m.user_id);
    if (teamMemberIds.length === 0) {
      return res.status(200).json({ ok: true, sessions: [], teamMembers: [] });
    }

    const teamMemberData = await db
      .select({ user_id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, teamMemberIds));

    const teamProfiles = await db
      .select({ user_id: profiles.user_id, share_workout_history: profiles.share_workout_history })
      .from(profiles)
      .where(inArray(profiles.user_id, teamMemberIds));

    const profileMap = new Map(teamProfiles.map(p => [p.user_id, p.share_workout_history ?? false]));
    const usernameMap = new Map(teamMemberData.map(u => [u.user_id, u.username]));

    const teamMembers = teamMemberData.map(u => ({
      username: u.username,
      shareEnabled: profileMap.get(u.user_id) ?? false,
    }));

    let sharingEnabledIds = teamMemberIds.filter(id => profileMap.get(id) ?? false);

    const usernameFilter = req.query.username as string;
    if (usernameFilter && usernameFilter !== 'all') {
      const filteredUser = teamMemberData.find(u => u.username === usernameFilter);
      if (filteredUser && sharingEnabledIds.includes(filteredUser.user_id)) {
        sharingEnabledIds = [filteredUser.user_id];
      } else {
        return res.status(200).json({ ok: true, sessions: [], teamMembers });
      }
    }

    if (sharingEnabledIds.length === 0) {
      return res.status(200).json({ ok: true, sessions: [], teamMembers });
    }

    const dateRange = req.query.dateRange as string || 'all';
    const customStart = req.query.startDate as string;
    const customEnd = req.query.endDate as string;
    const { start, end } = getDateRangeFilter(dateRange, customStart, customEnd);

    const conditions: any[] = [
      inArray(gymSessions.user_id, sharingEnabledIds),
      eq(gymSessions.status, 'completed'),
    ];
    if (start) conditions.push(gte(gymSessions.session_date, start));
    if (end) conditions.push(lte(gymSessions.session_date, end));

    const sessionsData = await db
      .select({
        id: gymSessions.id,
        user_id: gymSessions.user_id,
        session_date: gymSessions.session_date,
        name: gymSessions.name,
        started_at: gymSessions.started_at,
        finished_at: gymSessions.finished_at,
      })
      .from(gymSessions)
      .where(and(...conditions))
      .orderBy(desc(gymSessions.session_date))
      .limit(100);

    const sessionIds = sessionsData.map(s => s.id);

    let exercisesBySession: Record<string, { exercise_name: string; muscle_group: string; sets: { set_number: number; weight_kg: number | null; reps: number | null; is_warmup: boolean; notes: string | null }[] }[]> = {};

    if (sessionIds.length > 0) {
      const allExercises = await db
        .select({
          id: gymSessionExercises.id,
          session_id: gymSessionExercises.session_id,
          exercise_id: gymSessionExercises.exercise_id,
          sort_order: gymSessionExercises.sort_order,
        })
        .from(gymSessionExercises)
        .where(inArray(gymSessionExercises.session_id, sessionIds));

      const exerciseIds = [...new Set(allExercises.map(e => e.exercise_id))];
      let exerciseMap = new Map<string, { name: string; muscle_group: string }>();
      if (exerciseIds.length > 0) {
        const exercises = await db
          .select({ id: gymExercises.id, name: gymExercises.name, muscle_group: gymExercises.muscle_group })
          .from(gymExercises)
          .where(inArray(gymExercises.id, exerciseIds));
        exerciseMap = new Map(exercises.map(e => [e.id, { name: e.name, muscle_group: e.muscle_group }]));
      }

      const sessionExerciseIds = allExercises.map(e => e.id);
      let allSets: { session_exercise_id: string; set_number: number; weight_kg: string | null; reps: number | null; is_warmup: boolean | null; notes: string | null; created_at: Date | null }[] = [];
      if (sessionExerciseIds.length > 0) {
        allSets = await db
          .select({
            session_exercise_id: gymSessionSets.session_exercise_id,
            set_number: gymSessionSets.set_number,
            weight_kg: gymSessionSets.weight_kg,
            reps: gymSessionSets.reps,
            is_warmup: gymSessionSets.is_warmup,
            notes: gymSessionSets.notes,
            created_at: gymSessionSets.created_at,
          })
          .from(gymSessionSets)
          .where(inArray(gymSessionSets.session_exercise_id, sessionExerciseIds));
      }

      const setsByExercise = new Map<string, typeof allSets>();
      for (const set of allSets) {
        const arr = setsByExercise.get(set.session_exercise_id) || [];
        arr.push(set);
        setsByExercise.set(set.session_exercise_id, arr);
      }

      const sortedExercises = [...allExercises].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      for (const se of sortedExercises) {
        const exInfo = exerciseMap.get(se.exercise_id);
        const sets = (setsByExercise.get(se.id) || [])
          .sort((a, b) => a.set_number - b.set_number)
          .map(s => ({
            set_number: s.set_number,
            weight_kg: s.weight_kg ? Number(s.weight_kg) : null,
            reps: s.reps,
            is_warmup: s.is_warmup ?? false,
            notes: s.notes || null,
            created_at: s.created_at?.toISOString() || null,
          }));

        if (!exercisesBySession[se.session_id]) exercisesBySession[se.session_id] = [];
        exercisesBySession[se.session_id].push({
          exercise_name: exInfo?.name || 'Unknown',
          muscle_group: exInfo?.muscle_group || 'Other',
          sets,
        });
      }
    }

    const sessions = sessionsData.map(s => {
      const exercises = exercisesBySession[s.id] || [];
      const total_volume = exercises.reduce((sum, ex) =>
        sum + ex.sets.reduce((setSum, set) =>
          setSum + (set.weight_kg || 0) * (set.reps || 0), 0), 0);
      return {
        id: s.id,
        username: usernameMap.get(s.user_id) || 'Unknown',
        session_date: s.session_date,
        name: s.name,
        started_at: s.started_at?.toISOString() || null,
        finished_at: s.finished_at?.toISOString() || null,
        exercises,
        total_volume: Math.round(total_volume),
      };
    });

    return res.status(200).json({ ok: true, sessions, teamMembers });
  } catch (error) {
    console.error('Error fetching shared gym sessions:', error);
    return res.status(500).json({ ok: false, error: 'Failed to fetch shared sessions' });
  }
}
