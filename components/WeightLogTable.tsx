import { useState, useEffect } from 'react';

type WeightRow = {
  id: string;
  user_id: string;
  weigh_date: string;
  weight_kg: number;
  inserted_at: string;
  is_monday: boolean;
  is_friday: boolean;
  comment: string | null;
};

type BodyFatRow = {
  id: string;
  user_id: string;
  log_date: string;
  bf_percent: number;
  inserted_at: string;
};

type ProfileData = {
  pb_weight_kg: number | null;
  pb_date: string | null;
};

type CombinedEntry = {
  date: string;
  weight_kg: number | null;
  bf_percent: number | null;
  is_monday: boolean;
  is_friday: boolean;
  is_pb: boolean;
  weekend_status: 'massive_blowout' | 'minor_blowout' | 'decent' | 'solid' | null;
  weight_id: string | null;
  bf_id: string | null;
  comment: string | null;
};

type Props = {
  weights: WeightRow[];
  bodyFatLogs: BodyFatRow[];
  profile: ProfileData | undefined;
  onDelete: (weightIds: string[], bfIds: string[]) => Promise<void>;
  deleting: boolean;
};

function formatDateAU(dateStr: string) {
  // Parse YYYY-MM-DD directly without timezone conversion
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

export default function WeightLogTable({ weights, bodyFatLogs, profile, onDelete, deleting }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Close tooltips when clicking outside
  useEffect(() => {
    function handleClick() {
      setActiveTooltip(null);
    }
    if (activeTooltip) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [activeTooltip]);

  // Combine weights and body fat by date
  const combinedMap = new Map<string, CombinedEntry>();

  // Normalize dates for comparison (remove time component if present)
  const normalizeDate = (d?: string | null) => d?.split('T')[0] ?? null;
  const pbDateNormalized = normalizeDate(profile?.pb_date);

  weights.forEach((w) => {
    const existing = combinedMap.get(w.weigh_date) || {
      date: w.weigh_date,
      weight_kg: null,
      bf_percent: null,
      is_monday: false,
      is_friday: false,
      is_pb: false,
      weekend_status: null,
      weight_id: null,
      bf_id: null,
      comment: null,
    };

    const weighDateNormalized = normalizeDate(w.weigh_date);
    const isPb = pbDateNormalized === weighDateNormalized;

    combinedMap.set(w.weigh_date, {
      ...existing,
      weight_kg: w.weight_kg,
      is_monday: w.is_monday,
      is_friday: w.is_friday,
      is_pb: isPb,
      weekend_status: null, // Will calculate later
      weight_id: w.id,
      comment: w.comment || null,
    });
  });

  bodyFatLogs.forEach((bf) => {
    const existing = combinedMap.get(bf.log_date) || {
      date: bf.log_date,
      weight_kg: null,
      bf_percent: null,
      is_monday: false,
      is_friday: false,
      is_pb: false,
      weekend_status: null,
      weight_id: null,
      bf_id: null,
      comment: null,
    };

    combinedMap.set(bf.log_date, {
      ...existing,
      bf_percent: bf.bf_percent,
      bf_id: bf.id,
    });
  });

  // Calculate weekend status for Monday weigh-ins
  // For each Monday, find the most recent Friday before it
  const mondayWeights = weights.filter((w) => w.is_monday);
  const fridayWeights = weights.filter((w) => w.is_friday);

  mondayWeights.forEach((monday) => {
    // Find all Fridays before this Monday
    const precedingFridays = fridayWeights
      .filter((f) => f.weigh_date < monday.weigh_date)
      .sort((a, b) => a.weigh_date.localeCompare(b.weigh_date)); // Sort ascending

    if (precedingFridays.length > 0) {
      // Get the most recent Friday before this Monday (last in sorted array)
      const precedingFriday = precedingFridays[precedingFridays.length - 1];
      
      const fridayWeight = precedingFriday.weight_kg;
      const mondayWeight = monday.weight_kg;
      const diff = mondayWeight - fridayWeight;

      const entry = combinedMap.get(monday.weigh_date);
      if (entry) {
        // 4-tier weekend status system with inclusive lower bounds
        if (diff >= 3.0) {
          entry.weekend_status = 'massive_blowout';
        } else if (diff >= 2.0) {
          entry.weekend_status = 'minor_blowout';
        } else if (diff >= 1.0) {
          entry.weekend_status = 'decent';
        } else {
          entry.weekend_status = 'solid';
        }
      }
    }
  });

  // Convert to array and sort by date (most recent first)
  const allEntries = Array.from(combinedMap.values()).sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  // Determine what to display
  const entriesToShow = showAll ? allEntries : allEntries.slice(0, 10);
  const hasMore = allEntries.length > 10;

  const toggleSelection = (date: string) => {
    const newSet = new Set(selectedDates);
    if (newSet.has(date)) {
      newSet.delete(date);
    } else {
      newSet.add(date);
    }
    setSelectedDates(newSet);
  };

  const handleDelete = async () => {
    if (selectedDates.size === 0) return;

    const weightIds: string[] = [];
    const bfIds: string[] = [];

    selectedDates.forEach((date) => {
      const entry = combinedMap.get(date);
      if (entry) {
        if (entry.weight_id) weightIds.push(entry.weight_id);
        if (entry.bf_id) bfIds.push(entry.bf_id);
      }
    });

    await onDelete(weightIds, bfIds);
    setSelectedDates(new Set());
    setEditMode(false);
  };

  if (allEntries.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-800/80 bg-slate-900/80 shadow-xl shadow-sky-500/5 px-5 py-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-100">History</h2>
        <button
          onClick={() => {
            setEditMode(!editMode);
            if (editMode) {
              setSelectedDates(new Set());
            }
          }}
          className="text-sm font-semibold text-sky-400 hover:text-sky-300 transition-colors min-h-11 px-3"
          data-testid="button-toggle-edit"
        >
          {editMode ? 'Cancel' : 'Edit'}
        </button>
      </div>

      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-800">
              {editMode && <th className="text-left py-2 pr-3"></th>}
              <th className="text-left py-2 pr-3">Date</th>
              <th className="text-left py-2 pr-3">Logged</th>
              <th className="text-left py-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {entriesToShow.map((entry) => (
              <tr key={entry.date} className="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors">
                {editMode && (
                  <td className="py-3 pr-3">
                    <input
                      type="checkbox"
                      checked={selectedDates.has(entry.date)}
                      onChange={() => toggleSelection(entry.date)}
                      className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900"
                      data-testid={`checkbox-entry-${entry.date}`}
                    />
                  </td>
                )}
                <td className="py-3 pr-3 text-slate-300 font-medium whitespace-nowrap">
                  {formatDateAU(entry.date)}
                </td>
                <td className="py-3 pr-3 text-slate-100">
                  <div className="flex flex-col">
                    <span className="whitespace-nowrap">
                      {entry.weight_kg !== null && entry.bf_percent !== null && (
                        <>{entry.weight_kg} kg, {entry.bf_percent.toFixed(1)}%</>
                      )}
                      {entry.weight_kg !== null && entry.bf_percent === null && (
                        <>{entry.weight_kg} kg</>
                      )}
                      {entry.weight_kg === null && entry.bf_percent !== null && (
                        <>{entry.bf_percent.toFixed(1)}%</>
                      )}
                      {entry.weight_kg === null && entry.bf_percent === null && <>—</>}
                    </span>
                    {entry.comment && (
                      <span className="text-xs text-slate-400 mt-1 italic line-clamp-2" data-testid={`text-comment-${entry.date}`}>
                        {entry.comment}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-1.5 flex-wrap relative">
                    {entry.weekend_status === 'massive_blowout' && (
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTooltip(activeTooltip === `${entry.date}-massive` ? null : `${entry.date}-massive`);
                          }}
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600/30 text-red-200 border border-red-500/60 text-[10px] font-bold cursor-pointer hover:bg-red-600/40 transition-colors"
                          type="button"
                          data-testid="button-tooltip-massive"
                        >
                          ☢️
                        </button>
                        {activeTooltip === `${entry.date}-massive` && (
                          <div className="absolute z-50 mt-1 left-0 bg-slate-800 border border-red-500/60 rounded-lg px-2 py-1 text-[10px] text-red-200 whitespace-nowrap shadow-xl">
                            Massive BlowOut! (≥3.0kg)
                          </div>
                        )}
                      </div>
                    )}
                    {entry.weekend_status === 'minor_blowout' && (
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTooltip(activeTooltip === `${entry.date}-minor` ? null : `${entry.date}-minor`);
                          }}
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500/20 text-orange-200 border border-orange-500/50 text-[10px] font-bold cursor-pointer hover:bg-orange-500/30 transition-colors"
                          type="button"
                          data-testid="button-tooltip-minor"
                        >
                          🧨
                        </button>
                        {activeTooltip === `${entry.date}-minor` && (
                          <div className="absolute z-50 mt-1 left-0 bg-slate-800 border border-orange-500/50 rounded-lg px-2 py-1 text-[10px] text-orange-200 whitespace-nowrap shadow-xl">
                            Minor BlowOut (≥2.0kg)
                          </div>
                        )}
                      </div>
                    )}
                    {entry.weekend_status === 'decent' && (
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTooltip(activeTooltip === `${entry.date}-decent` ? null : `${entry.date}-decent`);
                          }}
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-500/20 text-yellow-200 border border-yellow-500/50 text-[10px] font-bold cursor-pointer hover:bg-yellow-500/30 transition-colors"
                          type="button"
                          data-testid="button-tooltip-decent"
                        >
                          👍
                        </button>
                        {activeTooltip === `${entry.date}-decent` && (
                          <div className="absolute z-50 mt-1 left-0 bg-slate-800 border border-yellow-500/50 rounded-lg px-2 py-1 text-[10px] text-yellow-200 whitespace-nowrap shadow-xl">
                            Decent Weekend (≥1.0kg)
                          </div>
                        )}
                      </div>
                    )}
                    {entry.weekend_status === 'solid' && (
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTooltip(activeTooltip === `${entry.date}-solid` ? null : `${entry.date}-solid`);
                          }}
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-500/40 text-[10px] font-bold cursor-pointer hover:bg-emerald-500/25 transition-colors"
                          type="button"
                          data-testid="button-tooltip-solid"
                        >
                          💪
                        </button>
                        {activeTooltip === `${entry.date}-solid` && (
                          <div className="absolute z-50 mt-1 left-0 bg-slate-800 border border-emerald-500/40 rounded-lg px-2 py-1 text-[10px] text-emerald-200 whitespace-nowrap shadow-xl">
                            Solid Weekend! (&lt;1.0kg)
                          </div>
                        )}
                      </div>
                    )}
                    {entry.is_pb && (
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTooltip(activeTooltip === `${entry.date}-pb` ? null : `${entry.date}-pb`);
                          }}
                          className="inline-flex items-center rounded-full bg-yellow-500/15 text-yellow-200 border border-yellow-500/40 px-2 py-[2px] text-[10px] font-bold cursor-pointer hover:bg-yellow-500/25 transition-colors"
                          type="button"
                          data-testid="button-tooltip-pb"
                        >
                          PB
                        </button>
                        {activeTooltip === `${entry.date}-pb` && (
                          <div className="absolute z-50 mt-1 left-0 bg-slate-800 border border-yellow-500/40 rounded-lg px-2 py-1 text-[10px] text-yellow-200 whitespace-nowrap shadow-xl">
                            Personal Best
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {hasMore && !editMode && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm font-semibold text-slate-400 hover:text-slate-300 transition-colors min-h-11 px-3"
            data-testid="button-toggle-history"
          >
            {showAll ? 'Show Recent Only' : `Show Full History (${allEntries.length} entries)`}
          </button>
        )}

        {editMode && selectedDates.size > 0 && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="ml-auto inline-flex items-center justify-center rounded-xl border border-red-500/60 bg-red-500/10 px-4 min-h-11 text-sm font-semibold text-red-200 hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-delete-selected"
          >
            {deleting ? 'Deleting...' : `Delete Selected (${selectedDates.size})`}
          </button>
        )}
      </div>
    </section>
  );
}
