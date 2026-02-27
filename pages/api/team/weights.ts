// pages/api/team/weights.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db, users, weights, bodyFatLogs, waistLogs, profiles, userTeams } from '../../../lib/db';
import { eq, desc, inArray } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../../lib/auth';

type WeightEntry = {
  id: string;
  user_id: string;
  weigh_date: string;
  weight_kg: number;
  inserted_at: string;
  is_monday: boolean;
  is_friday: boolean;
};

type BodyFatEntry = {
  id: string;
  user_id: string;
  log_date: string;
  bf_percent: number;
  inserted_at: string;
};

type WaistEntry = {
  id: string;
  user_id: string;
  log_date: string;
  waist_cm: number;
  inserted_at: string;
};

type SharedJournals = {
  training: boolean | string[];
  diet: boolean | string[];
  supplements: boolean | string[];
  stack: boolean | string[];
};

function isCategorySharedWithTeam(value: boolean | string[] | undefined, teamId: string): boolean {
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.includes(teamId);
  return false;
}

type MemberData = {
  user_id: string;
  username: string;
  weights: WeightEntry[];
  bodyFatLogs: BodyFatEntry[];
  waistLogs: WaistEntry[];
  goal_weight: number | null;
  goal_bf: number | null;
  pb_weight_kg: number | null;
  pb_date: string | null;
  sharedJournals: SharedJournals;
};

type TeamWeightsResponse =
  | { ok: true; members: MemberData[] }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TeamWeightsResponse>
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

  try {
    const userRows = await db
      .select({ active_team_id: users.active_team_id })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    const userRow = userRows[0];

    if (!userRow || !userRow.active_team_id) {
      return res.status(403).json({ ok: false, error: 'You are not in a team' });
    }

    const teamId = userRow.active_team_id;

    const userTeamsData = await db
      .select({ user_id: userTeams.user_id })
      .from(userTeams)
      .where(eq(userTeams.team_id, teamId));

    const memberIds = userTeamsData.map((ut) => ut.user_id);

    if (memberIds.length === 0) {
      return res.status(200).json({ ok: true, members: [] });
    }

    const teamMembers = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, memberIds));

    if (teamMembers.length === 0) {
      return res.status(200).json({ ok: true, members: [] });
    }

    const memberDataPromises = teamMembers.map(async (member) => {
      const [memberWeights, memberBf, memberWaist, memberProfile] = await Promise.all([
        db
          .select({
            id: weights.id,
            user_id: weights.user_id,
            weigh_date: weights.weigh_date,
            weight_kg: weights.weight_kg,
            inserted_at: weights.inserted_at,
            is_monday: weights.is_monday,
            is_friday: weights.is_friday,
          })
          .from(weights)
          .where(eq(weights.user_id, member.id))
          .orderBy(desc(weights.weigh_date))
          .limit(400),
        db
          .select({
            id: bodyFatLogs.id,
            user_id: bodyFatLogs.user_id,
            log_date: bodyFatLogs.log_date,
            bf_percent: bodyFatLogs.bf_percent,
            inserted_at: bodyFatLogs.inserted_at,
          })
          .from(bodyFatLogs)
          .where(eq(bodyFatLogs.user_id, member.id))
          .orderBy(desc(bodyFatLogs.log_date))
          .limit(400),
        db
          .select({
            id: waistLogs.id,
            user_id: waistLogs.user_id,
            log_date: waistLogs.log_date,
            waist_cm: waistLogs.waist_cm,
            inserted_at: waistLogs.inserted_at,
          })
          .from(waistLogs)
          .where(eq(waistLogs.user_id, member.id))
          .orderBy(desc(waistLogs.log_date))
          .limit(400),
        db
          .select({
            goal_weight: profiles.goal_weight,
            goal_bf: profiles.goal_bf,
            pb_weight_kg: profiles.pb_weight_kg,
            pb_date: profiles.pb_date,
            shredulator_settings: profiles.shredulator_settings,
          })
          .from(profiles)
          .where(eq(profiles.user_id, member.id))
          .limit(1),
      ]);

      const profile = memberProfile[0];
      const settings = profile?.shredulator_settings as any;
      const rawSharing = settings?.shared_journals || {};

      const sharedJournals: SharedJournals = {
        training: isCategorySharedWithTeam(rawSharing.training, teamId),
        diet: isCategorySharedWithTeam(rawSharing.diet, teamId),
        supplements: isCategorySharedWithTeam(rawSharing.supplements, teamId),
        stack: isCategorySharedWithTeam(rawSharing.stack, teamId),
      };

      return {
        user_id: member.id,
        username: member.username,
        weights: memberWeights.map((w) => ({
          ...w,
          weight_kg: Number(w.weight_kg),
          inserted_at: w.inserted_at?.toISOString() ?? new Date().toISOString(),
          is_monday: w.is_monday ?? false,
          is_friday: w.is_friday ?? false,
        })),
        bodyFatLogs: memberBf.map((bf) => ({
          ...bf,
          bf_percent: Number(bf.bf_percent),
          inserted_at: bf.inserted_at?.toISOString() ?? new Date().toISOString(),
        })),
        waistLogs: memberWaist.map((wl) => ({
          ...wl,
          waist_cm: Number(wl.waist_cm),
          inserted_at: wl.inserted_at?.toISOString() ?? new Date().toISOString(),
        })),
        goal_weight: profile?.goal_weight ? Number(profile.goal_weight) : null,
        goal_bf: profile?.goal_bf ? Number(profile.goal_bf) : null,
        pb_weight_kg: profile?.pb_weight_kg ? Number(profile.pb_weight_kg) : null,
        pb_date: profile?.pb_date ?? null,
        sharedJournals,
      };
    });

    const membersData = await Promise.all(memberDataPromises);

    return res.status(200).json({ ok: true, members: membersData });
  } catch (error) {
    console.error('Team weights error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}
