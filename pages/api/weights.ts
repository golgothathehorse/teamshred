// pages/api/weights.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db, users, weights, profiles, banners } from '../../lib/db';
import { eq, and, asc, desc, inArray, ilike, sql } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../lib/auth';

// Calculate day flags from date string (YYYY-MM-DD)
function getDayFlags(dateStr: string): { is_monday: boolean; is_friday: boolean } {
  // Parse as UTC to avoid timezone issues
  const date = new Date(dateStr + 'T00:00:00Z');
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday
  return {
    is_monday: dayOfWeek === 1,
    is_friday: dayOfWeek === 5,
  };
}

type WeightRow = {
  id: string;
  user_id: string;
  weigh_date: string;
  weight_kg: number;
  inserted_at: string;
  is_monday: boolean;
  is_friday: boolean;
  comment?: string | null;
};

type ProfileData = {
  pb_weight_kg: number | null;
  pb_date: string | null;
};

type WeightsResponse =
  | { ok: true; weights?: WeightRow[]; weight?: WeightRow; profile?: ProfileData }
  | { ok: false; error: string };

async function recomputeProfilePb(
  userId: string
): Promise<{ pb_weight_kg: number | null; pb_date: string | null }> {
  const weightCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(weights)
    .where(eq(weights.user_id, userId));

  const totalWeights = weightCount[0]?.count ?? 0;

  if (totalWeights < 2) {
    const existingProfile = await db
      .select({ user_id: profiles.user_id })
      .from(profiles)
      .where(eq(profiles.user_id, userId))
      .limit(1);

    if (existingProfile.length > 0) {
      await db
        .update(profiles)
        .set({ pb_weight_kg: null, pb_date: null, updated_at: new Date() })
        .where(eq(profiles.user_id, userId));
    }

    return { pb_weight_kg: null, pb_date: null };
  }

  const minWeightRows = await db
    .select({ weight_kg: weights.weight_kg, weigh_date: weights.weigh_date })
    .from(weights)
    .where(eq(weights.user_id, userId))
    .orderBy(asc(weights.weight_kg), asc(weights.weigh_date))
    .limit(1);

  const minWeightRow = minWeightRows[0];
  const newPbWeight = minWeightRow?.weight_kg ? Number(minWeightRow.weight_kg) : null;
  const newPbDate = minWeightRow?.weigh_date ?? null;

  const existingProfile = await db
    .select({ user_id: profiles.user_id })
    .from(profiles)
    .where(eq(profiles.user_id, userId))
    .limit(1);

  const nowIso = new Date().toISOString();

  if (existingProfile.length > 0) {
    await db
      .update(profiles)
      .set({
        pb_weight_kg: newPbWeight?.toString() ?? null,
        pb_date: newPbDate,
        updated_at: new Date(),
      })
      .where(eq(profiles.user_id, userId));
  } else {
    await db.insert(profiles).values({
      user_id: userId,
      pb_weight_kg: newPbWeight?.toString() ?? null,
      pb_date: newPbDate,
      bf_percent: null,
      bf_date: null,
      goal_weight: null,
      goal_bf: null,
      updated_at: new Date(),
    });
  }

  return { pb_weight_kg: newPbWeight, pb_date: newPbDate };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WeightsResponse>
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

  if (req.method === 'GET') {
    return handleGet(req, res, session.id);
  }

  if (req.method === 'POST') {
    return handlePost(req, res, session.id, session.username, session.isAdmin);
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res, session.id);
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

async function handleGet(
  _req: NextApiRequest,
  res: NextApiResponse<WeightsResponse>,
  userId: string
) {
  try {
    const data = await db
      .select({
        id: weights.id,
        user_id: weights.user_id,
        weigh_date: weights.weigh_date,
        weight_kg: weights.weight_kg,
        inserted_at: weights.inserted_at,
        is_monday: weights.is_monday,
        is_friday: weights.is_friday,
        comment: weights.comment,
      })
      .from(weights)
      .where(eq(weights.user_id, userId))
      .orderBy(desc(weights.weigh_date))
      .limit(400);

    const profileData = await db
      .select({ pb_weight_kg: profiles.pb_weight_kg, pb_date: profiles.pb_date })
      .from(profiles)
      .where(eq(profiles.user_id, userId))
      .limit(1);

    const profile = profileData[0];

    const formattedWeights = data.map((w) => ({
      ...w,
      weight_kg: Number(w.weight_kg),
      inserted_at: w.inserted_at?.toISOString() ?? new Date().toISOString(),
      is_monday: w.is_monday ?? false,
      is_friday: w.is_friday ?? false,
    }));

    return res.status(200).json({
      ok: true,
      weights: formattedWeights,
      profile: profile
        ? {
            pb_weight_kg: profile.pb_weight_kg ? Number(profile.pb_weight_kg) : null,
            pb_date: profile.pb_date,
          }
        : { pb_weight_kg: null, pb_date: null },
    });
  } catch (error) {
    console.error('Weights GET error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse<WeightsResponse>,
  sessionUserId: string,
  sessionUsername: string,
  isAdmin: boolean
) {
  const {
    weightKg,
    weighDate,
    username: requestedUsernameRaw,
    comment: rawComment,
  } = req.body ?? {};

  const comment = rawComment ? String(rawComment).trim().slice(0, 500) : null;

  if (!weightKg || !weighDate) {
    return res.status(400).json({
      ok: false,
      error: 'weightKg and weighDate are required',
    });
  }

  const weightNum = Number(weightKg);
  if (!Number.isFinite(weightNum) || weightNum <= 0) {
    return res.status(400).json({ ok: false, error: 'weightKg must be a positive number' });
  }

  const dateStr = String(weighDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({
      ok: false,
      error: 'weighDate must be in YYYY-MM-DD format',
    });
  }

  let targetUserId = sessionUserId;
  let targetUsername = sessionUsername;

  const requestedUsername = requestedUsernameRaw
    ? String(requestedUsernameRaw).trim()
    : undefined;

  try {
    if (requestedUsername) {
      const requestedLower = requestedUsername.toLowerCase();
      const sessionLower = sessionUsername.toLowerCase();

      if (isAdmin) {
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
          return res.status(403).json({
            ok: false,
            error: 'Not allowed to log weight for that user',
          });
        }
      }
    }

    const existing = await db
      .select({ id: weights.id })
      .from(weights)
      .where(and(eq(weights.user_id, targetUserId), eq(weights.weigh_date, dateStr)))
      .limit(1);

    let weightId: string;

    // Calculate is_monday and is_friday flags from the date
    const dayFlags = getDayFlags(dateStr);

    if (existing.length > 0) {
      await db
        .update(weights)
        .set({
          weight_kg: weightNum.toString(),
          inserted_at: new Date(),
          comment: comment,
          is_monday: dayFlags.is_monday,
          is_friday: dayFlags.is_friday,
        })
        .where(eq(weights.id, existing[0].id));
      weightId = existing[0].id;
    } else {
      const inserted = await db
        .insert(weights)
        .values({
          user_id: targetUserId,
          weigh_date: dateStr,
          weight_kg: weightNum.toString(),
          inserted_at: new Date(),
          comment: comment,
          is_monday: dayFlags.is_monday,
          is_friday: dayFlags.is_friday,
        })
        .returning({ id: weights.id });
      weightId = inserted[0].id;
    }

    const savedWeights = await db
      .select({
        id: weights.id,
        user_id: weights.user_id,
        weigh_date: weights.weigh_date,
        weight_kg: weights.weight_kg,
        inserted_at: weights.inserted_at,
        is_monday: weights.is_monday,
        is_friday: weights.is_friday,
        comment: weights.comment,
      })
      .from(weights)
      .where(eq(weights.id, weightId))
      .limit(1);

    const savedWeight = savedWeights[0];

    const weightRecord: WeightRow = savedWeight
      ? {
          ...savedWeight,
          weight_kg: Number(savedWeight.weight_kg),
          inserted_at: savedWeight.inserted_at?.toISOString() ?? new Date().toISOString(),
          is_monday: savedWeight.is_monday ?? false,
          is_friday: savedWeight.is_friday ?? false,
        }
      : {
          id: weightId,
          user_id: targetUserId,
          weigh_date: dateStr,
          weight_kg: weightNum,
          inserted_at: new Date().toISOString(),
          is_monday: false,
          is_friday: false,
          comment: comment,
        };

    try {
      await updatePbAndBannerForWeight(
        targetUserId,
        targetUsername,
        sessionUserId,
        weightRecord
      );
    } catch (err) {
      console.error('PB update / banner error:', err);
    }

    return res.status(200).json({ ok: true, weight: weightRecord });
  } catch (error) {
    console.error('Weights POST error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to save weight' });
  }
}

async function updatePbAndBannerForWeight(
  targetUserId: string,
  targetUsername: string,
  loggerUserId: string,
  weight: WeightRow
) {
  const oldProfileData = await db
    .select({ pb_weight_kg: profiles.pb_weight_kg })
    .from(profiles)
    .where(eq(profiles.user_id, targetUserId))
    .limit(1);

  const oldProfile = oldProfileData[0];
  const oldPb = oldProfile?.pb_weight_kg ? Number(oldProfile.pb_weight_kg) : null;

  let newPbData: { pb_weight_kg: number | null; pb_date: string | null };
  try {
    newPbData = await recomputeProfilePb(targetUserId);
  } catch (err) {
    console.error('PB update: recompute error:', err);
    return;
  }

  const newPb = newPbData.pb_weight_kg;

  let shouldCreateBanner = false;

  if (oldPb === null && newPb !== null) {
    shouldCreateBanner = true;
  } else if (oldPb !== null && newPb !== null && newPb < oldPb) {
    shouldCreateBanner = true;
  }

  if (!shouldCreateBanner) {
    return;
  }

  const userRows = await db
    .select({ team_id: users.team_id })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  const userRow = userRows[0];
  const teamId = userRow?.team_id;

  if (!teamId) {
    return;
  }

  const message = `${targetUsername} hit a PB today!!`;

  await db.insert(banners).values({
    message,
    created_by: loggerUserId,
    type: 'pb',
    team_id: teamId,
  });
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse<WeightsResponse>,
  userId: string
) {
  const { ids } = req.body ?? {};

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'ids array is required',
    });
  }

  try {
    await db
      .delete(weights)
      .where(and(eq(weights.user_id, userId), inArray(weights.id, ids)));

    let updatedProfile: ProfileData | undefined;
    try {
      updatedProfile = await recomputeProfilePb(userId);
    } catch (err) {
      console.error('handleDelete: PB recomputation error:', err);
    }

    return res.status(200).json({ ok: true, profile: updatedProfile });
  } catch (error) {
    console.error('Weights DELETE error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}
