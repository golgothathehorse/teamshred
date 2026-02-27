// pages/api/warzone/shared-activities.ts
// API for fetching team members' shared activity history

import type { NextApiRequest, NextApiResponse } from 'next';
import { db, users, profiles, activityLog, exerciseTypes, userTeams } from '../../../lib/db';
import { eq, desc, asc, inArray, and, gte, lte } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../../lib/auth';
import { getUnitLabel } from '../../../lib/exercises';
import { getSydneyDateString } from '../../../lib/dateUtils';

function getDateRangeFilter(dateRange: string, customStart?: string, customEnd?: string): { start: string | null; end: string | null } {
  const todayStr = getSydneyDateString();
  
  switch (dateRange) {
    case 'today':
      return { start: todayStr, end: todayStr };
    case 'week': {
      // Rolling last 7 days (including today) - Sydney time
      // Parse todayStr back into a date to get correct Sydney date baseline
      const [year, month, day] = todayStr.split('-').map(Number);
      const sydneyToday = new Date(year, month - 1, day);
      const last7Days = new Date(sydneyToday);
      last7Days.setDate(sydneyToday.getDate() - 6);
      const startStr = `${last7Days.getFullYear()}-${String(last7Days.getMonth() + 1).padStart(2, '0')}-${String(last7Days.getDate()).padStart(2, '0')}`;
      return { start: startStr, end: todayStr };
    }
    case 'month': {
      // Rolling last 30 days (including today) - Sydney time
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

interface ActivityEntry {
  id: string;
  username: string;
  value: number;
  entry_date: string;
  created_at: string;
  exercise_types: {
    id: string;
    name: string;
    unit_type: string;
    unit_label: string;
  };
}

type ApiResponse = 
  | { ok: true; activities: ActivityEntry[]; teamMembers: { username: string; shareEnabled: boolean }[] }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
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
    // Get the user's active team
    const currentUser = await db
      .select({ active_team_id: users.active_team_id })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    const activeTeamId = currentUser[0]?.active_team_id;

    if (!activeTeamId) {
      return res.status(200).json({ ok: true, activities: [], teamMembers: [] });
    }

    // Get all team members
    const teamMemberships = await db
      .select({ user_id: userTeams.user_id })
      .from(userTeams)
      .where(eq(userTeams.team_id, activeTeamId));

    const teamMemberIds = teamMemberships.map(m => m.user_id);

    if (teamMemberIds.length === 0) {
      return res.status(200).json({ ok: true, activities: [], teamMembers: [] });
    }

    // Get usernames and sharing status for team members
    const teamMemberData = await db
      .select({
        user_id: users.id,
        username: users.username,
      })
      .from(users)
      .where(inArray(users.id, teamMemberIds));

    const teamProfiles = await db
      .select({
        user_id: profiles.user_id,
        share_workout_history: profiles.share_workout_history,
      })
      .from(profiles)
      .where(inArray(profiles.user_id, teamMemberIds));

    const profileMap = new Map(teamProfiles.map(p => [p.user_id, p.share_workout_history ?? false]));
    const usernameMap = new Map(teamMemberData.map(u => [u.user_id, u.username]));

    const teamMembers = teamMemberData.map(u => ({
      username: u.username,
      shareEnabled: profileMap.get(u.user_id) ?? false,
    }));

    // Get user IDs who have sharing enabled (including current user if they have sharing enabled)
    let sharingEnabledIds = teamMemberIds.filter(id => 
      profileMap.get(id) ?? false
    );

    // Filter by username if specified
    const usernameFilter = req.query.username as string;
    if (usernameFilter && usernameFilter !== 'all') {
      const filteredUser = teamMemberData.find(u => u.username === usernameFilter);
      if (filteredUser && sharingEnabledIds.includes(filteredUser.user_id)) {
        sharingEnabledIds = [filteredUser.user_id];
      } else {
        return res.status(200).json({ ok: true, activities: [], teamMembers });
      }
    }

    if (sharingEnabledIds.length === 0) {
      return res.status(200).json({ ok: true, activities: [], teamMembers });
    }

    // Fetch exercise types
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

    const exerciseTypesById = new Map(allExerciseTypes.map(et => [et.id, et]));

    // Parse date range filter
    const dateRange = req.query.dateRange as string || 'all';
    const customStart = req.query.startDate as string;
    const customEnd = req.query.endDate as string;
    const { start, end } = getDateRangeFilter(dateRange, customStart, customEnd);

    // Fetch activity log entries from users who have sharing enabled
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    // Build conditions array
    const conditions = [inArray(activityLog.user_id, sharingEnabledIds)];
    if (start) {
      conditions.push(gte(activityLog.entry_date, start));
    }
    if (end) {
      conditions.push(lte(activityLog.entry_date, end));
    }

    const activityEntries = await db
      .select({
        id: activityLog.id,
        user_id: activityLog.user_id,
        value: activityLog.value,
        entry_date: activityLog.entry_date,
        created_at: activityLog.created_at,
        exercise_type_id: activityLog.exercise_type_id,
      })
      .from(activityLog)
      .where(and(...conditions))
      .orderBy(desc(activityLog.entry_date), desc(activityLog.created_at))
      .limit(limit);

    const activities: ActivityEntry[] = activityEntries.map(entry => {
      const exerciseType = exerciseTypesById.get(entry.exercise_type_id);
      return {
        id: entry.id,
        username: usernameMap.get(entry.user_id) || 'Unknown',
        value: Number(entry.value),
        entry_date: entry.entry_date,
        created_at: entry.created_at?.toISOString() || new Date().toISOString(),
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

    return res.status(200).json({ ok: true, activities, teamMembers });
  } catch (error) {
    console.error('Error fetching shared activities:', error);
    return res.status(500).json({ ok: false, error: 'Failed to fetch shared activities' });
  }
}
