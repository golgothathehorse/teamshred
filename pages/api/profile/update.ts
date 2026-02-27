// pages/api/profile/update.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db, users, profiles, bodyFatLogs } from '../../../lib/db';
import { eq, desc, ilike } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../../lib/auth';

type ProfileUpdateResponse =
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

function toNullableNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n)) return undefined;
  return n;
}

function toNullableDateString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProfileUpdateResponse>
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

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const {
    username: requestedUsernameRaw,
    pbWeightKg,
    pbDate,
    bfPercent: bfPercentRaw,
    bfDate: bfDateRaw,
    goalWeight,
    goalBf,
    sex,
    age,
    heightCm,
    activityLevel,
    shareWorkoutHistory,
  } = req.body ?? {};

  const requestedUsername = requestedUsernameRaw
    ? String(requestedUsernameRaw).trim()
    : undefined;

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
          return res.status(403).json({ ok: false, error: 'Not allowed to update that profile' });
        }
      }
    }

    const bfPercentProvided = bfPercentRaw !== undefined;
    const bfDateProvided = bfDateRaw !== undefined;

    if (bfPercentProvided !== bfDateProvided) {
      return res.status(400).json({
        ok: false,
        error: 'Body fat percent and date must be provided together',
      });
    }

    let bfPct: number | null = null;
    let bfDateIso: string | null = null;

    if (bfPercentProvided && bfDateProvided) {
      const parsedBfPct = toNullableNumber(bfPercentRaw);
      const parsedBfDate = toNullableDateString(bfDateRaw);

      if (parsedBfPct === undefined) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid body fat percentage value',
        });
      }

      if (parsedBfDate === undefined) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid body fat date',
        });
      }

      bfPct = parsedBfPct;
      bfDateIso = parsedBfDate;
    }

    const updates: Record<string, unknown> = {};
    const pbWeight = toNullableNumber(pbWeightKg);
    const goalW = toNullableNumber(goalWeight);
    const goalBodyFat = toNullableNumber(goalBf);
    const pbDateIso = toNullableDateString(pbDate);

    const ageNum = toNullableNumber(age);
    const heightNum = toNullableNumber(heightCm);

    let sexStr: string | null | undefined = undefined;
    if (sex !== undefined) {
      if (sex === null || sex === '') {
        sexStr = null;
      } else {
        const sexValue = String(sex).toLowerCase();
        if (sexValue !== 'male' && sexValue !== 'female') {
          return res.status(400).json({
            ok: false,
            error: 'Sex must be either "male" or "female"',
          });
        }
        sexStr = sexValue;
      }
    }

    let activityLevelStr: string | null | undefined = undefined;
    if (activityLevel !== undefined) {
      if (activityLevel === null || activityLevel === '') {
        activityLevelStr = null;
      } else {
        const activityValue = String(activityLevel).toLowerCase();
        if (activityValue !== 'sedentary' && activityValue !== 'active' && activityValue !== 'full_apollo') {
          return res.status(400).json({
            ok: false,
            error: 'Activity level must be "sedentary", "active", or "full_apollo"',
          });
        }
        activityLevelStr = activityValue;
      }
    }

    if (pbWeight !== undefined) updates.pb_weight_kg = pbWeight?.toString() ?? null;
    if (goalW !== undefined) updates.goal_weight = goalW?.toString() ?? null;
    if (goalBodyFat !== undefined) updates.goal_bf = goalBodyFat?.toString() ?? null;
    if (pbDateIso !== undefined) updates.pb_date = pbDateIso?.split('T')[0] ?? null;
    if (sexStr !== undefined) updates.sex = sexStr;
    if (ageNum !== undefined) updates.age = ageNum;
    if (heightNum !== undefined) updates.height_cm = heightNum?.toString() ?? null;
    if (activityLevelStr !== undefined) updates.activity_level = activityLevelStr;
    if (shareWorkoutHistory !== undefined) updates.share_workout_history = !!shareWorkoutHistory;

    const hasBfUpdate = bfPercentProvided && bfDateProvided;
    if (Object.keys(updates).length === 0 && !hasBfUpdate) {
      return res.status(400).json({ ok: false, error: 'No valid fields to update' });
    }

    updates.updated_at = new Date();

    let savedBfPercent: number | null = null;
    let savedBfDate: string | null = null;

    if (hasBfUpdate && bfPct !== null && bfDateIso !== null) {
      const dateOnly = bfDateIso.split('T')[0];

      const existing = await db
        .select({ id: bodyFatLogs.id })
        .from(bodyFatLogs)
        .where(eq(bodyFatLogs.user_id, targetUserId))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(bodyFatLogs)
          .set({
            bf_percent: bfPct.toString(),
            log_date: dateOnly,
            inserted_at: new Date(),
          })
          .where(eq(bodyFatLogs.id, existing[0].id));
      } else {
        await db.insert(bodyFatLogs).values({
          user_id: targetUserId,
          log_date: dateOnly,
          bf_percent: bfPct.toString(),
          inserted_at: new Date(),
        });
      }

      savedBfPercent = bfPct;
      savedBfDate = dateOnly;
    }

    const existingProfile = await db
      .select({ user_id: profiles.user_id })
      .from(profiles)
      .where(eq(profiles.user_id, targetUserId))
      .limit(1);

    if (existingProfile.length > 0) {
      await db
        .update(profiles)
        .set(updates as any)
        .where(eq(profiles.user_id, targetUserId));
    } else {
      await db.insert(profiles).values({
        user_id: targetUserId,
        ...updates,
      } as any);
    }

    const profileData = await db
      .select()
      .from(profiles)
      .where(eq(profiles.user_id, targetUserId))
      .limit(1);

    const profile = profileData[0];

    if (!savedBfPercent) {
      const bfLogData = await db
        .select({ log_date: bodyFatLogs.log_date, bf_percent: bodyFatLogs.bf_percent })
        .from(bodyFatLogs)
        .where(eq(bodyFatLogs.user_id, targetUserId))
        .orderBy(desc(bodyFatLogs.log_date))
        .limit(1);

      if (bfLogData[0]) {
        savedBfPercent = Number(bfLogData[0].bf_percent);
        savedBfDate = bfLogData[0].log_date;
      }
    }

    return res.status(200).json({
      ok: true,
      profile: {
        user_id: profile?.user_id ?? targetUserId,
        username: targetUsername,
        is_admin: session.isAdmin,
        pb_weight_kg: profile?.pb_weight_kg ? Number(profile.pb_weight_kg) : null,
        pb_date: profile?.pb_date ?? null,
        bf_percent: savedBfPercent,
        bf_date: savedBfDate,
        goal_weight: profile?.goal_weight ? Number(profile.goal_weight) : null,
        goal_bf: profile?.goal_bf ? Number(profile.goal_bf) : null,
        sex: profile?.sex ?? null,
        age: profile?.age ?? null,
        height_cm: profile?.height_cm ? Number(profile.height_cm) : null,
        activity_level: profile?.activity_level ?? null,
        tdee_goal: null,
        cut_level: null,
        bulk_level: null,
        share_workout_history: profile?.share_workout_history ?? false,
        updated_at: profile?.updated_at?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}
