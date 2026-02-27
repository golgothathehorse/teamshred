// pages/tracker/index.tsx
// The Apollo - Today's Missions and Activity Tracking

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import { parseSessionFromRequest } from '../../lib/auth';
import { formatDateDDMMYYYY, getSydneyDateString } from '../../lib/dateUtils';
import { sortExerciseTypes } from '../../lib/exercises';
import { HiitTooltip } from '../../components/HiitTooltip';
import SeshTab from '../../components/SeshTab';

// Server-side authentication check
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const user = parseSessionFromRequest(ctx.req);
  
  if (!user) {
    return { redirect: { destination: '/login', permanent: false } };
  }
  
  return { props: {} };
};

interface TaskWithProgress {
  challenge_id: string;
  challenge_title: string;
  challenge_scope: string;
  starts_on: string;
  ends_on: string;
  task_id: string;
  task_name: string;
  unit_type: string;
  unit_label: string;
  target_type: string;
  target_value: number | null;
  today_progress: number;
  overall_progress: number;
}

interface ExerciseType {
  id: string;
  name: string;
  unit_type: string;
  unit_label: string;
}

interface ActivityEntry {
  id: string;
  value: number;
  entry_date: string;
  created_at: string;
  notes: string | null;
  exercise_types: ExerciseType;
}

interface PendingEntry {
  [taskId: string]: number;
}

export default function RepTrackerPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskWithProgress[]>([]);
  const [today, setToday] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingEntry>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Quick Log state
  const [exerciseTypes, setExerciseTypes] = useState<ExerciseType[]>([]);
  const sortedExerciseTypes = useMemo(() => sortExerciseTypes(exerciseTypes), [exerciseTypes]);
  const [selectedExercise, setSelectedExercise] = useState<string>('');
  const [quickLogValue, setQuickLogValue] = useState<number>(0);
  const [quickLogSubmitting, setQuickLogSubmitting] = useState(false);
  const [retroMode, setRetroMode] = useState(false);
  const [retroDate, setRetroDate] = useState<string>('');

  // Activity History state
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [activityTotals, setActivityTotals] = useState<Record<string, number>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // History filters - default to week, expand to month
  const [historyDateRange, setHistoryDateRange] = useState<'today' | 'week' | 'month' | 'all' | 'custom'>('week');
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyExerciseFilter, setHistoryExerciseFilter] = useState<string>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  
  // History sub-tab toggle (Activity vs Flaps vs Sesh)
  const [historySubTab, setHistorySubTab] = useState<'activity' | 'flaps' | 'sesh'>('activity');

  // Sesh History state
  const [seshHistory, setSeshHistory] = useState<any[]>([]);
  const [seshHistoryLoading, setSeshHistoryLoading] = useState(false);
  const [seshHistoryDateRange, setSeshHistoryDateRange] = useState<'week' | 'month' | 'all'>('month');

  // Active tab - Quick Log is the default landing page
  const [activeTab, setActiveTab] = useState<'missions' | 'quicklog' | 'sesh' | 'thering' | 'history' | 'flaps'>('quicklog');

  // Flaps logging state
  const [flapsDuration, setFlapsDuration] = useState<number>(30);
  const [flapsHeartRate, setFlapsHeartRate] = useState<number>(0);
  const [flapsCalories, setFlapsCalories] = useState<number>(0);
  const [flapsExerciseMode, setFlapsExerciseMode] = useState<string>('Ride');
  const [flapsDistance, setFlapsDistance] = useState<number>(0);
  const [flapsHiitRounds, setFlapsHiitRounds] = useState<number>(0);
  const [flapsHiitWorkSeconds, setFlapsHiitWorkSeconds] = useState<number>(30);
  const [flapsHiitRestSeconds, setFlapsHiitRestSeconds] = useState<number>(15);
  const [flapsHiitExercises, setFlapsHiitExercises] = useState<string>('');
  const [flapsCustomExercise, setFlapsCustomExercise] = useState<string>('');
  const [flapsNotes, setFlapsNotes] = useState<string>('');
  const [flapsSubmitting, setFlapsSubmitting] = useState(false);
  const [flapsRetroMode, setFlapsRetroMode] = useState(false);
  const [flapsRetroDate, setFlapsRetroDate] = useState<string>('');
  const [flapsProgressData, setFlapsProgressData] = useState<any[]>([]);

  // Flaps History state
  const [flapsHistory, setFlapsHistory] = useState<any[]>([]);
  const [flapsHistoryTotals, setFlapsHistoryTotals] = useState<Record<string, { duration: number; distance: number; calories: number; entries: number }>>({});
  const [flapsHistoryLoading, setFlapsHistoryLoading] = useState(false);
  const [flapsHistoryDateRange, setFlapsHistoryDateRange] = useState<'today' | 'week' | 'month' | 'all' | 'custom'>('week');
  const [flapsHistoryExpanded, setFlapsHistoryExpanded] = useState(false);
  const [flapsHistoryCustomStart, setFlapsHistoryCustomStart] = useState<string>('');
  const [flapsHistoryCustomEnd, setFlapsHistoryCustomEnd] = useState<string>('');
  const [deletingFlapsEntry, setDeletingFlapsEntry] = useState<string | null>(null);

  // Share settings state
  const [shareWorkoutHistory, setShareWorkoutHistory] = useState(false);
  const [savingShare, setSavingShare] = useState(false);

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<string | null>(null);

  const deleteChallenge = async (challengeId: string) => {
    if (!confirm('Are you sure you want to delete this challenge? This action cannot be undone.')) {
      return;
    }

    setDeleting(challengeId);
    try {
      const res = await fetch(`/api/warzone/challenges/${challengeId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || 'Failed to delete challenge');
        return;
      }

      setTasks(prev => prev.filter(t => t.challenge_id !== challengeId));
    } catch (err) {
      console.error('Error deleting challenge:', err);
      alert('Failed to delete challenge');
    } finally {
      setDeleting(null);
    }
  };

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tracker/today', { credentials: 'include' });
      const data = await res.json();

      if (res.status === 401) {
        setError('Please log in to use The Apollo');
        setLoading(false);
        return;
      }

      if (!data.ok) {
        setError(data.error || 'Failed to load tasks');
        setLoading(false);
        return;
      }

      setTasks(data.tasks || []);
      setToday(data.today || '');
      setError(null);
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const fetchFlapsProgress = async () => {
    try {
      const res = await fetch('/api/tracker/flaps-progress', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.challenges) {
          setFlapsProgressData(data.challenges);
        }
      }
    } catch (err) {
      console.error('Failed to fetch flaps progress:', err);
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/profile', { credentials: 'include' });
      const data = await res.json();
      if (data.ok && data.profile) {
        setShareWorkoutHistory(data.profile.share_workout_history ?? false);
        // Also sync to localStorage for fallback
        if (typeof window !== 'undefined') {
          localStorage.setItem('share_workout_history', String(data.profile.share_workout_history ?? false));
        }
        return;
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    }
    // Fallback: Load from localStorage if API fails
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('share_workout_history');
      if (stored !== null) {
        setShareWorkoutHistory(stored === 'true');
      }
    }
  };

  const toggleShareWorkoutHistory = async () => {
    setSavingShare(true);
    const newValue = !shareWorkoutHistory;
    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ shareWorkoutHistory: newValue }),
      });
      const data = await res.json();
      if (data.ok) {
        setShareWorkoutHistory(data.profile?.share_workout_history ?? newValue);
        // Sync to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem('share_workout_history', String(data.profile?.share_workout_history ?? newValue));
        }
      } else {
        // API failed, save to localStorage as fallback
        console.log('API update failed, falling back to localStorage:', data.error);
        if (typeof window !== 'undefined') {
          localStorage.setItem('share_workout_history', String(newValue));
        }
        setShareWorkoutHistory(newValue);
      }
    } catch (err) {
      console.error('Failed to update share setting:', err);
      // Fallback to localStorage on error
      if (typeof window !== 'undefined') {
        localStorage.setItem('share_workout_history', String(newValue));
      }
      setShareWorkoutHistory(newValue);
    } finally {
      setSavingShare(false);
    }
  };

  const fetchExerciseTypes = async () => {
    try {
      const res = await fetch('/api/exercise-types', { credentials: 'include' });
      const data = await res.json();
      if (data.ok) {
        setExerciseTypes(data.exercise_types || []);
        if (data.exercise_types?.length > 0) {
          // Try to restore last selected exercise from localStorage
          const savedExerciseId = typeof window !== 'undefined' 
            ? localStorage.getItem('apollo_last_exercise') 
            : null;
          const validExercise = savedExerciseId && data.exercise_types.some((e: ExerciseType) => e.id === savedExerciseId);
          setSelectedExercise(validExercise ? savedExerciseId : data.exercise_types[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching exercise types:', err);
    }
  };

  const fetchActivityHistory = async (dateRange?: string) => {
    setHistoryLoading(true);
    try {
      const range = dateRange || historyDateRange;
      const params = new URLSearchParams();
      if (range === 'custom') {
        if (customStartDate) params.set('start_date', customStartDate);
        if (customEndDate) params.set('end_date', customEndDate);
      } else if (range !== 'all') {
        params.set('date_range', range);
      }
      const url = `/api/activity-log${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      if (data.ok) {
        setActivities(data.activities || []);
        setActivityTotals(data.totals || {});
        if (data.is_admin !== undefined) {
          setIsAdmin(data.is_admin);
        }
      }
    } catch (err) {
      console.error('Error fetching activity history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const deleteActivity = async (entryId: string) => {
    if (!confirm('Delete this activity entry?')) return;
    
    setDeletingEntry(entryId);
    try {
      const res = await fetch(`/api/activity-log/${entryId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.ok) {
        setActivities(prev => prev.filter(a => a.id !== entryId));
        fetchActivityHistory();
      } else {
        alert(data.error || 'Failed to delete entry');
      }
    } catch (err) {
      console.error('Error deleting activity:', err);
      alert('Failed to delete entry');
    } finally {
      setDeletingEntry(null);
    }
  };

  const fetchFlapsHistory = async (dateRange?: string) => {
    setFlapsHistoryLoading(true);
    try {
      const range = dateRange || flapsHistoryDateRange;
      const params = new URLSearchParams();
      if (range === 'custom') {
        if (flapsHistoryCustomStart) params.set('start_date', flapsHistoryCustomStart);
        if (flapsHistoryCustomEnd) params.set('end_date', flapsHistoryCustomEnd);
      } else if (range !== 'all') {
        params.set('date_range', range);
      }
      const url = `/api/tracker/flaps${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      if (data.ok) {
        setFlapsHistory(data.entries || []);
        setFlapsHistoryTotals(data.totals || {});
      }
    } catch (err) {
      console.error('Error fetching flaps history:', err);
    } finally {
      setFlapsHistoryLoading(false);
    }
  };

  const fetchSeshHistory = async () => {
    setSeshHistoryLoading(true);
    try {
      const res = await fetch('/api/gym/session-stats', { credentials: 'include' });
      const data = await res.json();
      if (data.ok) {
        setSeshHistory(data.sessions || []);
      }
    } catch (err) {
      console.error('Error fetching sesh history:', err);
    } finally {
      setSeshHistoryLoading(false);
    }
  };

  const deleteFlapsEntry = async (entryId: string) => {
    if (!confirm('Delete this Flaps entry?')) return;
    
    setDeletingFlapsEntry(entryId);
    try {
      const res = await fetch(`/api/tracker/flaps/${entryId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.ok) {
        setFlapsHistory(prev => prev.filter(e => e.id !== entryId));
        fetchFlapsHistory();
      } else {
        alert(data.error || 'Failed to delete entry');
      }
    } catch (err) {
      console.error('Error deleting flaps entry:', err);
      alert('Failed to delete entry');
    } finally {
      setDeletingFlapsEntry(null);
    }
  };

  // Read initial tab from URL query param
  useEffect(() => {
    if (router.query.tab && typeof router.query.tab === 'string') {
      const validTabs = ['missions', 'quicklog', 'sesh', 'thering', 'history', 'flaps'];
      if (validTabs.includes(router.query.tab)) {
        setActiveTab(router.query.tab as typeof activeTab);
      }
    }
  }, [router.query.tab]);

  useEffect(() => {
    fetchTasks();
    fetchExerciseTypes();
    fetchProfile();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      if (historySubTab === 'activity') {
        fetchActivityHistory();
      } else if (historySubTab === 'flaps') {
        fetchFlapsHistory();
      } else if (historySubTab === 'sesh') {
        fetchSeshHistory();
      }
    } else if (activeTab === 'missions') {
      fetchTasks();
      fetchFlapsProgress();
    } else if (activeTab === 'flaps') {
      fetchFlapsHistory();
    }
  }, [activeTab, historySubTab, historyDateRange, customStartDate, customEndDate, flapsHistoryDateRange, flapsHistoryCustomStart, flapsHistoryCustomEnd]);

  const addPending = (taskId: string, amount: number) => {
    setPending(prev => ({
      ...prev,
      [taskId]: (prev[taskId] || 0) + amount,
    }));
  };

  const clearPending = (taskId: string) => {
    setPending(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const submitEntry = async (task: TaskWithProgress) => {
    const value = pending[task.task_id];
    if (!value || value <= 0) return;

    setSubmitting(task.task_id);
    try {
      const res = await fetch('/api/tracker/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          task_id: task.task_id,
          challenge_id: task.challenge_id,
          value,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setTasks(prev =>
          prev.map(t =>
            t.task_id === task.task_id
              ? {
                  ...t,
                  today_progress: data.today_progress,
                  overall_progress: data.overall_progress,
                }
              : t
          )
        );
        clearPending(task.task_id);
      } else {
        alert(data.error || 'Failed to save');
      }
    } catch (err) {
      alert('Failed to save entry');
    } finally {
      setSubmitting(null);
    }
  };

  const submitQuickLog = async () => {
    if (!selectedExercise || quickLogValue <= 0) return;
    
    // Validate retro date if in retro mode
    if (retroMode && !retroDate) {
      alert('Please select a date for retrospective logging');
      return;
    }

    setQuickLogSubmitting(true);
    try {
      const payload: { exercise_type_id: string; value: number; entry_date?: string } = {
        exercise_type_id: selectedExercise,
        value: quickLogValue,
      };
      
      if (retroMode && retroDate) {
        payload.entry_date = retroDate;
      }
      
      const res = await fetch('/api/activity-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.ok) {
        setQuickLogValue(0);
        if (retroMode) {
          setRetroMode(false);
          setRetroDate('');
        }
        // Refresh activity history
        fetchActivityHistory();
        // Also refresh challenge tasks in case the activity counted toward challenges
        fetchTasks();
        // Silent success - no popup needed
      } else {
        alert(data.error || 'Failed to log activity');
      }
    } catch (err) {
      alert('Failed to log activity');
    } finally {
      setQuickLogSubmitting(false);
    }
  };

  const getProgressDisplay = (task: TaskWithProgress) => {
    // Handle both 'daily' and 'per_day' target types
    if (task.target_type === 'daily' || task.target_type === 'per_day') {
      return {
        current: task.today_progress,
        target: task.target_value,
        label: 'Daily Goal',
        isDaily: true,
        overall: task.overall_progress,
      };
    }
    return {
      current: task.overall_progress,
      target: task.target_value,
      label: 'Overall Goal',
      isDaily: false,
      overall: task.overall_progress,
    };
  };

  const getProgressPercent = (task: TaskWithProgress) => {
    const { current, target } = getProgressDisplay(task);
    if (!target) return 0;
    return Math.min(100, (current / target) * 100);
  };

  const selectedExerciseType = exerciseTypes.find(e => e.id === selectedExercise);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4" data-testid="tracker-loading">
        <div className="max-w-md mx-auto pt-8 text-center">
          <div className="animate-pulse">Loading The Apollo...</div>
        </div>
      </div>
    );
  }

  if (error === 'Please log in to use The Apollo') {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4" data-testid="tracker-login-required">
        <div className="max-w-md mx-auto pt-8 text-center">
          <h1 className="text-2xl font-bold mb-4">The Apollo</h1>
          <p className="text-gray-400 mb-4">Please log in to use The Apollo</p>
          <Link
            href="/"
            className="inline-block bg-emerald-600 hover:bg-emerald-700 px-6 py-2 rounded-lg"
            data-testid="link-login"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white" data-testid="tracker-page">
      <div className="max-w-md mx-auto p-4">
        <header className="mb-6">
          <div className="mb-4">
            <img 
              src="/images/apollo.png" 
              alt="The Apollo" 
              className="w-full rounded-lg object-cover"
              data-testid="img-apollo"
            />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
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
              data-testid="link-team-shred"
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
          </div>
          {today && (
            <p className="text-sm text-gray-500">{formatDateDDMMYYYY(today)}</p>
          )}
        </header>

        {/* Tabs - Quick Log first as the main action, then Missions for progress, then History */}
        <div className="flex justify-center gap-1 sm:gap-2 mb-6 border-b border-gray-700 pb-2">
          <button
            onClick={() => setActiveTab('quicklog')}
            className={`flex-1 max-w-[72px] sm:max-w-none px-2 sm:px-3 py-2 rounded-t-lg text-xs sm:text-sm font-medium transition-colors text-center ${
              activeTab === 'quicklog'
                ? 'bg-sky-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            data-testid="tab-quicklog"
          >
            Log
          </button>
          <button
            onClick={() => setActiveTab('flaps')}
            className={`flex-1 max-w-[72px] sm:max-w-none px-2 sm:px-3 py-2 rounded-t-lg text-xs sm:text-sm font-medium transition-colors text-center ${
              activeTab === 'flaps'
                ? 'bg-rose-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            data-testid="tab-flaps"
          >
            Flaps
          </button>
          <button
            onClick={() => setActiveTab('sesh')}
            className={`flex-1 max-w-[72px] sm:max-w-none px-2 sm:px-3 py-2 rounded-t-lg text-xs sm:text-sm font-medium transition-colors text-center ${
              activeTab === 'sesh'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            data-testid="tab-sesh"
          >
            Sesh
          </button>
          <button
            onClick={() => setActiveTab('thering')}
            className={`flex-1 max-w-[72px] sm:max-w-none px-2 sm:px-3 py-2 rounded-t-lg text-xs sm:text-sm font-medium transition-colors text-center ${
              activeTab === 'thering'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            data-testid="tab-thering"
          >
            Ring
          </button>
          <button
            onClick={() => setActiveTab('missions')}
            className={`flex-1 max-w-[72px] sm:max-w-none px-2 sm:px-3 py-2 rounded-t-lg text-xs sm:text-sm font-medium transition-colors text-center ${
              activeTab === 'missions'
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            data-testid="tab-missions"
          >
            Missions
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 max-w-[72px] sm:max-w-none px-2 sm:px-3 py-2 rounded-t-lg text-xs sm:text-sm font-medium transition-colors text-center ${
              activeTab === 'history'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            data-testid="tab-history"
          >
            History
          </button>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 mb-4" data-testid="error-message">
            {error}
          </div>
        )}

        {/* Missions Tab */}
        {activeTab === 'missions' && (
          <section className="mb-8">
            <p className="text-gray-400 mb-4">Today's Missions</p>
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-gray-500" data-testid="empty-tasks">
                <p>No active challenge tasks today</p>
                <p className="text-sm mt-2">Use Quick Log to track activities independently</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Group tasks by challenge scope, then by exercise type */}
                {(() => {
                  const scopeLabels: Record<string, string> = {
                    solo: 'Lone Wolf',
                    duel: 'Showdown',
                    team: 'Team Blitzkrieg',
                  };
                  const scopeOrder = ['solo', 'duel', 'team'];
                  const scopeColors: Record<string, string> = {
                    solo: 'text-amber-400 border-amber-500/30',
                    duel: 'text-red-400 border-red-500/30',
                    team: 'text-blue-400 border-blue-500/30',
                  };

                  const grouped = tasks.reduce((acc, task) => {
                    const scope = task.challenge_scope || 'solo';
                    const exerciseName = task.task_name;
                    if (!acc[scope]) acc[scope] = {};
                    if (!acc[scope][exerciseName]) acc[scope][exerciseName] = [];
                    acc[scope][exerciseName].push(task);
                    return acc;
                  }, {} as Record<string, Record<string, TaskWithProgress[]>>);

                  return scopeOrder
                    .filter(scope => grouped[scope])
                    .map(scope => (
                      <div key={scope} className="space-y-4">
                        <h2 className={`text-lg font-bold ${scopeColors[scope]?.split(' ')[0] || 'text-gray-300'} border-b ${scopeColors[scope]?.split(' ')[1] || 'border-gray-700'} pb-2`}>
                          {scopeLabels[scope] || scope}
                        </h2>
                        {Object.entries(grouped[scope]).map(([exerciseName, exerciseTasks]) => (
                          <div key={`${scope}-${exerciseName}`} className="space-y-3">
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide pl-1">
                              {exerciseName}
                            </h3>
                            {exerciseTasks.map(task => {
                              const progress = getProgressDisplay(task);
                              const percent = getProgressPercent(task);

                              return (
                                <div
                                  key={task.task_id}
                                  className="bg-gray-800 rounded-lg p-4 border border-gray-700"
                                  data-testid={`task-card-${task.task_id}`}
                                >
                                  <div className="mb-2">
                                    <h3 className="font-semibold text-lg" data-testid={`task-name-${task.task_id}`}>
                                      {task.task_name}
                                    </h3>
                                    <p className="text-sm text-gray-400">
                                      {task.challenge_title}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {formatDateDDMMYYYY(task.starts_on)} - {formatDateDDMMYYYY(task.ends_on)}
                                    </p>
                                  </div>

                                  <div>
                                    <div className="flex justify-between text-sm mb-1">
                                      <span className={`font-medium ${progress.isDaily ? 'text-amber-400' : 'text-gray-400'}`}>
                                        {progress.label}
                                      </span>
                                      <span data-testid={`progress-${task.task_id}`}>
                                        {progress.current} / {progress.target || '∞'}{task.unit_label ? ` ${task.unit_label}` : ''}
                                        {progress.current >= (progress.target || 0) && progress.target && (
                                          <span className="text-emerald-400 ml-1">✓</span>
                                        )}
                                      </span>
                                    </div>
                                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full transition-all duration-300 ${
                                          progress.current >= (progress.target || 0) ? 'bg-emerald-500' : 
                                          progress.isDaily ? 'bg-amber-500' : 'bg-emerald-500'
                                        }`}
                                        style={{ width: `${percent}%` }}
                                        data-testid={`progress-bar-${task.task_id}`}
                                      />
                                    </div>
                                    {/* Show overall progress for daily challenges */}
                                    {progress.isDaily && progress.target && (
                                      <div className="mt-1 text-xs text-gray-500 text-right">
                                        Overall: {progress.overall || 0} {task.unit_label || 'reps'} logged
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    ));
                })()}
              </div>
            )}

            {/* Flaps Challenges Section */}
            {flapsProgressData && flapsProgressData.length > 0 && (
              <div className="mt-6">
                <h2 className="text-lg font-bold text-rose-400 border-b border-rose-500/30 pb-2 mb-4">
                  Flaps Challenges
                </h2>
                <div className="space-y-3">
                  {flapsProgressData.map((fc: any) => {
                    const durationPercent = fc.target_duration ? Math.min(100, (fc.total_duration / fc.target_duration) * 100) : 0;
                    const caloriesPercent = fc.target_calories ? Math.min(100, (fc.total_calories / fc.target_calories) * 100) : 0;
                    
                    return (
                      <div
                        key={fc.challenge_id}
                        className="bg-gray-800 rounded-lg p-4 border border-rose-700/30"
                        data-testid={`flaps-challenge-${fc.challenge_id}`}
                      >
                        <div className="mb-2">
                          <h3 className="font-semibold text-lg text-slate-100">{fc.title}</h3>
                          <p className="text-xs text-gray-500">
                            {formatDateDDMMYYYY(fc.starts_on)} - {formatDateDDMMYYYY(fc.ends_on)}
                          </p>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          {fc.target_duration && (
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-rose-400">Duration</span>
                                <span className="text-slate-300">{fc.total_duration}/{fc.target_duration} min</span>
                              </div>
                              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${durationPercent >= 100 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                  style={{ width: `${durationPercent}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {fc.target_calories && (
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-amber-400">Calories</span>
                                <span className="text-slate-300">{fc.total_calories}/{fc.target_calories} cal</span>
                              </div>
                              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${caloriesPercent >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                  style={{ width: `${caloriesPercent}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {fc.target_hr && (
                            <div className="text-center">
                              <div className="text-xs text-slate-400 mb-1">Best HR</div>
                              <div className={`font-bold ${fc.best_hr >= fc.target_hr ? 'text-emerald-400' : 'text-red-400'}`}>
                                {fc.best_hr || '-'} bpm
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="mt-2 text-right">
                          <span className="text-xs text-slate-500">{fc.entries_count} entries logged</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Quick Log Tab */}
        {activeTab === 'quicklog' && (
          <section className="mb-8">
            <div className="bg-gray-800 rounded-lg p-4 border border-sky-700/50">
              <h2 className="text-lg font-semibold text-sky-400 mb-4">Quick Log Activity</h2>
              <p className="text-sm text-gray-400 mb-4">
                Log activities that automatically count toward any active challenges
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Exercise Type</label>
                  <select
                    value={selectedExercise}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setSelectedExercise(newValue);
                      // Save to localStorage for next visit
                      localStorage.setItem('apollo_last_exercise', newValue);
                    }}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                    data-testid="select-exercise-type"
                  >
                    {sortedExerciseTypes.map(et => (
                      <option key={et.id} value={et.id}>
                        {et.name} ({et.unit_label})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Retro Date Logging Toggle */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      if (retroMode) {
                        setRetroMode(false);
                        setRetroDate('');
                      } else {
                        setRetroMode(true);
                        setRetroDate(today || getSydneyDateString());
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      retroMode 
                        ? 'bg-amber-600 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    data-testid="btn-toggle-retro"
                  >
                    {retroMode ? 'Logging Past Date' : 'Log Past Date'}
                  </button>
                  {retroMode && (
                    <input
                      type="date"
                      value={retroDate}
                      max={today || getSydneyDateString()}
                      onChange={(e) => setRetroDate(e.target.value)}
                      className="bg-gray-700 border border-amber-600 rounded-lg px-3 py-1.5 text-white text-sm"
                      data-testid="input-retro-date"
                    />
                  )}
                </div>
                {retroMode && retroDate && (
                  <div className="text-sm text-amber-400">
                    Logging for: {formatDateDDMMYYYY(retroDate)}
                  </div>
                )}

                {/* Quick add buttons - directly under exercise type */}
                {selectedExerciseType?.unit_type === 'reps' && (
                  <div className="flex flex-wrap gap-2">
                    {[5, 10, 25, 50, 100].map(amt => (
                      <button
                        key={amt}
                        onClick={() => setQuickLogValue(prev => prev + amt)}
                        className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm font-medium"
                        data-testid={`btn-quickadd-${amt}`}
                      >
                        +{amt}
                      </button>
                    ))}
                    {quickLogValue > 0 && (
                      <button
                        onClick={() => setQuickLogValue(0)}
                        className="bg-red-700/50 hover:bg-red-600/50 px-3 py-2 rounded-lg text-sm font-medium text-red-200"
                        data-testid="btn-clear-quicklog"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

                {(selectedExerciseType?.unit_type === 'km' || selectedExerciseType?.unit_type === 'distance') && (
                  <div className="flex flex-wrap gap-2">
                    {(selectedExerciseType?.unit_label === 'm' ? [100, 500, 1000] : [1, 2, 5, 10]).map(amt => (
                      <button
                        key={amt}
                        onClick={() => setQuickLogValue(prev => prev + amt)}
                        className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm font-medium"
                        data-testid={`btn-quickadd-${amt}`}
                      >
                        +{amt}{selectedExerciseType?.unit_label === 'm' ? 'm' : 'km'}
                      </button>
                    ))}
                    {quickLogValue > 0 && (
                      <button
                        onClick={() => setQuickLogValue(0)}
                        className="bg-red-700/50 hover:bg-red-600/50 px-3 py-2 rounded-lg text-sm font-medium text-red-200"
                        data-testid="btn-clear-quicklog-km"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

                {selectedExerciseType?.unit_type === 'calories' && (
                  <div className="flex flex-wrap gap-2">
                    {[50, 100, 500, 1000].map(amt => (
                      <button
                        key={amt}
                        onClick={() => setQuickLogValue(prev => prev + amt)}
                        className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm font-medium"
                        data-testid={`btn-quickadd-${amt}`}
                      >
                        +{amt} cal
                      </button>
                    ))}
                    {quickLogValue > 0 && (
                      <button
                        onClick={() => setQuickLogValue(0)}
                        className="bg-red-700/50 hover:bg-red-600/50 px-3 py-2 rounded-lg text-sm font-medium text-red-200"
                        data-testid="btn-clear-quicklog-cal"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

                {selectedExerciseType?.unit_type === 'score' && (
                  <div className="space-y-2">
                    <label className="block text-sm text-gray-400">Score (max 30)</label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={quickLogValue || ''}
                      onChange={(e) => {
                        const val = Math.min(30, Math.max(0, parseInt(e.target.value) || 0));
                        setQuickLogValue(val);
                      }}
                      placeholder="Enter score (0-30)"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                      data-testid="input-score"
                    />
                    {quickLogValue > 0 && (
                      <button
                        onClick={() => setQuickLogValue(0)}
                        className="bg-red-700/50 hover:bg-red-600/50 px-3 py-2 rounded-lg text-sm font-medium text-red-200"
                        data-testid="btn-clear-quicklog-score"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

                <button
                  onClick={submitQuickLog}
                  disabled={quickLogSubmitting || quickLogValue <= 0}
                  className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50 py-3 rounded-lg font-semibold"
                  data-testid="btn-submit-quicklog"
                >
                  {quickLogSubmitting ? 'Logging...' : `Log ${quickLogValue || 0} ${selectedExerciseType?.unit_label || 'units'}`}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Sesh Tab - Gym Session Logger */}
        {activeTab === 'sesh' && (
          <SeshTab />
        )}

        {/* The Ring Tab - Coming Soon */}
        {activeTab === 'thering' && (
          <section className="mb-8">
            <div className="bg-gray-800 rounded-lg p-6 border border-red-700/50 text-center">
              <h2 className="text-xl font-semibold text-red-400 mb-4">The Ring</h2>
              <p className="text-gray-400 text-lg mb-2">Coming Soon</p>
              <p className="text-gray-500 text-sm">
                Combat sports training and tracking
              </p>
            </div>
          </section>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-purple-400 mb-2">Activity History</h2>
            
            {/* Sub-tab toggle: Activity History vs Flaps History */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setHistorySubTab('activity')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  historySubTab === 'activity'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                data-testid="btn-history-activity"
              >
                Activity History
              </button>
              <button
                onClick={() => setHistorySubTab('flaps')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  historySubTab === 'flaps'
                    ? 'bg-rose-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                data-testid="btn-history-flaps"
              >
                Flaps History
              </button>
              <button
                onClick={() => setHistorySubTab('sesh')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  historySubTab === 'sesh'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                data-testid="btn-history-sesh"
              >
                Sesh History
              </button>
            </div>

            {/* Activity History Sub-Tab */}
            {historySubTab === 'activity' && (
              <>
                {/* Date Range Filter Controls */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">Date Range:</span>
                    <select
                      value={historyDateRange}
                      onChange={(e) => {
                        const value = e.target.value as 'today' | 'week' | 'month' | 'all' | 'custom';
                        setHistoryDateRange(value);
                        setHistoryExpanded(value === 'month');
                      }}
                      className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200"
                      data-testid="activity-date-range-select"
                    >
                      <option value="today">Today</option>
                      <option value="week">This Week</option>
                      <option value="month">This Month</option>
                      <option value="all">All Time</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  
                  {/* Custom Date Range Inputs */}
                  {historyDateRange === 'custom' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200"
                        data-testid="activity-custom-start"
                      />
                      <span className="text-gray-400">to</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200"
                        data-testid="activity-custom-end"
                      />
                    </div>
                  )}
                  
                </div>

            {/* Exercise Type Filter */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-gray-400">Exercise:</span>
              <select
                value={historyExerciseFilter}
                onChange={(e) => setHistoryExerciseFilter(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200"
                data-testid="select-filter-exercise"
              >
                <option value="all">All Exercises</option>
                {sortedExerciseTypes.map(et => (
                  <option key={et.id} value={et.name}>{et.name}</option>
                ))}
              </select>
            </div>

            {/* Totals Summary */}
            {Object.keys(activityTotals).length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4 border border-purple-700/50 mb-4">
                <h3 className="text-sm font-medium text-gray-400 mb-2">
                  {historyDateRange === 'all' ? 'All-Time' : historyDateRange === 'today' ? "Today's" : historyDateRange === 'week' ? 'This Week\'s' : historyDateRange === 'month' ? 'This Month\'s' : 'Custom Range'} Totals
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {sortedExerciseTypes
                    .filter(et => historyExerciseFilter === 'all' || historyExerciseFilter === et.name)
                    .map(et => {
                      const total = activityTotals[et.name] || 0;
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

            {historyLoading ? (
              <div className="text-center py-8 text-gray-500">Loading history...</div>
            ) : activities.length === 0 ? (
              <div className="text-center py-8 text-gray-500" data-testid="empty-history">
                <p>No activities logged yet</p>
                <p className="text-sm mt-2">Use Quick Log to start tracking</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left" data-testid="history-table">
                  <thead className="bg-gray-700 text-gray-300 text-sm">
                    <tr>
                      <th className="px-4 py-2 rounded-tl-lg">Date</th>
                      <th className="px-4 py-2">Exercise</th>
                      <th className="px-4 py-2 text-right">Value</th>
                      <th className="px-4 py-2 text-center rounded-tr-lg w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {activities
                      .filter(a => historyExerciseFilter === 'all' || a.exercise_types?.name === historyExerciseFilter)
                      .map(activity => (
                        <tr
                          key={activity.id}
                          className="bg-gray-800 hover:bg-gray-750"
                          data-testid={`activity-row-${activity.id}`}
                        >
                          <td className="px-4 py-3 text-sm text-gray-400">
                            {formatDateDDMMYYYY(activity.entry_date)}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {activity.exercise_types?.name}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-purple-300">
                            {(activity.exercise_types?.unit_type === 'km' || activity.exercise_types?.unit_type === 'distance')
                              ? Number(activity.value).toFixed(1) 
                              : Math.round(Number(activity.value))} {activity.exercise_types?.unit_label}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => deleteActivity(activity.id)}
                              disabled={deletingEntry === activity.id}
                              className="text-red-400 hover:text-red-300 disabled:opacity-50 text-sm"
                              data-testid={`btn-delete-activity-${activity.id}`}
                            >
                              {deletingEntry === activity.id ? '...' : '✕'}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

                <button
                  onClick={() => fetchActivityHistory()}
                  className="w-full mt-4 bg-gray-700 hover:bg-gray-600 py-2 rounded-lg text-sm"
                  data-testid="btn-refresh-history"
                >
                  Refresh History
                </button>
              </>
            )}

            {/* Flaps History Sub-Tab */}
            {historySubTab === 'flaps' && (
              <>
                {/* Date Range Filter Controls */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">Date Range:</span>
                    <select
                      value={flapsHistoryDateRange}
                      onChange={(e) => {
                        const value = e.target.value as 'today' | 'week' | 'month' | 'all' | 'custom';
                        setFlapsHistoryDateRange(value);
                        setFlapsHistoryExpanded(value === 'month');
                      }}
                      className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200"
                      data-testid="flaps-date-range-select"
                    >
                      <option value="today">Today</option>
                      <option value="week">This Week</option>
                      <option value="month">This Month</option>
                      <option value="all">All Time</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  
                  {/* Custom Date Range Inputs */}
                  {flapsHistoryDateRange === 'custom' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={flapsHistoryCustomStart}
                        onChange={(e) => setFlapsHistoryCustomStart(e.target.value)}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200"
                        data-testid="flaps-custom-start"
                      />
                      <span className="text-gray-400">to</span>
                      <input
                        type="date"
                        value={flapsHistoryCustomEnd}
                        onChange={(e) => setFlapsHistoryCustomEnd(e.target.value)}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200"
                        data-testid="flaps-custom-end"
                      />
                    </div>
                  )}
                  
                </div>

                {/* Totals Summary */}
                {Object.keys(flapsHistoryTotals).length > 0 && (
                  <div className="bg-gray-800 rounded-lg p-4 border border-rose-700/50 mb-4">
                    <h4 className="text-sm font-medium text-gray-400 mb-2">
                      {flapsHistoryDateRange === 'all' ? 'All-Time' : flapsHistoryDateRange === 'today' ? "Today's" : flapsHistoryDateRange === 'week' ? 'This Week\'s' : flapsHistoryDateRange === 'month' ? 'This Month\'s' : 'Custom Range'} Totals
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(flapsHistoryTotals).map(([mode, totals]) => (
                        <div key={mode} className="bg-gray-700 rounded p-2">
                          <div className="text-xs text-gray-400">{mode}</div>
                          <div className="font-bold text-rose-300">{totals.duration} mins</div>
                          {totals.distance > 0 && (
                            <div className="text-xs text-gray-400">{totals.distance.toFixed(1)} km</div>
                          )}
                          {totals.calories > 0 && (
                            <div className="text-xs text-gray-400">{totals.calories} cal</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Flaps History Table */}
                {flapsHistoryLoading ? (
                  <div className="text-center py-8 text-gray-500">Loading history...</div>
                ) : flapsHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500" data-testid="empty-flaps-history">
                    <p>No Flaps activities logged yet</p>
                    <p className="text-sm mt-2">Log your first cardio session in the Flaps tab</p>
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
                          <th className="px-2 py-2 text-right">Cal</th>
                          <th className="px-2 py-2 text-center rounded-tr-lg w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {flapsHistory.map(entry => (
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
                                    testId={`hiit-info-${entry.id}`}
                                  />
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right text-gray-300">
                              {entry.duration_minutes} min
                            </td>
                            <td className="px-2 py-2 text-right text-gray-300">
                              {entry.distance_km && parseFloat(entry.distance_km) > 0 ? `${parseFloat(entry.distance_km).toFixed(1)}` : '-'}
                            </td>
                            <td className="px-2 py-2 text-right text-gray-300">
                              {entry.avg_heart_rate || '-'}
                            </td>
                            <td className="px-2 py-2 text-right text-gray-300">
                              {entry.calories_burned || '-'}
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button
                                onClick={() => deleteFlapsEntry(entry.id)}
                                disabled={deletingFlapsEntry === entry.id}
                                className="text-red-400 hover:text-red-300 disabled:opacity-50 text-xs"
                                data-testid={`btn-delete-flaps-${entry.id}`}
                              >
                                {deletingFlapsEntry === entry.id ? '...' : '✕'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <button
                  onClick={() => fetchFlapsHistory()}
                  className="w-full mt-4 bg-gray-700 hover:bg-gray-600 py-2 rounded-lg text-sm"
                  data-testid="btn-refresh-flaps-history"
                >
                  Refresh History
                </button>
              </>
            )}

            {/* Sesh History Sub-Tab */}
            {historySubTab === 'sesh' && (() => {
              const filteredSeshHistory = seshHistory.filter(s => {
                if (seshHistoryDateRange === 'all') return true;
                const sessionDate = new Date(s.session_date);
                const now = new Date();
                if (seshHistoryDateRange === 'week') {
                  const weekAgo = new Date(now);
                  weekAgo.setDate(weekAgo.getDate() - 7);
                  return sessionDate >= weekAgo;
                }
                if (seshHistoryDateRange === 'month') {
                  const monthAgo = new Date(now);
                  monthAgo.setMonth(monthAgo.getMonth() - 1);
                  return sessionDate >= monthAgo;
                }
                return true;
              });
              const totalVolume = filteredSeshHistory.reduce((sum: number, s: any) => sum + (Number(s.total_volume) || 0), 0);
              const totalSets = filteredSeshHistory.reduce((sum: number, s: any) => sum + (Number(s.set_count) || 0), 0);

              return (
                <>
                  <div className="flex gap-2 mb-3">
                    {(['week', 'month', 'all'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setSeshHistoryDateRange(f)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          seshHistoryDateRange === f
                            ? 'bg-orange-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                        data-testid={`sesh-history-filter-${f}`}
                      >
                        {f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : 'All Time'}
                      </button>
                    ))}
                  </div>

                  {filteredSeshHistory.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-gray-800 rounded-lg p-3 border border-orange-700/50 text-center">
                        <p className="text-lg font-bold text-orange-400" data-testid="sesh-total-sessions">{filteredSeshHistory.length}</p>
                        <p className="text-gray-500 text-[10px]">Sessions</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-3 border border-orange-700/50 text-center">
                        <p className="text-lg font-bold text-orange-400" data-testid="sesh-total-sets">{totalSets}</p>
                        <p className="text-gray-500 text-[10px]">Total Sets</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-3 border border-orange-700/50 text-center">
                        <p className="text-lg font-bold text-orange-400" data-testid="sesh-total-volume">{Math.round(totalVolume).toLocaleString()}</p>
                        <p className="text-gray-500 text-[10px]">Volume (kg)</p>
                      </div>
                    </div>
                  )}

                  {seshHistoryLoading ? (
                    <div className="text-center py-8 text-gray-500">Loading sesh history...</div>
                  ) : filteredSeshHistory.length === 0 ? (
                    <div className="text-center py-8 text-gray-500" data-testid="empty-sesh-history">
                      <p>No gym sessions completed yet</p>
                      <p className="text-sm mt-2">Complete a session in the Sesh tab to see your history</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredSeshHistory.map((sess: any) => (
                        <div key={sess.id} className="bg-gray-800 rounded-lg border border-gray-700 p-3" data-testid={`sesh-history-row-${sess.id}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-white text-sm font-medium">
                                {sess.name || formatDateDDMMYYYY(sess.session_date)}
                              </p>
                              {sess.name && (
                                <p className="text-gray-500 text-xs">{formatDateDDMMYYYY(sess.session_date)}</p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="text-orange-400 text-sm font-medium">{Math.round(Number(sess.total_volume) || 0).toLocaleString()} kg</p>
                              <p className="text-gray-500 text-xs">{sess.exercise_count} exercises, {sess.set_count} sets</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => fetchSeshHistory()}
                    className="w-full mt-4 bg-gray-700 hover:bg-gray-600 py-2 rounded-lg text-sm"
                    data-testid="btn-refresh-sesh-history"
                  >
                    Refresh History
                  </button>
                </>
              );
            })()}

            {/* Share Workout History Toggle */}
            <div className="mt-6 pt-4 border-t border-gray-700">
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="font-medium text-sm">Share Workout History</div>
                    <div className="text-xs text-gray-500">Let teammates view your activity log</div>
                  </div>
                  <button
                    onClick={toggleShareWorkoutHistory}
                    disabled={savingShare}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      shareWorkoutHistory ? 'bg-emerald-600' : 'bg-gray-600'
                    } ${savingShare ? 'opacity-50' : ''}`}
                    data-testid="toggle-share-workout"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        shareWorkoutHistory ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
              </div>
            </div>
          </section>
        )}

        {/* Flaps Tab - Cardio/HIIT Activity Logging */}
        {activeTab === 'flaps' && (
          <section className="bg-gray-900/50 rounded-xl p-4 sm:p-6 border border-gray-800" data-testid="flaps-section">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-rose-400 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Log Flaps Activity
              </h2>
              <button
                onClick={() => setFlapsRetroMode(!flapsRetroMode)}
                className={`px-2 py-1 rounded text-xs ${flapsRetroMode ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-300'}`}
              >
                {flapsRetroMode ? 'Retro Mode' : 'Today'}
              </button>
            </div>

            {flapsRetroMode && (
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">Date</label>
                <input
                  type="date"
                  value={flapsRetroDate}
                  onChange={(e) => setFlapsRetroDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {/* Exercise Mode */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Exercise Mode</label>
                <select
                  value={flapsExerciseMode}
                  onChange={(e) => setFlapsExerciseMode(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  data-testid="flaps-exercise-mode"
                >
                  <option value="Ride">Ride</option>
                  <option value="Run">Run</option>
                  <option value="Walk">Walk</option>
                  <option value="Hike">Hike</option>
                  <option value="Swim">Swim</option>
                  <option value="Ruck">Ruck</option>
                  <option value="Elliptical">Elliptical</option>
                  <option value="HIIT">HIIT</option>
                </select>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Duration (mins)</label>
                <input
                  type="number"
                  value={flapsDuration || ''}
                  onChange={(e) => setFlapsDuration(parseInt(e.target.value) || 0)}
                  placeholder="30"
                  min="1"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  data-testid="flaps-duration"
                />
              </div>

              {/* Average Heart Rate */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Avg Heart Rate (bpm)</label>
                <input
                  type="number"
                  value={flapsHeartRate || ''}
                  onChange={(e) => setFlapsHeartRate(parseInt(e.target.value) || 0)}
                  placeholder="140"
                  min="0"
                  max="250"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  data-testid="flaps-heart-rate"
                />
              </div>

              {/* Calories */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Calories Burned</label>
                <input
                  type="number"
                  value={flapsCalories || ''}
                  onChange={(e) => setFlapsCalories(parseInt(e.target.value) || 0)}
                  placeholder="300"
                  min="0"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  data-testid="flaps-calories"
                />
              </div>

              {/* Distance - for cardio modes */}
              {['Ride', 'Run', 'Walk', 'Hike', 'Swim', 'Ruck', 'Elliptical'].includes(flapsExerciseMode) && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Distance (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={flapsDistance || ''}
                    onChange={(e) => setFlapsDistance(parseFloat(e.target.value) || 0)}
                    placeholder="5.0"
                    min="0"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    data-testid="flaps-distance"
                  />
                </div>
              )}
            </div>

            {/* HIIT-specific fields */}
            {flapsExerciseMode === 'HIIT' && (
              <div className="bg-gray-800/50 rounded-lg p-4 mb-4 border border-gray-700">
                <h3 className="text-sm font-medium text-rose-300 mb-3">HIIT Details</h3>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Rounds</label>
                    <input
                      type="number"
                      value={flapsHiitRounds || ''}
                      onChange={(e) => setFlapsHiitRounds(parseInt(e.target.value) || 0)}
                      placeholder="5"
                      min="1"
                      className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm"
                      data-testid="flaps-hiit-rounds"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Work (sec)</label>
                    <input
                      type="number"
                      value={flapsHiitWorkSeconds || ''}
                      onChange={(e) => setFlapsHiitWorkSeconds(parseInt(e.target.value) || 0)}
                      placeholder="30"
                      min="1"
                      className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm"
                      data-testid="flaps-hiit-work"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Rest (sec)</label>
                    <input
                      type="number"
                      value={flapsHiitRestSeconds || ''}
                      onChange={(e) => setFlapsHiitRestSeconds(parseInt(e.target.value) || 0)}
                      placeholder="15"
                      min="0"
                      className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm"
                      data-testid="flaps-hiit-rest"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Exercises (optional)</label>
                  <input
                    type="text"
                    value={flapsHiitExercises}
                    onChange={(e) => setFlapsHiitExercises(e.target.value)}
                    placeholder="e.g., Burpees, KB swings, Jump squats"
                    className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm"
                    data-testid="flaps-hiit-exercises"
                  />
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Notes (optional)</label>
              <textarea
                value={flapsNotes}
                onChange={(e) => setFlapsNotes(e.target.value)}
                placeholder="How did it feel? Any achievements?"
                rows={2}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none"
                data-testid="flaps-notes"
              />
            </div>

            {/* Submit Button */}
            <button
              onClick={async () => {
                if (flapsDuration <= 0) {
                  alert('Please enter a duration');
                  return;
                }
                setFlapsSubmitting(true);
                try {
                  const entryDate = flapsRetroMode && flapsRetroDate ? flapsRetroDate : today;
                  const hiitDetails = flapsExerciseMode === 'HIIT' ? {
                    rounds: flapsHiitRounds,
                    work_seconds: flapsHiitWorkSeconds,
                    rest_seconds: flapsHiitRestSeconds,
                    exercises: flapsHiitExercises,
                  } : null;
                  
                  const res = await fetch('/api/tracker/flaps', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      entry_date: entryDate,
                      duration_minutes: flapsDuration,
                      avg_heart_rate: flapsHeartRate || null,
                      calories_burned: flapsCalories || null,
                      exercise_mode: flapsExerciseMode,
                      distance_km: ['Ride', 'Run', 'Walk', 'Hike', 'Swim', 'Ruck', 'Elliptical'].includes(flapsExerciseMode) ? flapsDistance : null,
                      hiit_details: hiitDetails,
                      custom_exercise: flapsExerciseMode === 'Custom' ? flapsCustomExercise : null,
                      notes: flapsNotes || null,
                    }),
                  });
                  const data = await res.json();
                  if (data.ok) {
                    // Reset form
                    setFlapsDuration(30);
                    setFlapsHeartRate(0);
                    setFlapsCalories(0);
                    setFlapsDistance(0);
                    setFlapsHiitRounds(0);
                    setFlapsHiitExercises('');
                    setFlapsCustomExercise('');
                    setFlapsNotes('');
                    // Refresh history
                    fetchFlapsHistory();
                  } else {
                    alert(data.error || 'Failed to log activity');
                  }
                } catch (err) {
                  console.error('Error logging flaps:', err);
                  alert('Failed to log activity');
                } finally {
                  setFlapsSubmitting(false);
                }
              }}
              disabled={flapsSubmitting}
              className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              data-testid="flaps-submit"
            >
              {flapsSubmitting ? 'Logging...' : 'Log Flaps Activity'}
            </button>
          </section>
        )}

      </div>
    </div>
  );
}
