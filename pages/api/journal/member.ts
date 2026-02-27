import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, users, profiles, userTeams, journalEntries } from '../../../lib/db';
import { eq, and, desc } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

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

  const { userId, category } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ ok: false, error: 'User ID is required' });
  }

  if (!category || typeof category !== 'string') {
    return res.status(400).json({ ok: false, error: 'Category is required' });
  }

  const validCategories = ['training', 'diet', 'supplements', 'stack'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ ok: false, error: 'Invalid category' });
  }

  try {
    const currentUserData = await db
      .select({ active_team_id: users.active_team_id })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const currentUser = currentUserData[0];

    if (!currentUser?.active_team_id) {
      return res.status(403).json({ ok: false, error: 'No active team' });
    }

    const callerMembership = await db
      .select({ team_id: userTeams.team_id })
      .from(userTeams)
      .where(and(eq(userTeams.user_id, user.id), eq(userTeams.team_id, currentUser.active_team_id)))
      .limit(1);

    if (callerMembership.length === 0) {
      return res.status(403).json({ ok: false, error: 'You are no longer a member of this team' });
    }

    const targetMembership = await db
      .select({ team_id: userTeams.team_id })
      .from(userTeams)
      .where(and(eq(userTeams.user_id, userId), eq(userTeams.team_id, currentUser.active_team_id)))
      .limit(1);

    if (targetMembership.length === 0) {
      return res.status(403).json({ ok: false, error: 'User is not in your team' });
    }

    const targetUserData = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const targetUser = targetUserData[0];

    if (!targetUser) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const targetProfileData = await db
      .select({ shredulator_settings: profiles.shredulator_settings })
      .from(profiles)
      .where(eq(profiles.user_id, userId))
      .limit(1);

    const targetProfile = targetProfileData[0];
    const settings = targetProfile?.shredulator_settings as any;
    const sharedJournals = settings?.shared_journals || {
      training: false,
      diet: false,
      supplements: false,
      stack: false,
    };

    const categoryValue = sharedJournals[category as keyof typeof sharedJournals];
    let isSharedWithTeam = false;

    if (typeof categoryValue === 'boolean') {
      isSharedWithTeam = categoryValue;
    } else if (Array.isArray(categoryValue)) {
      isSharedWithTeam = categoryValue.includes(currentUser.active_team_id);
    }

    if (!isSharedWithTeam) {
      return res.status(403).json({ ok: false, error: 'This journal category is not shared with your team' });
    }

    const entries = await db
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.user_id, userId), eq(journalEntries.category, category)))
      .orderBy(desc(journalEntries.created_at))
      .limit(50);

    const formattedEntries = entries.map((e) => ({
      ...e,
      created_at: e.created_at?.toISOString() ?? new Date().toISOString(),
    }));

    return res.status(200).json({
      ok: true,
      username: targetUser.username,
      category,
      entries: formattedEntries,
    });
  } catch (error) {
    console.error('Journal member error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}
