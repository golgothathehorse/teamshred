import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, userTeams, teams, profiles } from '../../../lib/db';
import { eq, inArray } from 'drizzle-orm';

type SharedJournals = {
  training: boolean | string[];
  diet: boolean | string[];
  supplements: boolean | string[];
  stack: boolean | string[];
};

const DEFAULT_SHARING: SharedJournals = {
  training: false,
  diet: false,
  supplements: false,
  stack: false,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user = parseSessionFromRequest(req);

  if (!user && process.env.TEST_BYPASS_AUTH === 'true') {
    user = {
      id: '7d921803-163b-4f6e-827f-4c3a94ba9efb',
      username: 'Nox',
      isAdmin: true,
    };
  }

  if (!user) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const userTeamsData = await db
        .select({ team_id: userTeams.team_id })
        .from(userTeams)
        .where(eq(userTeams.user_id, user.id));

      const teamCount = userTeamsData.length;
      const teamIds = userTeamsData.map((ut) => ut.team_id);

      let teamsInfo: { id: string; name: string }[] = [];
      if (teamCount > 1 && teamIds.length > 0) {
        const teamsData = await db
          .select({ id: teams.id, name: teams.name })
          .from(teams)
          .where(inArray(teams.id, teamIds));

        teamsInfo = teamsData;
      }

      const profileData = await db
        .select({ shredulator_settings: profiles.shredulator_settings })
        .from(profiles)
        .where(eq(profiles.user_id, user.id))
        .limit(1);

      const profile = profileData[0];
      const settings = profile?.shredulator_settings as any;
      const sharing = settings?.shared_journals || DEFAULT_SHARING;

      return res.status(200).json({ ok: true, sharing, teamCount, teams: teamsInfo });
    } catch (error) {
      console.error('Get journal sharing error:', error);
      return res.status(500).json({ ok: false, error: 'Failed to get sharing preferences' });
    }
  }

  if (req.method === 'PATCH') {
    const { category, shared, teamIds: requestedTeamIds } = req.body;

    const validCategories = ['training', 'diet', 'supplements', 'stack'];
    if (!category || !validCategories.includes(category)) {
      return res.status(400).json({ ok: false, error: 'Invalid category' });
    }

    try {
      const userTeamsData = await db
        .select({ team_id: userTeams.team_id })
        .from(userTeams)
        .where(eq(userTeams.user_id, user.id));

      const teamCount = userTeamsData.length;
      const userTeamIdSet = new Set(userTeamsData.map((ut) => ut.team_id));

      let newValue: boolean | string[];
      if (teamCount === 1) {
        if (typeof shared !== 'boolean') {
          return res.status(400).json({ ok: false, error: 'Shared must be a boolean for single-team users' });
        }
        newValue = shared;
      } else {
        if (!Array.isArray(requestedTeamIds)) {
          return res.status(400).json({ ok: false, error: 'TeamIds must be an array for multi-team users' });
        }
        for (const tid of requestedTeamIds) {
          if (!userTeamIdSet.has(tid)) {
            return res.status(403).json({ ok: false, error: 'Invalid team ID' });
          }
        }
        newValue = requestedTeamIds;
      }

      const profileData = await db
        .select({ shredulator_settings: profiles.shredulator_settings })
        .from(profiles)
        .where(eq(profiles.user_id, user.id))
        .limit(1);

      const profile = profileData[0];
      const currentSettings = (profile?.shredulator_settings as any) || {};
      const currentSharing = currentSettings.shared_journals || DEFAULT_SHARING;
      const newSharing = { ...currentSharing, [category]: newValue };

      const newSettings = { ...currentSettings, shared_journals: newSharing };

      if (profile) {
        await db
          .update(profiles)
          .set({ shredulator_settings: newSettings, updated_at: new Date() })
          .where(eq(profiles.user_id, user.id));
      } else {
        await db.insert(profiles).values({
          user_id: user.id,
          shredulator_settings: newSettings,
          updated_at: new Date(),
        });
      }

      return res.status(200).json({ ok: true, sharing: newSharing, teamCount });
    } catch (error) {
      console.error('Update journal sharing error:', error);
      return res.status(500).json({ ok: false, error: 'Failed to update sharing preferences' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
