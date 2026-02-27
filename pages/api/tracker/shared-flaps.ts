// pages/api/tracker/shared-flaps.ts
// API for fetching team members' shared Flaps history

import type { NextApiRequest, NextApiResponse } from 'next';
import { db, users, profiles, flapsLog, userTeams } from '../../../lib/db';
import { eq, desc, and, inArray, gte, lte } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../../lib/auth';
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

interface FlapsEntry {
  id: string;
  username: string;
  entry_date: string;
  duration_minutes: number;
  avg_heart_rate: number | null;
  calories_burned: number | null;
  exercise_mode: string;
  distance_km: string | null;
  custom_exercise: string | null;
  hiit_details: {
    rounds?: number;
    work_seconds?: number;
    rest_seconds?: number;
    exercises?: string;
  } | null;
  created_at: string;
}

type ApiResponse = 
  | { ok: true; entries: FlapsEntry[]; teamMembers: { username: string; shareEnabled: boolean }[] }
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
      return res.status(200).json({ ok: true, entries: [], teamMembers: [] });
    }

    // Get all team members
    const teamMemberships = await db
      .select({ user_id: userTeams.user_id })
      .from(userTeams)
      .where(eq(userTeams.team_id, activeTeamId));

    const teamMemberIds = teamMemberships.map(m => m.user_id);

    if (teamMemberIds.length === 0) {
      return res.status(200).json({ ok: true, entries: [], teamMembers: [] });
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
        return res.status(200).json({ ok: true, entries: [], teamMembers });
      }
    }

    if (sharingEnabledIds.length === 0) {
      return res.status(200).json({ ok: true, entries: [], teamMembers });
    }

    // Parse date range filter
    const dateRange = req.query.dateRange as string || 'all';
    const customStart = req.query.startDate as string;
    const customEnd = req.query.endDate as string;
    const { start, end } = getDateRangeFilter(dateRange, customStart, customEnd);

    // Fetch Flaps entries from users who have sharing enabled
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    // Build conditions array
    const conditions = [inArray(flapsLog.user_id, sharingEnabledIds)];
    if (start) {
      conditions.push(gte(flapsLog.entry_date, start));
    }
    if (end) {
      conditions.push(lte(flapsLog.entry_date, end));
    }

    const flapsEntries = await db
      .select({
        id: flapsLog.id,
        user_id: flapsLog.user_id,
        entry_date: flapsLog.entry_date,
        duration_minutes: flapsLog.duration_minutes,
        avg_heart_rate: flapsLog.avg_heart_rate,
        calories_burned: flapsLog.calories_burned,
        exercise_mode: flapsLog.exercise_mode,
        distance_km: flapsLog.distance_km,
        custom_exercise: flapsLog.custom_exercise,
        hiit_details: flapsLog.hiit_details,
        created_at: flapsLog.created_at,
      })
      .from(flapsLog)
      .where(and(...conditions))
      .orderBy(desc(flapsLog.entry_date), desc(flapsLog.created_at))
      .limit(limit);

    const entries: FlapsEntry[] = flapsEntries.map(entry => ({
      id: entry.id,
      username: usernameMap.get(entry.user_id) || 'Unknown',
      entry_date: entry.entry_date,
      duration_minutes: entry.duration_minutes,
      avg_heart_rate: entry.avg_heart_rate,
      calories_burned: entry.calories_burned,
      exercise_mode: entry.exercise_mode || 'Unknown',
      distance_km: entry.distance_km,
      custom_exercise: entry.custom_exercise,
      hiit_details: entry.hiit_details as FlapsEntry['hiit_details'],
      created_at: entry.created_at?.toISOString() || new Date().toISOString(),
    }));

    return res.status(200).json({ ok: true, entries, teamMembers });
  } catch (error) {
    console.error('Error fetching shared flaps history:', error);
    return res.status(500).json({ ok: false, error: 'Failed to fetch shared history' });
  }
}
