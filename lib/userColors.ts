// Shared user color utility
// Permanent, distinct color assignments for all team members
// IMPORTANT: Every user MUST get a visually distinct color. Never assign colors
// from the same hue family as any existing user. When adding new users, always
// add them to USER_COLOR_MAP with a permanent unique color.

export const USER_COLOR_MAP: Record<string, string> = {
  'nox': '#10b981',      // Emerald green   (~160° hue)
  'jarry': '#ec4899',    // Pink             (~330° hue)
  'dev': '#84cc16',      // Lime green       (~85° hue)
  'boss': '#0ea5e9',     // Sky blue         (~200° hue)
  'kman': '#f59e0b',     // Amber            (~45° hue)
  'morlz': '#a855f7',    // Purple           (~270° hue)
  'tank': '#6366f1',     // Indigo           (~239° hue) - distinct from sky blue Boss & purple Morlz
  'tee': '#f43f5e',      // Rose/Red         (~350° hue)
  'shinny': '#d946ef',   // Fuchsia/Magenta  (~295° hue) - distinct from purple Morlz & pink Jarry
  'testuser': '#64748b', // Slate
};

// Fallback colors for future new users - each is chosen to be visually distinct
// from ALL permanent colors above AND from each other.
// Occupied hues: ~45° Kman, ~85° Dev, ~160° Nox, ~200° Boss, ~239° Tank, ~270° Morlz, ~295° Shinny, ~330° Jarry, ~350° Tee
// Available hue gaps: ~0-30° (orange-red), ~110-140° (teal-green), ~360°+ (warm reds)
const FALLBACK_COLORS = [
  '#06b6d4', // Cyan (~185° hue)
  '#dc2626', // True red (~0° hue)
  '#0d9488', // Teal (~170° hue, between Nox and Boss)
  '#ca8a04', // Dark gold (~50° hue)
  '#f97316', // Orange (~25° hue)
  '#2563eb', // Royal blue (~220° hue)
  '#65a30d', // Olive green (~100° hue)
  '#e11d48', // Crimson (~345° hue)
  '#7e22ce', // Deep purple (~280° hue)
  '#ea580c', // Burnt orange (~20° hue)
];

// Track dynamically assigned colors for new users (not in the permanent map)
const dynamicAssignments: Map<string, string> = new Map();
let nextFallbackIndex = 0;

/**
 * Get a consistent, distinct color for a user by username.
 * Permanent users have fixed colors. New users get assigned from fallback palette.
 */
export function getUserColor(username: string): string {
  const lowerUsername = username.toLowerCase();
  
  // Check permanent assignments first
  if (USER_COLOR_MAP[lowerUsername]) {
    return USER_COLOR_MAP[lowerUsername];
  }
  
  // Check if we've already assigned this user a dynamic color
  if (dynamicAssignments.has(lowerUsername)) {
    return dynamicAssignments.get(lowerUsername)!;
  }
  
  // Assign a new color from fallback palette
  const color = FALLBACK_COLORS[nextFallbackIndex % FALLBACK_COLORS.length];
  dynamicAssignments.set(lowerUsername, color);
  nextFallbackIndex++;
  
  return color;
}

/**
 * Get Tailwind background class for a user (for use in className)
 */
export function getUserBgClass(username: string): string {
  const lowerUsername = username.toLowerCase();
  
  const bgClasses: Record<string, string> = {
    'nox': 'bg-emerald-500',
    'jarry': 'bg-pink-500',
    'dev': 'bg-lime-500',
    'boss': 'bg-sky-500',
    'kman': 'bg-amber-500',
    'morlz': 'bg-purple-500',
    'tank': 'bg-indigo-500',
    'tee': 'bg-rose-500',
    'shinny': 'bg-fuchsia-500',
    'testuser': 'bg-slate-500',
  };
  
  return bgClasses[lowerUsername] || 'bg-slate-400';
}

/**
 * Get Tailwind text class for a user (for use in className)
 */
export function getUserTextClass(username: string): string {
  const lowerUsername = username.toLowerCase();
  
  const textClasses: Record<string, string> = {
    'nox': 'text-emerald-400',
    'jarry': 'text-pink-400',
    'dev': 'text-lime-400',
    'boss': 'text-sky-400',
    'kman': 'text-amber-400',
    'morlz': 'text-purple-400',
    'tank': 'text-indigo-400',
    'tee': 'text-rose-400',
    'shinny': 'text-fuchsia-400',
    'testuser': 'text-slate-400',
  };
  
  return textClasses[lowerUsername] || 'text-slate-400';
}

/**
 * Build a Map of user_id -> color from a list of users with id and username
 */
export function buildUserColorMap(users: Array<{ user_id?: string; id?: string; username: string }>): Map<string, string> {
  const colorMap = new Map<string, string>();
  
  for (const user of users) {
    const id = user.user_id || user.id;
    if (id) {
      colorMap.set(id, getUserColor(user.username));
    }
  }
  
  return colorMap;
}
