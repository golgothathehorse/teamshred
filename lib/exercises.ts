// lib/exercises.ts
// Shared exercise utilities - single source of truth for unit handling across the app

// Database constraint allows these unit types
export type UnitType = 'status' | 'reps' | 'checkbox' | 'calories' | 'minutes' | 'distance' | 'score';

export interface ExerciseType {
  id: string;
  name: string;
  unit_type: UnitType;
  unit_label: string;
}

// Fallback exercise types for robustness
// These IDs must match the actual database records in Replit PostgreSQL
export const FALLBACK_EXERCISE_TYPES: ExerciseType[] = [
  { id: '2cdd1865-5eb4-439d-b806-870bdbca6949', name: 'Walk', unit_type: 'distance', unit_label: 'km' },
  { id: 'edc7072f-5107-4581-9581-a88c378978df', name: 'Run', unit_type: 'distance', unit_label: 'km' },
  { id: 'cc869a46-099f-4aa2-962a-e652d5a7753c', name: 'Swim', unit_type: 'distance', unit_label: 'km' },
  { id: '283253b8-cbf6-4ba4-acf3-835da24f028a', name: 'Ride', unit_type: 'distance', unit_label: 'km' },
  { id: 'dacac9b8-744d-4ef0-85a1-8e5caf2ceb08', name: 'Hike', unit_type: 'distance', unit_label: 'km' },
  { id: '792eccc9-148e-4a23-9bf5-fcbe4e4325b3', name: 'Pushups', unit_type: 'reps', unit_label: 'reps' },
  { id: '4449dbb5-9922-4c42-8334-2e8df92c4b88', name: 'Chinups', unit_type: 'reps', unit_label: 'reps' },
  { id: 'df40f8ed-2a95-4208-92e6-4372a28f3999', name: 'Ab work', unit_type: 'reps', unit_label: 'reps' },
  { id: '2cf12d81-52c8-4c70-8e3b-d5ac04235e84', name: 'Dips', unit_type: 'reps', unit_label: 'reps' },
  { id: '0975dbbe-feb6-4c48-b451-dadbcdd10b7d', name: 'Burpees', unit_type: 'reps', unit_label: 'reps' },
  { id: '07adae52-c610-4789-9ca1-d6768803fef7', name: 'Sally Up', unit_type: 'score', unit_label: 'score' },
  { id: 'a0dea905-fc20-4329-805a-0ae8a28b9ae5', name: 'Ruck', unit_type: 'distance', unit_label: 'km' },
  { id: '707fbcf0-9151-4919-b40e-179838748fb5', name: 'Elliptical', unit_type: 'distance', unit_label: 'km' },
  { id: 'b8f3d4e1-7a2c-4f5b-9e1d-3c6a8b0f2e4d', name: 'Sesh', unit_type: 'reps', unit_label: 'sessions' },
];

// Map unit_type to display label
export function getUnitLabel(unitType: string): string {
  switch (unitType) {
    case 'distance':
    case 'km':
      return 'kms';
    case 'calories':
      return 'cal';
    case 'minutes':
      return 'mins';
    case 'score':
      return 'score';
    case 'reps':
    default:
      return 'reps';
  }
}

// Format a value for display based on unit type (decimals for distance, integers for reps)
export function formatValue(value: number, unitType: string): string {
  if (unitType === 'distance' || unitType === 'km') {
    return value.toFixed(1);
  }
  return Math.round(value).toString();
}

// Check if unit type requires decimal input
export function isDecimalUnit(unitType: string): boolean {
  return unitType === 'distance' || unitType === 'km';
}

// Get quick-add button amounts based on unit type and unit label
export function getQuickAddAmounts(unitType: string, unitLabel?: string): number[] {
  // For meters (swim), use 100, 500, 1000
  if (unitLabel === 'm' || unitLabel === 'meters') {
    return [100, 500, 1000];
  }
  switch (unitType) {
    case 'distance':
    case 'km':
      return [1, 2, 5, 10];
    case 'calories':
      return [50, 100, 500, 1000];
    case 'minutes':
      return [5, 10, 15, 30];
    case 'reps':
    default:
      return [1, 5, 10, 25];
  }
}

// Get fallback exercise type by ID
export function getFallbackExerciseById(id: string): ExerciseType | undefined {
  return FALLBACK_EXERCISE_TYPES.find(et => et.id === id);
}

// Get fallback exercise type by name
export function getFallbackExerciseByName(name: string): ExerciseType | undefined {
  return FALLBACK_EXERCISE_TYPES.find(et => et.name.toLowerCase() === name.toLowerCase());
}

// Valid unit types for form validation
export const VALID_UNIT_TYPES: UnitType[] = ['reps', 'distance', 'calories', 'minutes', 'score'];

// Unit type options for admin forms
export const UNIT_TYPE_OPTIONS: { value: UnitType; label: string; defaultUnitLabel: string }[] = [
  { value: 'reps', label: 'Reps (count)', defaultUnitLabel: 'reps' },
  { value: 'score', label: 'Score', defaultUnitLabel: 'score' },
  { value: 'distance', label: 'Distance', defaultUnitLabel: 'kms' },
  { value: 'calories', label: 'Calories', defaultUnitLabel: 'cal' },
  { value: 'minutes', label: 'Minutes', defaultUnitLabel: 'mins' },
];

// Category order for sorting: reps first, then score, then distance (kms), then calories, then minutes
const UNIT_TYPE_ORDER: Record<string, number> = {
  'reps': 1,
  'score': 1.5,
  'distance': 2,
  'km': 2,
  'calories': 3,
  'minutes': 4,
};

// Sort exercises by category (reps, kms, calories, minutes) then alphabetically within each category
export function sortExerciseTypes<T extends { name: string; unit_type: string }>(exercises: T[]): T[] {
  return [...exercises].sort((a, b) => {
    const orderA = UNIT_TYPE_ORDER[a.unit_type] || 99;
    const orderB = UNIT_TYPE_ORDER[b.unit_type] || 99;
    
    // First sort by category order
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    
    // Then sort alphabetically within category
    return a.name.localeCompare(b.name);
  });
}
