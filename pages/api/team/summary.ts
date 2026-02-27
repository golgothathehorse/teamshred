// pages/api/team/summary.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db, users, weights, profiles, banners, userTeams } from '../../../lib/db';
import { eq, and, asc, gte, lt, inArray } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../../lib/auth';

type MemberSummary = {
  id: string;
  username: string;
  latestWeight: number | null;
  latestDate: string | null;
  latestComment: string | null;
  pbWeight: number | null;
  weeklyChange: number | null;
  weeklyStartDate: string | null;
  weeklyEndDate: string | null;
  weeklyStatus: 'ripper_week' | 'pisscutter_week' | null;
  weekendStatus: 'massive_blowout' | 'minor_blowout' | 'decent' | 'solid' | 'epic' | null;
  weekendWeightChange: number | null;
  weekendStartDate: string | null;
  weekendEndDate: string | null;
};

type TeamSummaryResponse =
  | { ok: true; members: MemberSummary[] }
  | { ok: false; error: string };

type WeekendBannerType = 'weekend_massive_blowout' | 'weekend_minor_blowout' | 'weekend_decent' | 'weekend_solid' | 'weekend_epic';
type WeeklyBannerType = 'weekly_ripper' | 'weekly_pisscutter';
type BannerCandidateType = WeekendBannerType | WeeklyBannerType;

type BannerCandidate = {
  userId: string;
  username: string;
  type: BannerCandidateType;
  message: string;
};

function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1 + 'T00:00:00Z');
  const d2 = new Date(date2 + 'T00:00:00Z');
  const diffMs = d2.getTime() - d1.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

async function insertBannersForToday(teamId: string, candidates: BannerCandidate[]) {
  if (candidates.length === 0) return;

  const uniqueUserIds = Array.from(new Set(candidates.map((c) => c.userId)));

  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const startOfTomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));

  try {
    const existing = await db
      .select({ created_by: banners.created_by, type: banners.type })
      .from(banners)
      .where(
        and(
          eq(banners.team_id, teamId),
          gte(banners.created_at, startOfToday),
          lt(banners.created_at, startOfTomorrow),
          inArray(banners.created_by, uniqueUserIds)
        )
      );

    const existingKeys = new Set<string>();
    for (const row of existing) {
      existingKeys.add(`${row.created_by}:${row.type}`);
    }

    for (const candidate of candidates) {
      const key = `${candidate.userId}:${candidate.type}`;
      if (existingKeys.has(key)) {
        continue;
      }

      await db.insert(banners).values({
        team_id: teamId,
        created_by: candidate.userId,
        message: candidate.message,
        type: candidate.type,
      });
    }
  } catch (error) {
    console.error('Banners: error inserting banner:', error);
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TeamSummaryResponse>
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

    const membership = await db
      .select({ team_id: userTeams.team_id })
      .from(userTeams)
      .where(and(eq(userTeams.user_id, session.id), eq(userTeams.team_id, teamId)))
      .limit(1);

    if (membership.length === 0) {
      return res.status(403).json({ ok: false, error: 'Not a member of this team' });
    }

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

    const allWeights = await db
      .select({
        user_id: weights.user_id,
        weigh_date: weights.weigh_date,
        weight_kg: weights.weight_kg,
        is_monday: weights.is_monday,
        is_friday: weights.is_friday,
        comment: weights.comment,
      })
      .from(weights)
      .where(inArray(weights.user_id, memberIds))
      .orderBy(asc(weights.weigh_date));

    const allProfiles = await db
      .select({ user_id: profiles.user_id, pb_weight_kg: profiles.pb_weight_kg })
      .from(profiles)
      .where(inArray(profiles.user_id, memberIds));

    const weightsByUser = new Map<string, typeof allWeights>();
    for (const m of memberIds) {
      weightsByUser.set(m, []);
    }
    for (const w of allWeights) {
      const arr = weightsByUser.get(w.user_id);
      if (arr) arr.push(w);
    }

    const pbByUser = new Map<string, number | null>();
    for (const m of memberIds) {
      pbByUser.set(m, null);
    }
    for (const p of allProfiles) {
      if (pbByUser.has(p.user_id)) {
        pbByUser.set(p.user_id, p.pb_weight_kg ? Number(p.pb_weight_kg) : null);
      }
    }

    const todayDate = new Date().toISOString().slice(0, 10);
    const bannerCandidates: BannerCandidate[] = [];

    const members: MemberSummary[] = teamMembers.map((m) => {
      const userWeights = weightsByUser.get(m.id) ?? [];
      const pbWeight = pbByUser.get(m.id) ?? null;

      let latestWeight: number | null = null;
      let latestDate: string | null = null;
      let latestComment: string | null = null;
      if (userWeights.length > 0) {
        const last = userWeights[userWeights.length - 1];
        latestWeight = Number(last.weight_kg);
        latestDate = last.weigh_date;
        latestComment = last.comment || null;
      }

      const fridayWeights = userWeights.filter((w) => w.is_friday);
      let weeklyChange: number | null = null;
      let weeklyStartDate: string | null = null;
      let weeklyEndDate: string | null = null;
      let weeklyStatus: 'ripper_week' | 'pisscutter_week' | null = null;

      if (fridayWeights.length >= 2) {
        const lastFriday = fridayWeights[fridayWeights.length - 1];
        const prevFriday = fridayWeights[fridayWeights.length - 2];

        const daysDiff = daysBetween(prevFriday.weigh_date, lastFriday.weigh_date);
        if (daysDiff >= 6 && daysDiff <= 8) {
          weeklyChange = Number(lastFriday.weight_kg) - Number(prevFriday.weight_kg);
          weeklyStartDate = prevFriday.weigh_date;
          weeklyEndDate = lastFriday.weigh_date;

          if (weeklyChange < 0) {
            const loss = Math.abs(weeklyChange);

            if (loss <= 1.0) {
              weeklyStatus = 'ripper_week';
              if (lastFriday.weigh_date === todayDate) {
                bannerCandidates.push({
                  userId: m.id,
                  username: m.username,
                  type: 'weekly_ripper',
                  message: `${m.username} had a Ripper Week! (${loss.toFixed(1)}kg lost)`,
                });
              }
            } else {
              weeklyStatus = 'pisscutter_week';
              if (lastFriday.weigh_date === todayDate) {
                bannerCandidates.push({
                  userId: m.id,
                  username: m.username,
                  type: 'weekly_pisscutter',
                  message: `${m.username} had a Pisscutter Week!!! (${loss.toFixed(1)}kg lost)`,
                });
              }
            }
          }
        }
      }

      const mondayWeights = userWeights.filter((w) => w.is_monday);
      let weekendStatus: 'massive_blowout' | 'minor_blowout' | 'decent' | 'solid' | 'epic' | null = null;
      let weekendWeightChange: number | null = null;
      let weekendStartDate: string | null = null;
      let weekendEndDate: string | null = null;

      if (mondayWeights.length > 0 && fridayWeights.length > 0) {
        const lastMonday = mondayWeights[mondayWeights.length - 1];

        const precedingFridays = fridayWeights.filter((f) => f.weigh_date < lastMonday.weigh_date);

        if (precedingFridays.length > 0) {
          const precedingFriday = precedingFridays[precedingFridays.length - 1];

          const daysDiff = daysBetween(precedingFriday.weigh_date, lastMonday.weigh_date);

          if (daysDiff >= 3 && daysDiff <= 4) {
            const fridayWeight = Number(precedingFriday.weight_kg);
            const mondayWeight = Number(lastMonday.weight_kg);
            const diff = mondayWeight - fridayWeight;

            const mondayDate = lastMonday.weigh_date;

            weekendStartDate = precedingFriday.weigh_date;
            weekendEndDate = lastMonday.weigh_date;

            if (diff >= 3.0) {
              weekendStatus = 'massive_blowout';
              weekendWeightChange = diff;

              if (mondayDate === todayDate) {
                bannerCandidates.push({
                  userId: m.id,
                  username: m.username,
                  type: 'weekend_massive_blowout',
                  message: `${m.username} had a Massive Blow Out!! (+${diff.toFixed(1)}kg)`,
                });
              }
            } else if (diff >= 2.0) {
              weekendStatus = 'minor_blowout';
              weekendWeightChange = diff;

              if (mondayDate === todayDate) {
                bannerCandidates.push({
                  userId: m.id,
                  username: m.username,
                  type: 'weekend_minor_blowout',
                  message: `${m.username} had a Minor Blow Out (+${diff.toFixed(1)}kg)`,
                });
              }
            } else if (diff >= 1.0) {
              weekendStatus = 'decent';
              weekendWeightChange = diff;

              if (mondayDate === todayDate) {
                bannerCandidates.push({
                  userId: m.id,
                  username: m.username,
                  type: 'weekend_decent',
                  message: `${m.username} had a Decent Weekend (+${diff.toFixed(1)}kg)`,
                });
              }
            } else if (diff >= 0) {
              weekendStatus = 'solid';
              weekendWeightChange = diff;

              if (mondayDate === todayDate) {
                bannerCandidates.push({
                  userId: m.id,
                  username: m.username,
                  type: 'weekend_solid',
                  message: `${m.username} had a Solid Weekend (+${diff.toFixed(1)}kg)`,
                });
              }
            } else {
              weekendStatus = 'epic';
              weekendWeightChange = diff;

              if (mondayDate === todayDate) {
                bannerCandidates.push({
                  userId: m.id,
                  username: m.username,
                  type: 'weekend_epic',
                  message: `${m.username} had an Epic Weekend! (${Math.abs(diff).toFixed(1)}kg lost)`,
                });
              }
            }
          }
        }
      }

      return {
        id: m.id,
        username: m.username,
        latestWeight,
        latestDate,
        latestComment,
        pbWeight,
        weeklyChange,
        weeklyStartDate,
        weeklyEndDate,
        weeklyStatus,
        weekendStatus,
        weekendWeightChange,
        weekendStartDate,
        weekendEndDate,
      };
    });

    try {
      await insertBannersForToday(teamId, bannerCandidates);
    } catch (e) {
      console.error('Banners: unexpected error inserting:', e);
    }

    return res.status(200).json({ ok: true, members });
  } catch (error) {
    console.error('Team summary error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}
