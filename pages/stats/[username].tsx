// pages/stats/[username].tsx
// Public stats page for viewing a user's shared workout history

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { formatDateDDMMYYYY } from '../../lib/dateUtils';
import { sortExerciseTypes } from '../../lib/exercises';
import { HiitTooltip } from '../../components/HiitTooltip';

interface ExerciseType {
  id: string;
  name: string;
  unit_type: string;
  unit_label: string;
}

interface Activity {
  id: string;
  value: number;
  entry_date: string;
  created_at: string;
  notes: string | null;
  exercise_types: ExerciseType;
}

interface FlapsEntry {
  id: string;
  entry_date: string;
  duration_minutes: number;
  avg_heart_rate: number | null;
  calories_burned: number | null;
  exercise_mode: string;
  distance_km: string | null;
  custom_exercise: string | null;
  hiit_details: {
    rounds?: number;
    work_seconds?: number;
    rest_seconds?: number;
    exercises?: string;
  } | null;
  created_at: string;
}

interface FlapsTotals {
  totalDuration: number;
  totalCalories: number;
  totalDistance: number;
  entryCount: number;
}

type DateRangeType = 'today' | 'week' | 'month' | 'all' | 'custom';

const FLAPS_MODES = ['Ride', 'Run', 'Walk', 'Hike', 'Swim', 'HIIT', 'Custom'];

export default function UserStatsPage() {
  const router = useRouter();
  const { username } = router.query;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayUsername, setDisplayUsername] = useState('');
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  // Sub-tab: Activity or Flaps
  const [historySubTab, setHistorySubTab] = useState<'activity' | 'flaps'>('activity');

  // Activity state
  const [activities, setActivities] = useState<Activity[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [exerciseTypes, setExerciseTypes] = useState<ExerciseType[]>([]);
  const sortedExerciseTypes = useMemo(() => sortExerciseTypes(exerciseTypes), [exerciseTypes]);

  // Flaps state
  const [flapsEntries, setFlapsEntries] = useState<FlapsEntry[]>([]);
  const [flapsTotals, setFlapsTotals] = useState<FlapsTotals>({ totalDuration: 0, totalCalories: 0, totalDistance: 0, entryCount: 0 });
  const [flapsLoading, setFlapsLoading] = useState(false);

  // Filters
  const [dateRange, setDateRange] = useState<DateRangeType>('week');
  const [exerciseFilter, setExerciseFilter] = useState<string>('all');
  const [flapsExerciseFilter, setFlapsExerciseFilter] = useState<string>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const fetchStats = async () => {
    if (!username) return;

    setLoading(true);
    try {
      // Build query params based on date range
      const params = new URLSearchParams();
      
      if (dateRange === 'custom') {
        if (customStartDate) params.set('start_date', customStartDate);
        if (customEndDate) params.set('end_date', customEndDate);
      } else if (dateRange !== 'all') {
        const today = new Date();
        let startDate = new Date();
        
        if (dateRange === 'today') {
          startDate = today;
        } else if (dateRange === 'week') {
          startDate.setDate(today.getDate() - 7);
        } else if (dateRange === 'month') {
          startDate.setMonth(today.getMonth() - 1);
        }
        
        params.set('start_date', startDate.toISOString().split('T')[0]);
      }
      
      if (exerciseFilter !== 'all') {
        const exerciseType = exerciseTypes.find(et => et.name === exerciseFilter);
        if (exerciseType) {
          params.set('exercise_type_id', exerciseType.id);
        }
      }

      const url = `/api/stats/${username}${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        if (res.status === 403) {
          setError('This user has not shared their workout history');
        } else if (res.status === 404) {
          setError('User not found');
        } else {
          setError(data.error || 'Failed to load stats');
        }
        setLoading(false);
        return;
      }

      setActivities(data.activities || []);
      setTotals(data.totals || {});
      setExerciseTypes(data.exercise_types || []);
      setDisplayUsername(data.username);
      setIsOwnProfile(data.is_own_profile);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const fetchFlaps = async () => {
    if (!username) return;

    setFlapsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('dateRange', dateRange);
      if (dateRange === 'custom') {
        if (customStartDate) params.set('startDate', customStartDate);
        if (customEndDate) params.set('endDate', customEndDate);
      }
      if (flapsExerciseFilter !== 'all') {
        params.set('exerciseMode', flapsExerciseFilter);
      }

      const res = await fetch(`/api/stats/${username}/flaps?${params.toString()}`, { credentials: 'include' });
      const data = await res.json();

      if (res.ok && data.ok) {
        setFlapsEntries(data.entries || []);
        setFlapsTotals(data.totals || { totalDuration: 0, totalCalories: 0, totalDistance: 0, entryCount: 0 });
        if (data.username) setDisplayUsername(data.username);
        if (data.isOwnProfile !== undefined) setIsOwnProfile(data.isOwnProfile);
      }
    } catch (err) {
      console.error('Failed to fetch flaps:', err);
    } finally {
      setFlapsLoading(false);
    }
  };

  useEffect(() => {
    if (username) {
      fetchStats();
    }
  }, [username, dateRange, exerciseFilter, customStartDate, customEndDate]);

  useEffect(() => {
    if (username && historySubTab === 'flaps') {
      fetchFlaps();
    }
  }, [username, historySubTab, dateRange, flapsExerciseFilter, customStartDate, customEndDate]);

  // Filter activities locally by exercise type (for display)
  const filteredActivities = activities.filter(a => 
    exerciseFilter === 'all' || a.exercise_types?.name === exerciseFilter
  );

  // Filter flaps locally
  const filteredFlaps = flapsEntries.filter(e =>
    flapsExerciseFilter === 'all' || e.exercise_mode === flapsExerciseFilter
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4" data-testid="stats-loading">
        <div className="max-w-2xl mx-auto pt-8 text-center">
          <div className="animate-pulse">Loading stats...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4" data-testid="stats-error">
        <div className="max-w-2xl mx-auto pt-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Workout Stats</h1>
          <p className="text-gray-400 mb-4">{error}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href="/dashboard"
              className="inline-block bg-emerald-600 hover:bg-emerald-700 px-6 py-2 rounded-lg"
              data-testid="link-dashboard"
            >
              Dashboard
            </Link>
            <Link
              href="/warzone"
              className="inline-block bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg"
              data-testid="link-warzone"
            >
              Warzone
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white" data-testid="stats-page">
      <div className="max-w-2xl mx-auto p-4">
        <header className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h1 className="text-2xl font-bold" data-testid="text-stats-title">
              {displayUsername}'s Workout Log
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-xl border border-slate-500/60 bg-slate-500/15 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-500/25 transition-colors"
                data-testid="link-dashboard"
              >
                Dashboard
              </Link>
              <Link
                href="/team"
                className="inline-flex items-center justify-center rounded-xl border border-indigo-500/60 bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-100 hover:bg-indigo-500/25 transition-colors"
                data-testid="link-team"
              >
                Team Shred
              </Link>
              <Link
                href="/warzone"
                className="inline-flex items-center justify-center rounded-xl border border-red-500/60 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-500/25 transition-colors"
                data-testid="link-warzone"
              >
                Warzone
              </Link>
              <Link
                href="/tracker"
                className="inline-flex items-center justify-center rounded-xl border border-emerald-500/60 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25 transition-colors"
                data-testid="link-tracker"
              >
                Apollo
              </Link>
            </div>
          </div>
          {isOwnProfile && (
            <p className="text-sm text-emerald-500">Viewing your own stats</p>
          )}
        </header>

        {/* Activity/Flaps Sub-tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setHistorySubTab('activity')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              historySubTab === 'activity'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            data-testid="btn-subtab-activity"
          >
            Activity
          </button>
          <button
            onClick={() => setHistorySubTab('flaps')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              historySubTab === 'flaps'
                ? 'bg-rose-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            data-testid="btn-subtab-flaps"
          >
            Flaps
          </button>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap gap-3 mb-4">
          {/* Date Range Dropdown */}
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-gray-400 mb-1">Date Range</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRangeType)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
              data-testid="select-date-range"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="all">All Time</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {/* Exercise Type Dropdown - Activity */}
          {historySubTab === 'activity' && (
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs text-gray-400 mb-1">Exercise Type</label>
              <select
                value={exerciseFilter}
                onChange={(e) => setExerciseFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                data-testid="select-exercise-type"
              >
                <option value="all">All Exercises</option>
                {sortedExerciseTypes.map(et => (
                  <option key={et.id} value={et.name}>{et.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Exercise Mode Dropdown - Flaps */}
          {historySubTab === 'flaps' && (
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs text-gray-400 mb-1">Exercise Mode</label>
              <select
                value={flapsExerciseFilter}
                onChange={(e) => setFlapsExerciseFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                data-testid="select-flaps-mode"
              >
                <option value="all">All Modes</option>
                {FLAPS_MODES.map(mode => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Custom Date Range Inputs */}
        {dateRange === 'custom' && (
          <div className="flex flex-wrap gap-3 mb-4 p-3 bg-gray-800 rounded-lg border border-purple-700/50">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">From:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
                data-testid="input-custom-start-date"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">To:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
                data-testid="input-custom-end-date"
              />
            </div>
          </div>
        )}

        {/* Activity History Section */}
        {historySubTab === 'activity' && (
          <section className="mb-8">
            {/* Totals Summary */}
            {Object.keys(totals).length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4 border border-purple-700/50 mb-4">
                <h3 className="text-sm font-medium text-gray-400 mb-2">
                  {dateRange === 'all' ? 'All-Time' : dateRange === 'today' ? "Today's" : dateRange === 'week' ? "This Week's" : dateRange === 'month' ? "This Month's" : 'Custom Range'} Totals
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {sortedExerciseTypes
                    .filter(et => exerciseFilter === 'all' || exerciseFilter === et.name)
                    .map(et => {
                      const total = totals[et.id] || 0;
                      if (total === 0) return null;
                      return (
                        <div key={et.id} className="bg-gray-700 rounded p-2">
                          <div className="text-xs text-gray-400">{et.name}</div>
                          <div className="font-bold text-purple-300">
                            {(et.unit_type === 'km' || et.unit_type === 'distance') ? total.toFixed(1) : Math.round(total)} {et.unit_label}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Activity Table */}
            {filteredActivities.length === 0 ? (
              <div className="text-center py-8 text-gray-500" data-testid="empty-activities">
                <p>No activities found</p>
                {(dateRange !== 'all' || exerciseFilter !== 'all') && (
                  <p className="text-sm mt-2">Try adjusting your filters</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm" data-testid="history-table">
                  <thead className="bg-gray-700 text-gray-300">
                    <tr>
                      <th className="px-2 py-2 rounded-tl-lg">Date</th>
                      <th className="px-2 py-2">Exercise</th>
                      <th className="px-2 py-2 text-right rounded-tr-lg">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filteredActivities.map(activity => (
                      <tr
                        key={activity.id}
                        className="bg-gray-800 hover:bg-gray-750"
                        data-testid={`activity-row-${activity.id}`}
                      >
                        <td className="px-2 py-2 text-gray-400">
                          {formatDateDDMMYYYY(activity.entry_date)}
                        </td>
                        <td className="px-2 py-2 font-medium text-purple-300">
                          {activity.exercise_types?.name}
                          {activity.notes && (
                            <div className="text-xs text-gray-500 mt-0.5">{activity.notes}</div>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-bold text-purple-300">
                          {(activity.exercise_types?.unit_type === 'km' || activity.exercise_types?.unit_type === 'distance')
                            ? Number(activity.value).toFixed(1)
                            : Math.round(Number(activity.value))} {activity.exercise_types?.unit_label}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Refresh Button */}
            <button
              onClick={() => fetchStats()}
              className="w-full mt-4 bg-gray-700 hover:bg-gray-600 py-2 rounded-lg text-sm"
              data-testid="btn-refresh-history"
            >
              Refresh History
            </button>
          </section>
        )}

        {/* Flaps History Section */}
        {historySubTab === 'flaps' && (
          <section className="mb-8">
            {/* Flaps Totals */}
            {flapsTotals.entryCount > 0 && (
              <div className="bg-gray-800 rounded-lg p-4 border border-rose-700/50 mb-4">
                <h3 className="text-sm font-medium text-gray-400 mb-2">
                  {dateRange === 'all' ? 'All-Time' : dateRange === 'today' ? "Today's" : dateRange === 'week' ? "This Week's" : dateRange === 'month' ? "This Month's" : 'Custom Range'} Totals
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-gray-700 rounded p-2">
                    <div className="text-xs text-gray-400">Sessions</div>
                    <div className="font-bold text-rose-300">{flapsTotals.entryCount}</div>
                  </div>
                  <div className="bg-gray-700 rounded p-2">
                    <div className="text-xs text-gray-400">Duration</div>
                    <div className="font-bold text-rose-300">{flapsTotals.totalDuration} min</div>
                  </div>
                  <div className="bg-gray-700 rounded p-2">
                    <div className="text-xs text-gray-400">Distance</div>
                    <div className="font-bold text-rose-300">{flapsTotals.totalDistance.toFixed(1)} km</div>
                  </div>
                  <div className="bg-gray-700 rounded p-2">
                    <div className="text-xs text-gray-400">Calories</div>
                    <div className="font-bold text-rose-300">{flapsTotals.totalCalories}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Flaps Table */}
            {flapsLoading ? (
              <div className="text-center py-8 text-gray-500">
                <div className="animate-pulse">Loading Flaps history...</div>
              </div>
            ) : filteredFlaps.length === 0 ? (
              <div className="text-center py-8 text-gray-500" data-testid="empty-flaps">
                <p>No Flaps entries found</p>
                {(dateRange !== 'all' || flapsExerciseFilter !== 'all') && (
                  <p className="text-sm mt-2">Try adjusting your filters</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm" data-testid="flaps-history-table">
                  <thead className="bg-gray-700 text-gray-300">
                    <tr>
                      <th className="px-2 py-2 rounded-tl-lg">Date</th>
                      <th className="px-2 py-2">Exercise</th>
                      <th className="px-2 py-2 text-right">Time</th>
                      <th className="px-2 py-2 text-right">Km</th>
                      <th className="px-2 py-2 text-right">Avg HR</th>
                      <th className="px-2 py-2 text-right rounded-tr-lg">Cal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filteredFlaps.map(entry => (
                      <tr
                        key={entry.id}
                        className="bg-gray-800 hover:bg-gray-750"
                        data-testid={`flaps-row-${entry.id}`}
                      >
                        <td className="px-2 py-2 text-gray-400">
                          {formatDateDDMMYYYY(entry.entry_date)}
                        </td>
                        <td className="px-2 py-2 font-medium text-rose-300">
                          <div className="flex items-center gap-1">
                            <span>{entry.exercise_mode === 'Custom' ? entry.custom_exercise || 'Custom' : entry.exercise_mode}</span>
                            {entry.exercise_mode === 'HIIT' && entry.hiit_details && (
                              <HiitTooltip 
                                hiitDetails={entry.hiit_details} 
                                testId={`hiit-info-stats-${entry.id}`}
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right text-gray-300">
                          {entry.duration_minutes} min
                        </td>
                        <td className="px-2 py-2 text-right text-gray-300">
                          {entry.distance_km && parseFloat(entry.distance_km) > 0 ? parseFloat(entry.distance_km).toFixed(1) : '-'}
                        </td>
                        <td className="px-2 py-2 text-right text-gray-300">
                          {entry.avg_heart_rate || '-'}
                        </td>
                        <td className="px-2 py-2 text-right text-gray-300">
                          {entry.calories_burned || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Refresh Button */}
            <button
              onClick={() => fetchFlaps()}
              disabled={flapsLoading}
              className="w-full mt-4 bg-gray-700 hover:bg-gray-600 py-2 rounded-lg text-sm disabled:opacity-50"
              data-testid="btn-refresh-flaps"
            >
              Refresh History
            </button>
          </section>
        )}

        {/* Back to Warzone Button */}
        <div className="mt-8 pb-8">
          <Link
            href="/warzone"
            className="block w-full text-center bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
            data-testid="button-back-warzone"
          >
            Back to Warzone
          </Link>
        </div>
      </div>
    </div>
  );
}
