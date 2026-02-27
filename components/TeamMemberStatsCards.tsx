import { useMemo } from 'react';
import { getUserColor } from '../lib/userColors';

type BodyFatEntry = {
  id: string;
  user_id: string;
  log_date: string;
  bf_percent: number;
  inserted_at: string;
};

type WaistEntry = {
  id: string;
  user_id: string;
  log_date: string;
  waist_cm: number;
  inserted_at: string;
};

type WeightEntry = {
  id: string;
  user_id: string;
  weigh_date: string;
  weight_kg: number;
  inserted_at: string;
  is_monday: boolean;
  is_friday: boolean;
};

type SharedJournals = {
  training: boolean;
  diet: boolean;
  supplements: boolean;
  stack: boolean;
};

type MemberData = {
  user_id: string;
  username: string;
  weights: WeightEntry[];
  bodyFatLogs: BodyFatEntry[];
  waistLogs: WaistEntry[];
  goal_weight: number | null;
  goal_bf: number | null;
  pb_weight_kg: number | null;
  pb_date: string | null;
  sharedJournals?: SharedJournals;
};

type JournalCategory = 'training' | 'diet' | 'supplements' | 'stack';

type Props = {
  members: MemberData[];
  onViewJournal?: (userId: string, username: string, category: JournalCategory) => void;
};

const JOURNAL_BUTTONS: { key: JournalCategory; label: string; shortLabel: string; bgColor: string; hoverColor: string }[] = [
  { key: 'training', label: 'Training', shortLabel: 'Train', bgColor: 'bg-emerald-600', hoverColor: 'hover:bg-emerald-500' },
  { key: 'diet', label: 'Diet', shortLabel: 'Diet', bgColor: 'bg-teal-600', hoverColor: 'hover:bg-teal-500' },
  { key: 'supplements', label: 'Supps', shortLabel: 'Supps', bgColor: 'bg-lime-600', hoverColor: 'hover:bg-lime-500' },
  { key: 'stack', label: 'Stack', shortLabel: 'Stack', bgColor: 'bg-green-600', hoverColor: 'hover:bg-green-500' },
];

// User colors are imported from lib/userColors.ts for consistency across components

export default function TeamMemberStatsCards({ members, onViewJournal }: Props) {
  // Sort members so smaller cards (no journals) appear first, larger cards (with journals) appear last
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const aHasJournals = a.sharedJournals && Object.values(a.sharedJournals).some(v => v);
      const bHasJournals = b.sharedJournals && Object.values(b.sharedJournals).some(v => v);
      // Members without journals first (return -1), members with journals last (return 1)
      if (aHasJournals === bHasJournals) return 0;
      return aHasJournals ? 1 : -1;
    });
  }, [members]);

  // Assign colors to users based on alphabetically sorted usernames for consistency with chart
  const userColors = useMemo(() => {
    const colors = new Map<string, string>();
    // Sort alphabetically by username to ensure consistent color assignment across components
    const alphabeticallySorted = [...members].sort((a, b) => 
      a.username.toLowerCase().localeCompare(b.username.toLowerCase())
    );
    alphabeticallySorted.forEach((member) => {
      colors.set(member.user_id, getUserColor(member.username));
    });
    return colors;
  }, [members]);
  // Memoize current BF% calculations for each member
  const currentBfByUser = useMemo(() => {
    const bfMap = new Map<string, number | null>();
    sortedMembers.forEach((member) => {
      if (member.bodyFatLogs.length === 0) {
        bfMap.set(member.user_id, null);
      } else {
        const sorted = [...member.bodyFatLogs].sort(
          (a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime()
        );
        bfMap.set(member.user_id, sorted[0].bf_percent);
      }
    });
    return bfMap;
  }, [sortedMembers]);

  // Memoize latest weight calculations for each member
  const latestWeightByUser = useMemo(() => {
    const weightMap = new Map<string, number | null>();
    sortedMembers.forEach((member) => {
      if (member.weights.length === 0) {
        weightMap.set(member.user_id, null);
      } else {
        const sorted = [...member.weights].sort(
          (a, b) => new Date(b.weigh_date).getTime() - new Date(a.weigh_date).getTime()
        );
        weightMap.set(member.user_id, sorted[0].weight_kg);
      }
    });
    return weightMap;
  }, [sortedMembers]);

  // Memoize current waist calculations for each member
  const currentWaistByUser = useMemo(() => {
    const waistMap = new Map<string, number | null>();
    sortedMembers.forEach((member) => {
      if (!member.waistLogs || member.waistLogs.length === 0) {
        waistMap.set(member.user_id, null);
      } else {
        const sorted = [...member.waistLogs].sort(
          (a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime()
        );
        waistMap.set(member.user_id, sorted[0].waist_cm);
      }
    });
    return waistMap;
  }, [sortedMembers]);

  if (sortedMembers.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {sortedMembers.map((member) => {
        const color = userColors.get(member.user_id) || '#64748b';

        // Use stored PB from profile
        const pbWeight = member.pb_weight_kg;

        // Get current BF% from memoized map
        const currentBf = currentBfByUser.get(member.user_id) || null;

        // Get latest weight from memoized map
        const latestWeight = latestWeightByUser.get(member.user_id) || null;

        // Get current waist from memoized map
        const currentWaist = currentWaistByUser.get(member.user_id) || null;

        return (
          <div
            key={member.user_id}
            className="rounded-xl border-2 bg-slate-900/60 p-3 space-y-2"
            style={{ borderColor: color }}
            data-testid={`card-member-${member.username}`}
          >
            {/* Member name with color indicator */}
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              ></div>
              <h3 className="text-sm font-bold text-slate-100">{member.username.toLowerCase()}</h3>
            </div>

            {/* Compact stats grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {/* Latest Weight */}
              <div className="space-y-0.5">
                <p className="text-xs text-slate-500 font-medium">Latest Weight</p>
                <p className="text-lg font-bold" style={{ color }}>
                  {latestWeight !== null ? `${latestWeight} kg` : '—'}
                </p>
              </div>

              {/* PB Weight */}
              <div className="space-y-0.5">
                <p className="text-xs text-slate-500 font-medium">PB</p>
                <p className="text-lg font-bold" style={{ color: '#eab308' }}>
                  {pbWeight !== null ? `${pbWeight} kg` : '—'}
                </p>
              </div>

              {/* Current BF% */}
              <div className="space-y-0.5">
                <p className="text-xs text-slate-500 font-medium">Current BF%</p>
                <p className="text-lg font-bold" style={{ color }}>
                  {currentBf !== null ? `${currentBf.toFixed(1)}%` : '—'}
                </p>
              </div>

              {/* Current Waist */}
              <div className="space-y-0.5">
                <p className="text-xs text-slate-500 font-medium">Waist</p>
                <p className="text-lg font-bold" style={{ color: '#f97316' }}>
                  {currentWaist !== null ? `${currentWaist.toFixed(1)} cm` : '—'}
                </p>
              </div>

              {/* Goal Weight & BF% - spans full width */}
              <div className="space-y-0.5 col-span-2">
                <p className="text-xs text-slate-500 font-medium">Goal</p>
                <p className="text-lg font-bold text-yellow-300">
                  {member.goal_weight !== null && member.goal_bf !== null
                    ? `${member.goal_weight.toFixed(0)}kg @ ${member.goal_bf.toFixed(0)}%BF`
                    : member.goal_weight !== null
                    ? `${member.goal_weight.toFixed(0)}kg`
                    : '—'}
                </p>
              </div>
            </div>

            {/* Journal Buttons - only show buttons for shared categories */}
            {onViewJournal && member.sharedJournals && (
              (() => {
                const sharedButtons = JOURNAL_BUTTONS.filter(btn => member.sharedJournals?.[btn.key]);
                if (sharedButtons.length === 0) return null;
                return (
                  <div className="pt-2 border-t border-slate-700/50">
                    <p className="text-[10px] text-slate-500 font-medium mb-1.5 uppercase tracking-wider">Journal</p>
                    <div className={`grid gap-1 ${sharedButtons.length === 1 ? 'grid-cols-1' : sharedButtons.length === 2 ? 'grid-cols-2' : sharedButtons.length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                      {sharedButtons.map((btn) => (
                        <button
                          key={btn.key}
                          onClick={() => onViewJournal(member.user_id, member.username, btn.key)}
                          className={`${btn.bgColor} ${btn.hoverColor} text-white text-[10px] font-medium py-1.5 px-1 rounded transition-colors`}
                          data-testid={`button-journal-${btn.key}-${member.username}`}
                        >
                          {btn.shortLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        );
      })}
    </div>
  );
}
