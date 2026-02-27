// pages/api/team/banners.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db, users, banners, userTeams, challenges, gymSessions, gymSessionExercises, gymSessionSets } from '../../../lib/db';
import { eq, and, desc, gte, isNotNull, inArray, or, sql, not } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../../lib/auth';

type Banner = {
  id: string;
  team_id: string | null;
  message: string;
  type: string;
  created_at: string;
  created_by: string | null;
};

type SuccessResponse = {
  ok: true;
  banners: Banner[];
};

type ErrorResponse = {
  ok: false;
  error: string;
};

type ResponseBody = SuccessResponse | ErrorResponse;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>
) {
  let sessionUser = parseSessionFromRequest(req);

  if (!sessionUser && process.env.TEST_BYPASS_AUTH === 'true') {
    sessionUser = {
      id: '7d921803-163b-4f6e-827f-4c3a94ba9efb',
      username: 'Nox',
      isAdmin: true,
    };
  }

  if (!sessionUser) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const userRows = await db
      .select({ active_team_id: users.active_team_id })
      .from(users)
      .where(eq(users.id, sessionUser.id))
      .limit(1);

    const userRow = userRows[0];

    if (!userRow || !userRow.active_team_id) {
      return res.status(403).json({ ok: false, error: 'You are not in a team' });
    }

    const teamId = userRow.active_team_id;

    const membership = await db
      .select({ team_id: userTeams.team_id })
      .from(userTeams)
      .where(and(eq(userTeams.user_id, sessionUser.id), eq(userTeams.team_id, teamId)))
      .limit(1);

    if (membership.length === 0) {
      return res.status(403).json({ ok: false, error: 'Not a member of this team' });
    }

    const data = await db
      .select({
        id: banners.id,
        team_id: banners.team_id,
        message: banners.message,
        type: banners.type,
        created_at: banners.created_at,
        created_by: banners.created_by,
      })
      .from(banners)
      .where(eq(banners.team_id, teamId))
      .orderBy(desc(banners.created_at))
      .limit(50);

    const formattedBanners = data.map((b) => ({
      ...b,
      created_at: b.created_at?.toISOString() ?? new Date().toISOString(),
    }));

    // Also pull today's completed challenges for the team
    const now = new Date();
    const sydneyOffset = 11;
    const sydneyNow = new Date(now.getTime() + sydneyOffset * 60 * 60 * 1000);
    const sydney5am = new Date(sydneyNow);
    sydney5am.setHours(5, 0, 0, 0);
    if (sydneyNow < sydney5am) {
      sydney5am.setDate(sydney5am.getDate() - 1);
    }
    const utc5amSydney = new Date(sydney5am.getTime() - sydneyOffset * 60 * 60 * 1000);

    const teamMembers = await db
      .select({ user_id: userTeams.user_id })
      .from(userTeams)
      .where(eq(userTeams.team_id, teamId));
    const memberIds = teamMembers.map((m) => m.user_id);

    const completedToday = await db
      .select({
        id: challenges.id,
        title: challenges.title,
        scope: challenges.scope,
        template_key: challenges.template_key,
        winner_user_id: challenges.winner_user_id,
        completed_at: challenges.completed_at,
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

    const challengeBanners: typeof formattedBanners = [];
    for (const c of completedToday) {
      const isLoneWolf = c.scope === 'solo' || c.scope === 'individual' || c.template_key === 'lone_flaps';
      const completedAt = c.completed_at?.toISOString() ?? new Date().toISOString();
      let message = '';
      let type = 'challenge_completed';

      if (c.winner_user_id && memberIds.includes(c.winner_user_id)) {
        const winnerRows = await db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, c.winner_user_id))
          .limit(1);
        const winnerName = winnerRows[0]?.username || 'Unknown';
        if (isLoneWolf) {
          message = `Mission Complete: ${c.title}`;
          type = 'challenge_completed';
        } else {
          message = `${winnerName} won: ${c.title}`;
          type = 'challenge_won';
        }
      } else {
        message = `Mission Complete: ${c.title}`;
        type = 'challenge_completed';
      }

      challengeBanners.push({
        id: c.id,
        team_id: teamId,
        message,
        type,
        created_at: completedAt,
        created_by: null,
      });
    }

    // Detect Iron Pumped (total session volume) PBs from today's completed sessions
    const ironBanners: typeof formattedBanners = [];
    try {
      const todaySessions = await db
        .select({ id: gymSessions.id, user_id: gymSessions.user_id, finished_at: gymSessions.finished_at })
        .from(gymSessions)
        .where(
          and(
            inArray(gymSessions.user_id, memberIds),
            eq(gymSessions.status, 'completed'),
            isNotNull(gymSessions.finished_at),
            gte(gymSessions.finished_at, utc5amSydney)
          )
        );

      if (todaySessions.length > 0) {
        const todaySessionIds = todaySessions.map(s => s.id);
        const todaySeshUserIds = Array.from(new Set(todaySessions.map(s => s.user_id)));

        const todayVolumes = await db
          .select({
            session_id: gymSessions.id,
            user_id: gymSessions.user_id,
            session_volume: sql<number>`SUM(COALESCE(${gymSessionSets.weight_kg}::numeric, 0) * COALESCE(${gymSessionSets.reps}, 0))`,
          })
          .from(gymSessions)
          .innerJoin(gymSessionExercises, eq(gymSessionExercises.session_id, gymSessions.id))
          .innerJoin(gymSessionSets, eq(gymSessionSets.session_exercise_id, gymSessionExercises.id))
          .where(inArray(gymSessions.id, todaySessionIds))
          .groupBy(gymSessions.id, gymSessions.user_id);

        const historicalMaxVol = await db
          .select({
            user_id: gymSessions.user_id,
            session_volume: sql<number>`SUM(COALESCE(${gymSessionSets.weight_kg}::numeric, 0) * COALESCE(${gymSessionSets.reps}, 0))`,
          })
          .from(gymSessions)
          .innerJoin(gymSessionExercises, eq(gymSessionExercises.session_id, gymSessions.id))
          .innerJoin(gymSessionSets, eq(gymSessionSets.session_exercise_id, gymSessionExercises.id))
          .where(
            and(
              inArray(gymSessions.user_id, todaySeshUserIds),
              eq(gymSessions.status, 'completed'),
              not(inArray(gymSessions.id, todaySessionIds))
            )
          )
          .groupBy(gymSessions.user_id, gymSessions.id);

        const prevMaxByUser = new Map<string, number>();
        for (const row of historicalMaxVol) {
          const vol = Number(row.session_volume) || 0;
          const prev = prevMaxByUser.get(row.user_id) || 0;
          if (vol > prev) prevMaxByUser.set(row.user_id, vol);
        }

        const usernameRows = await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, todaySeshUserIds));
        const usernameMap2 = new Map(usernameRows.map(u => [u.id, u.username]));

        for (const sesh of todayVolumes) {
          const vol = Number(sesh.session_volume) || 0;
          if (vol <= 0) continue;
          const prevMax = prevMaxByUser.get(sesh.user_id) || 0;
          if (vol > prevMax) {
            const username = usernameMap2.get(sesh.user_id) || 'Unknown';
            const prevText = prevMax > 0 ? ` (prev: ${Math.round(prevMax).toLocaleString()}kg)` : '';
            ironBanners.push({
              id: `iron_pb_${sesh.session_id}`,
              team_id: teamId,
              message: `${username} Iron Pumped PB: ${Math.round(vol).toLocaleString()}kg total volume${prevText}`,
              type: 'iron_pb',
              created_at: todaySessions.find(s => s.id === sesh.session_id)?.finished_at?.toISOString() ?? new Date().toISOString(),
              created_by: null,
            });
          }
        }
      }
    } catch (ironErr) {
      console.error('Iron PB detection error:', ironErr);
    }

    const allBanners = [...formattedBanners, ...challengeBanners, ...ironBanners].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const getAustralianDate = (date: Date): string => {
      const formatter = new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Sydney',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      const parts = formatter.formatToParts(date);
      const year = parts.find((p) => p.type === 'year')?.value || '';
      const month = parts.find((p) => p.type === 'month')?.value || '';
      const day = parts.find((p) => p.type === 'day')?.value || '';

      return `${year}-${month}-${day}`;
    };

    const todayStr = getAustralianDate(new Date());

    const filtered = allBanners.filter((b) => {
      if (b.type === 'manual') return true;
      if (b.type === 'challenge_completed' || b.type === 'challenge_won') return true;

      const created = new Date(b.created_at);
      if (Number.isNaN(created.getTime())) return false;

      const createdStr = getAustralianDate(created);
      const daysDiff = Math.floor(
        (new Date(todayStr + 'T00:00:00Z').getTime() - new Date(createdStr + 'T00:00:00Z').getTime()) /
          (1000 * 60 * 60 * 24)
      );

      if (b.type.startsWith('weekly_')) {
        return daysDiff >= 0 && daysDiff <= 2;
      }

      if (b.type.startsWith('weekend_')) {
        return daysDiff >= 0 && daysDiff <= 2;
      }

      return createdStr === todayStr;
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.status(200).json({ ok: true, banners: filtered });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Team banners error:', errorMessage, error);
    return res.status(500).json({ ok: false, error: `Database error: ${errorMessage}` });
  }
}
