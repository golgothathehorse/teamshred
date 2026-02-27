// pages/api/debug-activity-log.ts
// Test endpoint to debug activity logging
import type { NextApiRequest, NextApiResponse } from 'next';
import { db, challengeEntries, challengeTasks, challenges, challengeParticipants, exerciseTypes } from '../../lib/db';
import { eq, and, inArray } from 'drizzle-orm';
import { getSydneyDateString } from '../../lib/dateUtils';
import { FALLBACK_EXERCISE_TYPES } from '../../lib/exercises';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const steps: string[] = [];
  const userId = '7d921803-163b-4f6e-827f-4c3a94ba9efb'; // nox user
  // Default to Pushups UUID if not provided
  const exerciseTypeId = req.query.exercise_type_id as string || 'eaf52e85-37d4-4249-b101-d1ac7ff0f51b';
  
  try {
    // Step 1: Check exercise types in database
    steps.push('Checking exercise_types table...');
    const dbExerciseTypes = await db.select().from(exerciseTypes).limit(10);
    steps.push(`Found ${dbExerciseTypes.length} exercise types in DB`);
    
    // Step 2: Try to find the exercise type
    let exerciseType: { id: string; name: string; unit_type: string } | null = null;
    const matchingDbType = dbExerciseTypes.find(et => et.id === exerciseTypeId);
    
    if (matchingDbType) {
      exerciseType = { id: matchingDbType.id, name: matchingDbType.name, unit_type: matchingDbType.unit_type || 'reps' };
      steps.push(`Found exercise type in DB: ${exerciseType.name}`);
    } else {
      const fallback = FALLBACK_EXERCISE_TYPES.find(et => et.id === exerciseTypeId);
      if (fallback) {
        exerciseType = { id: fallback.id, name: fallback.name, unit_type: fallback.unit_type };
        steps.push(`Found exercise type in fallback: ${exerciseType.name}`);
      }
    }
    
    if (!exerciseType) {
      return res.status(400).json({ ok: false, error: 'Exercise type not found', steps, exercise_type_id: exerciseTypeId });
    }
    
    // Step 3: Find matching tasks
    steps.push(`Looking for tasks with name "${exerciseType.name}"...`);
    const matchingTasks = await db
      .select({
        id: challengeTasks.id,
        challenge_id: challengeTasks.challenge_id,
        name: challengeTasks.name,
      })
      .from(challengeTasks)
      .where(eq(challengeTasks.name, exerciseType.name));
    
    steps.push(`Found ${matchingTasks.length} matching tasks`);
    
    // Step 4: Check active challenges
    const activeChallenges: any[] = [];
    const effectiveDate = getSydneyDateString();
    steps.push(`Checking date: ${effectiveDate}`);
    
    for (const task of matchingTasks) {
      const challengeData = await db
        .select({
          id: challenges.id,
          title: challenges.title,
          status: challenges.status,
          starts_on: challenges.starts_on,
          ends_on: challenges.ends_on,
        })
        .from(challenges)
        .where(eq(challenges.id, task.challenge_id))
        .limit(1);
      
      const challenge = challengeData[0];
      
      if (challenge) {
        const isActive = challenge.status === 'active' && 
          effectiveDate >= challenge.starts_on && 
          effectiveDate <= challenge.ends_on;
        
        activeChallenges.push({
          ...challenge,
          task_id: task.id,
          is_active: isActive,
        });
        
        if (isActive) {
          // Check participant
          const participantData = await db
            .select({ id: challengeParticipants.id, state: challengeParticipants.state })
            .from(challengeParticipants)
            .where(
              and(
                eq(challengeParticipants.challenge_id, challenge.id),
                eq(challengeParticipants.user_id, userId)
              )
            )
            .limit(1);
          
          const participant = participantData[0];
          steps.push(`Challenge "${challenge.title}" - participant: ${participant?.state || 'NOT FOUND'}`);
        }
      }
    }
    
    return res.status(200).json({
      ok: true,
      steps,
      exercise_types_in_db: dbExerciseTypes.map(et => ({ id: et.id, name: et.name })),
      exercise_type: exerciseType,
      matching_tasks: matchingTasks,
      active_challenges: activeChallenges,
      effective_date: effectiveDate,
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      ok: false,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : '',
      steps,
    });
  }
}
