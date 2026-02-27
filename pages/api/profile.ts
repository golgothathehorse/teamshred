// pages/api/profile.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db, users, profiles, bodyFatLogs } from '../../lib/db';
import { eq, desc, ilike } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../lib/auth';

type ProfileResponse =
  | {
      ok: true;
      profile: {
        user_id: string;
        username: string;
        is_admin: boolean;
        pb_weight_kg: number | null;
        pb_date: string | null;
        bf_percent: number | null;
        bf_date: string | null;
        goal_weight: number | null;
        goal_bf: number | null;
        sex: string | null;
        age: number | null;
        height_cm: number | null;
        activity_level: string | null;
        tdee_goal: string | null;
        cut_level: string | null;
        bulk_level: string | null;
        share_workout_history: boolean;
        updated_at: string | null;
      };
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProfileResponse>
) {
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

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const requestedUsernameRaw = req.query.username as string | undefined;
  const requestedUsername = requestedUsernameRaw?.trim();

  let targetUserId = session.id;
  let targetUsername = session.username;

  try {
    if (requestedUsername) {
      const requestedLower = requestedUsername.toLowerCase();
      const sessionLower = session.username.toLowerCase();

      if (session.isAdmin) {
        const otherUsers = await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(ilike(users.username, requestedUsername))
          .limit(1);

        const otherUser = otherUsers[0];

        if (!otherUser) {
          return res.status(404).json({ ok: false, error: 'User not found' });
        }

        targetUserId = otherUser.id;
        targetUsername = otherUser.username;
      } else {
        if (requestedLower !== sessionLower) {
          return res.status(403).json({ ok: false, error: 'Not allowed to view that profile' });
        }
      }
    }

    const [profileData, bfLogData] = await Promise.all([
      db
        .select()
        .from(profiles)
        .where(eq(profiles.user_id, targetUserId))
        .limit(1),
      db
        .select({ log_date: bodyFatLogs.log_date, bf_percent: bodyFatLogs.bf_percent })
        .from(bodyFatLogs)
        .where(eq(bodyFatLogs.user_id, targetUserId))
        .orderBy(desc(bodyFatLogs.log_date))
        .limit(1),
    ]);

    const profile = profileData[0];
    const bfLog = bfLogData[0];

    const payload = profile ?? {
      user_id: targetUserId,
      pb_weight_kg: null,
      pb_date: null,
      goal_weight: null,
      goal_bf: null,
      sex: null,
      age: null,
      height_cm: null,
      activity_level: null,
      updated_at: null,
      share_workout_history: false,
      shredulator_settings: null,
    };

    const shareWorkoutHistory = payload.share_workout_history ?? false;

    return res.status(200).json({
      ok: true,
      profile: {
        user_id: payload.user_id,
        username: targetUsername,
        is_admin: session.isAdmin,
        pb_weight_kg: payload.pb_weight_kg ? Number(payload.pb_weight_kg) : null,
        pb_date: payload.pb_date,
        bf_percent: bfLog?.bf_percent ? Number(bfLog.bf_percent) : null,
        bf_date: bfLog?.log_date ?? null,
        goal_weight: payload.goal_weight ? Number(payload.goal_weight) : null,
        goal_bf: payload.goal_bf ? Number(payload.goal_bf) : null,
        sex: payload.sex,
        age: payload.age,
        height_cm: payload.height_cm ? Number(payload.height_cm) : null,
        activity_level: payload.activity_level,
        tdee_goal: null,
        cut_level: null,
        bulk_level: null,
        share_workout_history: shareWorkoutHistory,
        updated_at: payload.updated_at?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error('Profile: database error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}
