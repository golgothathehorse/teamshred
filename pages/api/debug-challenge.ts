// pages/api/debug-challenge.ts
// Test endpoint to debug challenge creation
import type { NextApiRequest, NextApiResponse } from 'next';
import { db, challenges, challengeParticipants, challengeTasks } from '../../lib/db';
import { eq } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  const steps: string[] = [];
  let challengeId: string | null = null;
  
  try {
    // Step 1: Try to insert a challenge
    steps.push('Starting challenge insert...');
    const challengeResult = await db
      .insert(challenges)
      .values({
        scope: 'solo',
        template_key: null,
        title: 'Debug Test Challenge',
        description: 'Testing challenge creation',
        stake_text: null,
        starts_on: '2026-01-12',
        ends_on: '2026-01-19',
        status: 'active',
        created_by_user_id: '7d921803-163b-4f6e-827f-4c3a94ba9efb',
      })
      .returning();

    if (!challengeResult[0]) {
      steps.push('ERROR: Challenge insert returned empty');
      return res.status(500).json({ ok: false, steps, error: 'Challenge insert returned empty' });
    }

    challengeId = challengeResult[0].id;
    steps.push(`Challenge created: ${challengeId}`);

    // Step 2: Try to insert a task
    steps.push('Starting task insert...');
    const taskResult = await db
      .insert(challengeTasks)
      .values({
        challenge_id: challengeId,
        name: 'Test Pushups',
        unit_type: 'reps',
        target_type: 'total',
        target_value: '100',
        sort_order: 0,
      })
      .returning();

    if (!taskResult[0]) {
      steps.push('ERROR: Task insert returned empty');
    } else {
      steps.push(`Task created: ${taskResult[0].id}`);
    }

    // Step 3: Try to insert a participant
    steps.push('Starting participant insert...');
    const participantResult = await db
      .insert(challengeParticipants)
      .values({
        challenge_id: challengeId,
        user_id: '7d921803-163b-4f6e-827f-4c3a94ba9efb',
        role: 'creator',
        state: 'accepted',
      })
      .returning();

    if (!participantResult[0]) {
      steps.push('ERROR: Participant insert returned empty');
    } else {
      steps.push(`Participant created: ${participantResult[0].id}`);
    }

    return res.status(200).json({
      ok: true,
      steps,
      challenge_id: challengeId,
      message: 'All inserts successful!',
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    steps.push(`ERROR: ${errorMessage}`);
    
    // Try to cleanup if we created a challenge
    if (challengeId) {
      try {
        await db.delete(challenges).where(eq(challenges.id, challengeId));
        steps.push('Cleaned up partial challenge');
      } catch (e) {
        steps.push('Failed to cleanup');
      }
    }

    return res.status(500).json({
      ok: false,
      steps,
      error: errorMessage,
      stack: errorStack,
    });
  }
}
