// pages/api/debug-challenge-details.ts
// Test endpoint to verify challenge details query works
import type { NextApiRequest, NextApiResponse } from 'next';
import { db, challenges, challengeParticipants, challengeTasks, users } from '../../lib/db';
import { eq, inArray } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const challengeId = req.query.id as string || '277212f5-ccae-4cef-a50a-2d7804520fda';
  
  try {
    const steps: string[] = [];
    
    // Step 1: Query the challenge
    steps.push('Querying challenge...');
    const challengeData = await db.select().from(challenges).where(eq(challenges.id, challengeId)).limit(1);
    
    if (challengeData.length === 0) {
      return res.status(404).json({ ok: false, error: 'Challenge not found', steps });
    }
    
    const challenge = challengeData[0];
    steps.push(`Challenge found: ${challenge.title}`);
    
    // Step 2: Query participants
    steps.push('Querying participants...');
    const participants = await db
      .select({
        id: challengeParticipants.id,
        user_id: challengeParticipants.user_id,
        role: challengeParticipants.role,
        state: challengeParticipants.state,
      })
      .from(challengeParticipants)
      .where(eq(challengeParticipants.challenge_id, challengeId));
    
    steps.push(`Found ${participants.length} participants`);
    
    // Step 3: Query tasks
    steps.push('Querying tasks...');
    const tasks = await db
      .select({
        id: challengeTasks.id,
        name: challengeTasks.name,
        unit_type: challengeTasks.unit_type,
        target_value: challengeTasks.target_value,
      })
      .from(challengeTasks)
      .where(eq(challengeTasks.challenge_id, challengeId));
    
    steps.push(`Found ${tasks.length} tasks`);
    
    return res.status(200).json({
      ok: true,
      steps,
      challenge: {
        id: challenge.id,
        title: challenge.title,
        scope: challenge.scope,
        status: challenge.status,
        winner_user_id: challenge.winner_user_id,
        completed_at: challenge.completed_at,
        result_json: challenge.result_json,
      },
      participants,
      tasks,
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      ok: false,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : '',
    });
  }
}
