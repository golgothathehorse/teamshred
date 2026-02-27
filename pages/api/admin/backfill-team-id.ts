import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, challenges, users, challengeParticipants, userTeams, teams } from '../../../lib/db';
import { eq, inArray } from 'drizzle-orm';

async function determineTeamForChallenge(challengeId: string, creatorId: string | null): Promise<string | null> {
  const participants = await db
    .select({ user_id: challengeParticipants.user_id })
    .from(challengeParticipants)
    .where(eq(challengeParticipants.challenge_id, challengeId));

  const participantIds = participants.map(p => p.user_id);

  if (participantIds.length > 0) {
    const participantTeamRows = await db
      .select({ user_id: userTeams.user_id, team_id: userTeams.team_id })
      .from(userTeams)
      .where(inArray(userTeams.user_id, participantIds));

    const teamCounts = new Map<string, number>();
    for (const pt of participantTeamRows) {
      teamCounts.set(pt.team_id, (teamCounts.get(pt.team_id) || 0) + 1);
    }

    let bestTeam: string | null = null;
    let bestCount = 0;
    for (const [teamId, count] of teamCounts.entries()) {
      if (count > bestCount) {
        bestCount = count;
        bestTeam = teamId;
      }
    }
    if (bestTeam) return bestTeam;
  }

  if (creatorId) {
    const creatorTeams = await db
      .select({ team_id: userTeams.team_id })
      .from(userTeams)
      .where(eq(userTeams.user_id, creatorId));
    if (creatorTeams.length === 1) {
      return creatorTeams[0].team_id;
    }
  }

  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await parseSessionFromRequest(req);
  if (!session || session.username?.toLowerCase() !== 'nox') {
    return res.status(403).json({ error: 'Admin only' });
  }

  if (req.method === 'GET') {
    const allChallenges = await db
      .select({
        id: challenges.id,
        title: challenges.title,
        scope: challenges.scope,
        status: challenges.status,
        team_id: challenges.team_id,
        created_by_user_id: challenges.created_by_user_id,
      })
      .from(challenges);

    const results = [];
    for (const c of allChallenges) {
      const correctTeamId = await determineTeamForChallenge(c.id, c.created_by_user_id);
      const needsFix = correctTeamId && c.team_id !== correctTeamId;
      if (needsFix) {
        const currentTeamRows = c.team_id
          ? await db.select({ name: teams.name }).from(teams).where(eq(teams.id, c.team_id)).limit(1)
          : [];
        const correctTeamRows = correctTeamId
          ? await db.select({ name: teams.name }).from(teams).where(eq(teams.id, correctTeamId)).limit(1)
          : [];
        results.push({
          id: c.id,
          title: c.title,
          scope: c.scope,
          current_team: currentTeamRows[0]?.name || c.team_id || 'NULL',
          correct_team: correctTeamRows[0]?.name || correctTeamId || 'UNKNOWN',
        });
      }
    }

    return res.status(200).json({
      ok: true,
      message: `Found ${results.length} challenges needing team_id correction. POST to fix.`,
      challenges_to_fix: results,
    });
  }

  if (req.method === 'POST') {
    const allChallenges = await db
      .select({
        id: challenges.id,
        title: challenges.title,
        team_id: challenges.team_id,
        created_by_user_id: challenges.created_by_user_id,
      })
      .from(challenges);

    let updated = 0;
    const details: any[] = [];
    for (const c of allChallenges) {
      const correctTeamId = await determineTeamForChallenge(c.id, c.created_by_user_id);
      if (correctTeamId && c.team_id !== correctTeamId) {
        await db.update(challenges).set({ team_id: correctTeamId }).where(eq(challenges.id, c.id));
        updated++;
        details.push({ id: c.id, title: c.title, old_team_id: c.team_id, new_team_id: correctTeamId });
      }
    }

    return res.status(200).json({
      ok: true,
      message: `Fixed team_id on ${updated} challenges.`,
      updated: details,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
