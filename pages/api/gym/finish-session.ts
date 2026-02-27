import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, gymSessions, activityLog, challengeEntries, challengeTasks, challenges, challengeParticipants } from '../../../lib/db';
import { eq, and, inArray } from 'drizzle-orm';
import { getSydneyDateString } from '../../../lib/dateUtils';

const SESH_EXERCISE_TYPE_ID = 'b8f3d4e1-7a2c-4f5b-9e1d-3c6a8b0f2e4d';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const session = parseSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Please log in' });
  }

  const { session_id, name } = req.body;
  if (!session_id) {
    return res.status(400).json({ ok: false, error: 'Session ID is required' });
  }

  const [gymSession] = await db
    .select()
    .from(gymSessions)
    .where(and(eq(gymSessions.id, session_id), eq(gymSessions.user_id, session.id)));

  if (!gymSession) {
    return res.status(404).json({ ok: false, error: 'Session not found' });
  }

  if (gymSession.status === 'completed') {
    return res.status(400).json({ ok: false, error: 'Session already completed' });
  }

  const updates: any = { status: 'completed', finished_at: new Date() };
  if (name?.trim()) updates.name = name.trim();

  const [updated] = await db
    .update(gymSessions)
    .set(updates)
    .where(eq(gymSessions.id, session_id))
    .returning();

  const effectiveDate = gymSession.session_date || getSydneyDateString();
  const logRequestId = randomUUID();

  await db.insert(activityLog).values({
    id: randomUUID(),
    user_id: session.id,
    exercise_type_id: SESH_EXERCISE_TYPE_ID,
    value: '1',
    entry_date: effectiveDate,
    created_at: new Date(),
  });

  const matchingTasks = await db
    .select({
      id: challengeTasks.id,
      challenge_id: challengeTasks.challenge_id,
    })
    .from(challengeTasks)
    .where(eq(challengeTasks.exercise_type_id, SESH_EXERCISE_TYPE_ID));

  for (const task of matchingTasks) {
    const challengeData = await db
      .select({
        id: challenges.id,
        status: challenges.status,
        starts_on: challenges.starts_on,
        ends_on: challenges.ends_on,
      })
      .from(challenges)
      .where(eq(challenges.id, task.challenge_id))
      .limit(1);

    const challenge = challengeData[0];

    if (
      challenge &&
      effectiveDate >= challenge.starts_on &&
      effectiveDate <= challenge.ends_on
    ) {
      let shouldSync = false;

      if (challenge.status === 'active') {
        const participantData = await db
          .select({ id: challengeParticipants.id })
          .from(challengeParticipants)
          .where(
            and(
              eq(challengeParticipants.challenge_id, challenge.id),
              eq(challengeParticipants.user_id, session.id),
              inArray(challengeParticipants.state, ['accepted', 'latecomer'])
            )
          )
          .limit(1);
        shouldSync = participantData.length > 0;
      } else if (challenge.status === 'pending') {
        const creatorData = await db
          .select({ id: challengeParticipants.id })
          .from(challengeParticipants)
          .where(
            and(
              eq(challengeParticipants.challenge_id, challenge.id),
              eq(challengeParticipants.user_id, session.id),
              eq(challengeParticipants.role, 'creator'),
              eq(challengeParticipants.state, 'accepted')
            )
          )
          .limit(1);
        shouldSync = creatorData.length > 0;
      }

      if (shouldSync) {
        await db.insert(challengeEntries).values({
          id: randomUUID(),
          challenge_id: challenge.id,
          task_id: task.id,
          user_id: session.id,
          entry_date: effectiveDate,
          value: '1',
          log_request_id: logRequestId,
          inserted_at: new Date(),
        });
      }
    }
  }

  return res.status(200).json({ ok: true, session: updated });
}
