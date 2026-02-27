// pages/api/stats/[username]/flaps.ts
// API for fetching a user's shared Flaps history

import type { NextApiRequest, NextApiResponse } from 'next';
import { db, users, profiles, flapsLog } from '../../../../lib/db';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../../../lib/auth';

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateRangeFilter(dateRange: string, customStart?: string, customEnd?: string): { start: string | null; end: string | null } {
  const today = new Date();
  const todayStr = formatLocalDate(today);
  
  switch (dateRange) {
    case 'today':
      return { start: todayStr, end: todayStr };
    case 'week': {
      const last7Days = new Date(today);
      last7Days.setDate(today.getDate() - 6);
      return { start: formatLocalDate(last7Days), end: todayStr };
    }
    case 'month': {
      const last30Days = new Date(today);
      last30Days.setDate(today.getDate() - 29);
      return { start: formatLocalDate(last30Days), end: todayStr };
    }
    case 'custom':
      return { start: customStart || null, end: customEnd || null };
    default:
      return { start: null, end: null };
  }
}

interface FlapsEntry {
  id: string;
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

    // Check if user has sharing enabled (unless viewing own profile)
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
        });
      }
    }

    // Parse query params
    const dateRange = (req.query.dateRange as string) || 'all';
    const customStart = req.query.startDate as string | undefined;
    const customEnd = req.query.endDate as string | undefined;
    const exerciseMode = req.query.exerciseMode as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    // Build date filter
    const { start, end } = getDateRangeFilter(dateRange, customStart, customEnd);

    // Build conditions
    const conditions = [eq(flapsLog.user_id, targetUser.id)];
    
    if (start) {
      conditions.push(gte(flapsLog.entry_date, start));
    }
    if (end) {
      conditions.push(lte(flapsLog.entry_date, end));
    }
    if (exerciseMode && exerciseMode !== 'all') {
      conditions.push(eq(flapsLog.exercise_mode, exerciseMode));
    }

    // Fetch Flaps entries
    const flapsEntries = await db
      .select({
        id: flapsLog.id,
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

    // Format entries
    const entries: FlapsEntry[] = flapsEntries.map(entry => ({
      id: entry.id,
      entry_date: entry.entry_date,
      duration_minutes: entry.duration_minutes,
      avg_heart_rate: entry.avg_heart_rate,
      calories_burned: entry.calories_burned,
      exercise_mode: entry.exercise_mode,
      distance_km: entry.distance_km,
      custom_exercise: entry.custom_exercise,
      hiit_details: entry.hiit_details as FlapsEntry['hiit_details'],
      created_at: typeof entry.created_at === 'string' ? entry.created_at : entry.created_at?.toISOString() || '',
    }));

    // Calculate totals
    const totals = {
      totalDuration: entries.reduce((sum, e) => sum + e.duration_minutes, 0),
      totalCalories: entries.reduce((sum, e) => sum + (e.calories_burned || 0), 0),
      totalDistance: entries.reduce((sum, e) => sum + parseFloat(e.distance_km || '0'), 0),
      entryCount: entries.length,
    };

    return res.status(200).json({
      ok: true,
      entries,
      totals,
      username: targetUser.username,
      isOwnProfile,
    });
  } catch (error) {
    console.error('Error fetching user flaps:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
