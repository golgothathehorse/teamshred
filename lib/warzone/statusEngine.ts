// lib/warzone/statusEngine.ts
// Phase 3: Status engine for computing weight deltas and challenge labels

import { db, weights } from '../db';
import { eq, lte, gte, gt, and, asc, desc } from 'drizzle-orm';

// Template categories
export type TemplateCategory = 'weekend' | 'weekly';

// Weight entry from database
export type WeightEntry = {
  user_id: string;
  weigh_date: string; // YYYY-MM-DD
  weight_kg: number;
};

// Participant result after calculation
export type ParticipantResult = {
  user_id: string;
  username: string;
  start_weight: number | null;
  end_weight: number | null;
  delta_kg: number | null;
  status_label: string;
  has_valid_data: boolean;
};

// Challenge result
export type ChallengeResult = {
  participants: ParticipantResult[];
  winner_user_id: string | null;
  is_tie: boolean;
  is_complete: boolean;
  error?: string;
};

// Get template category from template_key
export function getTemplateCategory(templateKey: string): TemplateCategory {
  if (templateKey.startsWith('weekend_') || templateKey.endsWith('_weekend')) {
    return 'weekend';
  }
  if (templateKey.startsWith('week_') || templateKey.endsWith('_week')) {
    return 'weekly';
  }
  const weekendKeys = ['epic_weekend', 'solid_weekend', 'decent_weekend'];
  const weeklyKeys = ['ripper_week', 'pisscutter_week'];
  
  if (weekendKeys.includes(templateKey)) return 'weekend';
  if (weeklyKeys.includes(templateKey)) return 'weekly';
  
  return 'weekend';
}

// Compute weekend status label based on weight delta
export function getWeekendStatusLabel(deltaKg: number): string {
  if (deltaKg < 0) return 'Epic Weekend!';
  if (deltaKg < 1) return 'Solid Weekend';
  if (deltaKg < 2) return 'Decent Weekend';
  if (deltaKg < 3) return 'Minor BlowOut';
  return 'Massive BlowOut!';
}

// Compute weekly status label based on weight delta
export function getWeeklyStatusLabel(deltaKg: number): string {
  if (deltaKg <= 0 && deltaKg >= -1) return 'Ripper Week';
  if (deltaKg < -1) return 'Pisscutter Week!!!';
  return 'No status';
}

// Get status label based on template category and delta
export function getStatusLabel(templateKey: string, deltaKg: number): string {
  if (templateKey === 'custom') {
    return deltaKg <= 0 ? 'On Track' : 'Behind';
  }
  const category = getTemplateCategory(templateKey);
  if (category === 'weekend') {
    return getWeekendStatusLabel(deltaKg);
  }
  return getWeeklyStatusLabel(deltaKg);
}

// Custom challenge result for target weight loss challenges
export type CustomParticipantResult = {
  user_id: string;
  username: string;
  starting_weight: number | null;
  current_weight: number | null;
  target_loss_kg: number;
  weight_lost: number | null;
  reached_target: boolean;
  reached_on: string | null;
};

// Check if a user has achieved target weight loss (for custom challenges)
export async function checkTargetWeightReached(
  userId: string,
  targetLossKg: number,
  startsOn: string,
  endsOn: string
): Promise<{ 
  reached: boolean; 
  reachedOn: string | null; 
  startingWeight: number | null;
  currentWeight: number | null;
  weightLost: number | null;
}> {
  const startWeightData = await db
    .select({ weight_kg: weights.weight_kg })
    .from(weights)
    .where(and(eq(weights.user_id, userId), lte(weights.weigh_date, startsOn)))
    .orderBy(desc(weights.weigh_date))
    .limit(1);

  if (startWeightData.length === 0) {
    return {
      reached: false,
      reachedOn: null,
      startingWeight: null,
      currentWeight: null,
      weightLost: null,
    };
  }

  const startingWeight = Number(startWeightData[0].weight_kg);
  const SHRED_OFF_TOLERANCE = 0.85;
  const toleranceWeight = startingWeight - (targetLossKg * SHRED_OFF_TOLERANCE);

  const achievedEntryData = await db
    .select({ weigh_date: weights.weigh_date, weight_kg: weights.weight_kg })
    .from(weights)
    .where(
      and(
        eq(weights.user_id, userId),
        gt(weights.weigh_date, startsOn),
        lte(weights.weigh_date, endsOn),
        lte(weights.weight_kg, toleranceWeight.toString())
      )
    )
    .orderBy(asc(weights.weigh_date))
    .limit(1);

  const latestWeightData = await db
    .select({ weight_kg: weights.weight_kg })
    .from(weights)
    .where(and(eq(weights.user_id, userId), lte(weights.weigh_date, endsOn)))
    .orderBy(desc(weights.weigh_date))
    .limit(1);

  const currentWeight = latestWeightData.length > 0 ? Number(latestWeightData[0].weight_kg) : null;
  const weightLost = currentWeight !== null ? startingWeight - currentWeight : null;

  return {
    reached: achievedEntryData.length > 0,
    reachedOn: achievedEntryData.length > 0 ? achievedEntryData[0].weigh_date : null,
    startingWeight,
    currentWeight,
    weightLost,
  };
}

// Determine winner for custom target weight challenges
export function determineCustomWinner(
  participantResults: CustomParticipantResult[]
): { winner_user_id: string | null; is_tie: boolean } {
  const reachedParticipants = participantResults.filter(p => p.reached_target && p.reached_on);

  if (reachedParticipants.length === 0) {
    return { winner_user_id: null, is_tie: false };
  }

  const sorted = [...reachedParticipants].sort((a, b) => {
    return a.reached_on!.localeCompare(b.reached_on!);
  });

  const first = sorted[0];
  const second = sorted[1];

  if (second && first.reached_on === second.reached_on) {
    return { winner_user_id: null, is_tie: true };
  }

  return { winner_user_id: first.user_id, is_tie: false };
}

// Fetch weights for a user within a date range
export async function fetchUserWeights(
  userId: string,
  startDate: string,
  endDate: string
): Promise<WeightEntry[]> {
  const data = await db
    .select({ user_id: weights.user_id, weigh_date: weights.weigh_date, weight_kg: weights.weight_kg })
    .from(weights)
    .where(
      and(eq(weights.user_id, userId), gte(weights.weigh_date, startDate), lte(weights.weigh_date, endDate))
    )
    .orderBy(asc(weights.weigh_date));

  return data.map((row) => ({
    user_id: row.user_id,
    weigh_date: row.weigh_date,
    weight_kg: Number(row.weight_kg),
  }));
}

// Get the nearest weight on or before a date
export async function getNearestWeightBefore(
  userId: string,
  targetDate: string
): Promise<WeightEntry | null> {
  const data = await db
    .select({ user_id: weights.user_id, weigh_date: weights.weigh_date, weight_kg: weights.weight_kg })
    .from(weights)
    .where(and(eq(weights.user_id, userId), lte(weights.weigh_date, targetDate)))
    .orderBy(desc(weights.weigh_date))
    .limit(1);

  if (data.length === 0) return null;

  return {
    user_id: data[0].user_id,
    weigh_date: data[0].weigh_date,
    weight_kg: Number(data[0].weight_kg),
  };
}

// Get the nearest weight on or after a date
export async function getNearestWeightAfter(
  userId: string,
  targetDate: string
): Promise<WeightEntry | null> {
  const data = await db
    .select({ user_id: weights.user_id, weigh_date: weights.weigh_date, weight_kg: weights.weight_kg })
    .from(weights)
    .where(and(eq(weights.user_id, userId), gte(weights.weigh_date, targetDate)))
    .orderBy(asc(weights.weigh_date))
    .limit(1);

  if (data.length === 0) return null;

  return {
    user_id: data[0].user_id,
    weigh_date: data[0].weigh_date,
    weight_kg: Number(data[0].weight_kg),
  };
}

// Calculate participant result for a challenge
export async function calculateParticipantResult(
  userId: string,
  username: string,
  templateKey: string,
  startsOn: string,
  endsOn: string,
  isFinal: boolean = false
): Promise<ParticipantResult> {
  let startWeight = await getNearestWeightAfter(userId, startsOn);
  if (!startWeight) {
    startWeight = await getNearestWeightBefore(userId, startsOn);
  }

  let endWeight: WeightEntry | null = null;
  if (isFinal) {
    endWeight = await getNearestWeightBefore(userId, endsOn);
  } else {
    const today = new Date().toISOString().split('T')[0];
    const effectiveEndDate = today < endsOn ? today : endsOn;
    endWeight = await getNearestWeightBefore(userId, effectiveEndDate);
  }

  let hasValidData = startWeight !== null && endWeight !== null;
  
  if (hasValidData && isFinal) {
    const startDate = startWeight!.weigh_date;
    const endDate = endWeight!.weigh_date;
    hasValidData = startDate !== endDate;
  }

  const deltaKg = hasValidData
    ? Number((endWeight!.weight_kg - startWeight!.weight_kg).toFixed(2))
    : null;

  const statusLabel = deltaKg !== null
    ? getStatusLabel(templateKey, deltaKg)
    : 'No data';

  return {
    user_id: userId,
    username,
    start_weight: startWeight?.weight_kg ?? null,
    end_weight: endWeight?.weight_kg ?? null,
    delta_kg: deltaKg,
    status_label: statusLabel,
    has_valid_data: hasValidData,
  };
}

// Determine winner from participant results
export function determineWinner(participants: ParticipantResult[]): {
  winner_user_id: string | null;
  is_tie: boolean;
} {
  const validParticipants = participants.filter(p => p.has_valid_data && p.delta_kg !== null);

  if (validParticipants.length < 2) {
    return { winner_user_id: null, is_tie: false };
  }

  const sorted = [...validParticipants].sort((a, b) => a.delta_kg! - b.delta_kg!);

  const first = sorted[0];
  const second = sorted[1];

  const tolerance = 0.01;
  if (Math.abs(first.delta_kg! - second.delta_kg!) <= tolerance) {
    return { winner_user_id: null, is_tie: true };
  }

  return { winner_user_id: first.user_id, is_tie: false };
}

// Calculate full challenge result
export async function calculateChallengeResult(
  challengeId: string,
  templateKey: string,
  startsOn: string,
  endsOn: string,
  participants: Array<{ user_id: string; username: string }>,
  isFinal: boolean = false,
  targetWeightKg?: number | null
): Promise<ChallengeResult> {
  try {
    if (templateKey === 'custom' && targetWeightKg) {
      const customResults: CustomParticipantResult[] = await Promise.all(
        participants.map(async (p) => {
          const result = await checkTargetWeightReached(
            p.user_id,
            targetWeightKg,
            startsOn,
            endsOn
          );
          return {
            user_id: p.user_id,
            username: p.username,
            starting_weight: result.startingWeight,
            current_weight: result.currentWeight,
            target_loss_kg: targetWeightKg,
            weight_lost: result.weightLost,
            reached_target: result.reached,
            reached_on: result.reachedOn,
          };
        })
      );

      const anyReached = customResults.some(r => r.reached_target);
      const today = new Date().toISOString().split('T')[0];
      const periodEnded = today > endsOn;
      const shouldFinalize = anyReached || periodEnded;

      let winnerResult = { winner_user_id: null as string | null, is_tie: false };
      if (shouldFinalize || isFinal) {
        winnerResult = determineCustomWinner(customResults);
      }

      const participantResults: ParticipantResult[] = customResults.map(r => {
        const remaining = r.weight_lost !== null ? targetWeightKg - r.weight_lost : null;
        return {
          user_id: r.user_id,
          username: r.username,
          start_weight: r.starting_weight,
          end_weight: r.current_weight,
          delta_kg: r.weight_lost !== null ? -r.weight_lost : null,
          status_label: r.reached_target 
            ? `Lost ${targetWeightKg}kg on ${r.reached_on}!` 
            : r.weight_lost !== null
              ? remaining !== null && remaining > 0
                ? `Lost ${r.weight_lost.toFixed(1)}kg (${remaining.toFixed(1)}kg to go)`
                : `Lost ${r.weight_lost.toFixed(1)}kg`
              : r.starting_weight === null 
                ? 'No starting weight'
                : 'No weigh-in yet',
          has_valid_data: r.starting_weight !== null && r.current_weight !== null,
        };
      });

      return {
        participants: participantResults,
        winner_user_id: winnerResult.winner_user_id,
        is_tie: winnerResult.is_tie,
        is_complete: shouldFinalize || isFinal,
      };
    }

    const participantResults = await Promise.all(
      participants.map(p =>
        calculateParticipantResult(
          p.user_id,
          p.username,
          templateKey,
          startsOn,
          endsOn,
          isFinal
        )
      )
    );

    let winnerResult = { winner_user_id: null as string | null, is_tie: false };
    if (isFinal) {
      winnerResult = determineWinner(participantResults);
    }

    return {
      participants: participantResults,
      winner_user_id: winnerResult.winner_user_id,
      is_tie: winnerResult.is_tie,
      is_complete: isFinal,
    };
  } catch (error) {
    console.error('Error calculating challenge result:', error);
    return {
      participants: [],
      winner_user_id: null,
      is_tie: false,
      is_complete: false,
      error: 'Failed to calculate results',
    };
  }
}

// Calculate next Friday from a given date
export function getNextFriday(fromDate: Date = new Date()): Date {
  const date = new Date(fromDate);
  const day = date.getDay();
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntilFriday);
  return date;
}

// Get challenge dates based on template
export function getChallengeDates(templateKey: string): {
  starts_on: string;
  ends_on: string;
} {
  const category = getTemplateCategory(templateKey);
  const nextFriday = getNextFriday();
  
  const startsOn = nextFriday.toISOString().split('T')[0];

  if (category === 'weekend') {
    const monday = new Date(nextFriday);
    monday.setDate(monday.getDate() + 3);
    return {
      starts_on: startsOn,
      ends_on: monday.toISOString().split('T')[0],
    };
  } else {
    const nextNextFriday = new Date(nextFriday);
    nextNextFriday.setDate(nextNextFriday.getDate() + 7);
    return {
      starts_on: startsOn,
      ends_on: nextNextFriday.toISOString().split('T')[0],
    };
  }
}
