// pages/warzone/[id].tsx
// Phase 3: Challenge detail page
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { getUserColor } from '../../lib/userColors';
import ChallengeEditModal from '../../components/ChallengeEditModal';

type Participant = {
  id: string;
  user_id: string;
  username: string;
  role: string;
  state: string;
};

type ParticipantResult = {
  user_id: string;
  username: string;
  start_weight: number | null;
  end_weight: number | null;
  delta_kg: number | null;
  status_label: string;
  has_valid_data: boolean;
};

type ChallengeResult = {
  participants: ParticipantResult[];
  winner_user_id: string | null;
  is_tie: boolean;
  is_complete: boolean;
};

type RepLeaderboardEntry = {
  user_id: string;
  username: string;
  total: number;
  today_total?: number;
};

type RepTask = {
  id: string;
  name: string;
  unit_type: string;
  target_type: string;
  target_value: number | null;
};

type RepTaskProgress = {
  task_id: string;
  task_name: string;
  unit_type: string;
  target_type: string;
  target_value: number | null;
  effective_target: number | null;
  leaderboard: RepLeaderboardEntry[];
};

type TimelineEntry = {
  user_id: string;
  username: string;
  task_name: string;
  unit_type: string;
  value: number;
};

type DailyTimelineDay = {
  date: string;
  entries: TimelineEntry[];
};

// Import getUnitLabel from shared lib - but keep local definition for frontend bundle
function getUnitLabel(unitType: string): string {
  switch (unitType) {
    case 'distance':
    case 'km': return 'kms';
    case 'calories': return 'cal';
    case 'minutes': return 'mins';
    case 'score': return 'pts';
    case 'reps':
    default: return 'reps';
  }
}

type NewRecord = {
  user_id: string;
  username: string;
  exercise: string;
  value: number;
  previous_best: number;
  best_day_date: string | null;
};

type PaceEntry = {
  user_id: string;
  username: string;
  daily_avg: number;
  needed_per_day: number;
  remaining: number;
  target_total: number;
  status: 'ahead' | 'on_track' | 'behind' | 'done';
};

type BiggestDayEntry = {
  username: string;
  exercise: string;
  total: number;
  date: string;
};

type LeaderChange = {
  date: string;
  leader_id: string;
  leader_username: string;
  total: number;
  percent: number;
};

type ProgressInsights = {
  days_remaining: number;
  days_elapsed: number;
  total_days: number;
  pace_indicator: 'ahead' | 'on_track' | 'behind';
  daily_average: number;
  best_day: { date: string; total: number } | null;
  current_streak: number;
  longest_streak: number;
  overall_percent: number;
  milestones: { quarter: boolean; half: boolean; threeQuarter: boolean; complete: boolean };
  active_days: number;
  new_records?: NewRecord[];
  biggest_days?: BiggestDayEntry[];
  pace_tracker?: PaceEntry[];
  past_challenges_count?: number;
  leader_changes?: LeaderChange[];
  daily_standings?: { date: string; standings: { user_id: string; username: string; total: number; daily: number; percent: number }[] }[];
  cumulative_by_day?: Record<string, Record<string, number>>;
};

type ParticipantInsight = {
  user_id: string;
  username: string;
  pace_indicator: 'ahead' | 'on_track' | 'behind';
  current_streak: number;
  longest_streak: number;
  overall_percent: number;
  milestones: { quarter: boolean; half: boolean; threeQuarter: boolean; complete: boolean };
  active_days: number;
  by_exercise: {
    exercise_name: string;
    unit_type: string;
    daily_average: number;
    best_day: { date: string; total: number } | null;
    total: number;
    target: number;
    is_leading: boolean;
    goal_percent: number;
  }[];
};

type FlapsEntry = {
  id: string;
  user_id: string;
  username: string;
  duration_minutes: number;
  avg_heart_rate: number | null;
  calories_burned: number | null;
  exercise_mode: string;
  distance_km: number | null;
  hiit_details: any;
  notes: string | null;
  entry_date: string | null;
  logged_at: string;
};

type FlapsLeaderboard = {
  user_id: string;
  username: string;
  total_duration: number;
  total_calories: number;
  avg_hr: number | null;
  entries_count: number;
  passed: boolean;
};

type Challenge = {
  id: string;
  scope: string;
  template_key: string;
  title: string;
  description: string;
  activity_summary: string | null;
  stake_text: string | null;
  stake_amount: string | null;
  starts_on: string;
  ends_on: string;
  status: string;
  created_by_user_id: string;
  created_at: string;
  winner_user_id: string | null;
  completed_at: string | null;
  participants: Participant[];
  result: ChallengeResult | null;
  rep_leaderboard: RepLeaderboardEntry[] | null;
  rep_task: RepTask | null;
  rep_tasks_progress: RepTaskProgress[] | null;
  tasks?: any[];
  daily_timeline?: DailyTimelineDay[];
  is_rep_challenge: boolean;
  current_user_participant?: Participant;
  progress_insights?: ProgressInsights | null;
  all_participant_insights?: ParticipantInsight[];
  target_weight_kg?: number | null;
  shred_off_progress?: any;
  // Flaps challenge fields
  target_duration_minutes?: number | null;
  target_avg_heart_rate?: number | null;
  target_calories?: number | null;
  allowed_exercise_modes?: string[] | null;
  flaps_entries?: FlapsEntry[];
  flaps_leaderboard?: FlapsLeaderboard[];
};

export default function ChallengeDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [responding, setResponding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingDates, setEditingDates] = useState(false);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [savingDates, setSavingDates] = useState(false);
  const [dateEditError, setDateEditError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    if (id) {
      fetchChallenge();
    }
    // Fetch current user info
    fetchCurrentUser();
  }, [id]);

  async function fetchCurrentUser() {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setCurrentUserId(data.user.id);
          setIsAdmin(data.user.username?.toLowerCase() === 'nox');
        }
      }
    } catch (err) {
      console.error('Error fetching current user:', err);
    }
  }

  async function fetchChallenge() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/warzone/challenges/${id}`);

      if (res.status === 401) {
        setAuthError(true);
        setLoading(false);
        return;
      }

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || 'Failed to load challenge');
        setLoading(false);
        return;
      }

      setChallenge(data.challenge);
    } catch (err) {
      console.error('Error fetching challenge:', err);
      setError('Failed to load challenge');
    } finally {
      setLoading(false);
    }
  }

  async function handleRespond(action: 'accept' | 'decline' | 'surrender') {
    if (!id) return;

    setResponding(true);
    try {
      const res = await fetch(`/api/warzone/challenges/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        alert(data.error || 'Failed to respond');
        return;
      }

      // If API returns redirect (e.g., Lone Wolf cancellation), navigate there
      if (data.redirect) {
        router.push(data.redirect);
        return;
      }

      // Refresh challenge data
      await fetchChallenge();
    } catch (err) {
      console.error('Error responding:', err);
      alert('Failed to respond');
    } finally {
      setResponding(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm('Are you sure you want to delete this challenge? This action cannot be undone.')) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/warzone/challenges/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        alert(data.error || 'Failed to delete challenge');
        return;
      }

      // Navigate back to warzone after successful deletion
      router.push('/warzone');
    } catch (err) {
      console.error('Error deleting challenge:', err);
      alert('Failed to delete challenge');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSurrender() {
    if (!confirm('Are you sure you want to surrender? This counts as a loss.')) return;
    await handleRespond('surrender');
  }

  async function handleSaveDates() {
    if (!id) return;
    setSavingDates(true);
    setDateEditError(null);
    try {
      const res = await fetch(`/api/warzone/challenges/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starts_on: editStartDate, ends_on: editEndDate }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setDateEditError(data.error || 'Failed to update dates');
        return;
      }
      setEditingDates(false);
      fetchChallenge();
    } catch (err) {
      console.error('Error updating dates:', err);
      setDateEditError('Failed to update dates');
    } finally {
      setSavingDates(false);
    }
  }

  function openDateEditor() {
    if (!challenge) return;
    const startStr = challenge.starts_on.includes('T') ? challenge.starts_on.split('T')[0] : challenge.starts_on;
    const endStr = challenge.ends_on.includes('T') ? challenge.ends_on.split('T')[0] : challenge.ends_on;
    setEditStartDate(startStr);
    setEditEndDate(endStr);
    setDateEditError(null);
    setEditingDates(true);
  }

  // Format date for display (DD/MM/YYYY)
  function formatDate(dateStr: string): string {
    const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const [year, month, day] = datePart.split('-');
    return `${day}/${month}/${year}`;
  }

  // Auth error
  if (authError) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-100 mb-2">Warzone</h1>
          <p className="text-slate-400 mb-4">Please log in to view this challenge.</p>
          <Link href="/login" className="text-sky-400 hover:text-sky-300">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Loading challenge...</p>
      </div>
    );
  }

  // Error
  if (error || !challenge) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-100 mb-2">Challenge Not Found</h1>
          <p className="text-slate-400 mb-4">{error || 'This challenge does not exist or you do not have access.'}</p>
          <Link href="/warzone" className="text-sky-400 hover:text-sky-300">
            ← Back to Warzone
          </Link>
        </div>
      </div>
    );
  }

  const scopeConfig: Record<string, { label: string; color: string }> = {
    duel: { label: 'Showdown', color: 'bg-orange-600/30 text-orange-300 border-orange-500/50' },
    team: { label: 'Team Blitzkrieg', color: 'bg-purple-600/30 text-purple-300 border-purple-500/50' },
    solo: { label: 'Lone Wolf', color: 'bg-sky-600/30 text-sky-300 border-sky-500/50' },
  };
  const scopeInfo = scopeConfig[challenge.scope] || scopeConfig.duel;

  const statusConfig: Record<string, { color: string; label: string }> = {
    active: { color: 'bg-green-600/30 text-green-300 border-green-500/50', label: 'ACTIVE' },
    pending: { color: 'bg-yellow-600/30 text-yellow-300 border-yellow-500/50', label: 'PENDING' },
    completed: { color: 'bg-blue-600/30 text-blue-300 border-blue-500/50', label: 'COMPLETED' },
    cancelled: { color: 'bg-slate-600/30 text-slate-300 border-slate-500/50', label: 'CANCELLED' },
    failed: { color: 'bg-red-600/30 text-red-300 border-red-500/50', label: 'FAILED' },
  };
  const statusInfo = statusConfig[challenge.status] || statusConfig.pending;

  const userParticipant = challenge.current_user_participant;
  const canRespond = userParticipant?.state === 'invited' && challenge.status === 'pending';
  const canSurrenderActive = (userParticipant?.state === 'accepted' || userParticipant?.state === 'latecomer') && challenge.status === 'active';
  const isCreator = currentUserId === challenge.created_by_user_id;
  const canDelete = (isAdmin || isCreator) && (challenge.status === 'pending' || challenge.status === 'active');
  const isLoneWolf = challenge.scope === 'solo' || challenge.scope === 'individual';
  const isFinished = challenge.status === 'completed' || challenge.status === 'cancelled' || challenge.status === 'failed';
  const canEditDates = !isFinished && (isAdmin || (isCreator && isLoneWolf));
  const creator = challenge.participants.find(p => p.role === 'creator');
  const opponent = challenge.participants.find(p => p.role === 'invited');

  return (
    <>
      <Head>
        <title>{challenge.title} | Warzone</title>
        <meta name="description" content={`Challenge: ${challenge.title}`} />
      </Head>

      <div className="min-h-screen bg-slate-950 text-slate-100">
        {/* Header */}
        <header className="bg-slate-900 border-b border-slate-800 px-4 py-4">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-bold text-red-500">Warzone</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/tracker"
                className="inline-flex items-center justify-center rounded-xl border border-emerald-500/60 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25 transition-colors"
                data-testid="link-apollo"
              >
                Apollo
              </Link>
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
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-2 sm:px-4 py-4">
          {/* Challenge Header */}
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 mb-6">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h1 className="text-2xl font-bold text-slate-100">{challenge.title}</h1>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${scopeInfo.color}`}>
                {scopeInfo.label}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
              {isAdmin && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="px-3 py-1 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors font-medium"
                  data-testid="button-edit-challenge"
                >
                  Edit
                </button>
              )}
            </div>

            {/* Dynamic challenge launch message based on type */}
            <p className="text-slate-400 mb-4">
              {challenge.template_key === 'lone_flaps' 
                ? `${creator?.username || 'Unknown'} has launched a Lone Flaps challenge`
                : challenge.template_key === 'flap_off'
                  ? `${creator?.username || 'Unknown'} has launched a Flap Off`
                  : challenge.template_key === 'team_flaps'
                    ? `${creator?.username || 'Unknown'} has launched Team Flaps`
                    : challenge.is_rep_challenge ? (
                        challenge.scope === 'team' 
                          ? `${creator?.username || 'Unknown'} has launched a Blitzkrieg`
                          : challenge.scope === 'duel'
                            ? `${creator?.username || 'Unknown'} has launched a Showdown`
                            : `${creator?.username || 'Unknown'} has launched a Lone Wolf`
                      ) : (
                        challenge.scope === 'team'
                          ? `${creator?.username || 'Unknown'} has launched a Team Shred Off`
                          : `${creator?.username || 'Unknown'} has launched a Shred Off`
                      )}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Period:</span>{' '}
                {editingDates ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-slate-400 text-xs w-12">Start:</label>
                      <input
                        type="date"
                        value={editStartDate}
                        onChange={(e) => setEditStartDate(e.target.value)}
                        className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 text-sm text-slate-200"
                        data-testid="input-edit-start-date"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-slate-400 text-xs w-12">End:</label>
                      <input
                        type="date"
                        value={editEndDate}
                        onChange={(e) => setEditEndDate(e.target.value)}
                        className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 text-sm text-slate-200"
                        data-testid="input-edit-end-date"
                      />
                    </div>
                    {dateEditError && (
                      <p className="text-red-400 text-xs">{dateEditError}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleSaveDates}
                        disabled={savingDates}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1 rounded-lg disabled:opacity-50"
                        data-testid="btn-save-dates"
                      >
                        {savingDates ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingDates(false)}
                        className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-3 py-1 rounded-lg"
                        data-testid="btn-cancel-edit-dates"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <span className="text-slate-200">
                    {formatDate(challenge.starts_on)} → {formatDate(challenge.ends_on)}
                    {canEditDates && (
                      <button
                        onClick={openDateEditor}
                        className="ml-2 text-sky-400 hover:text-sky-300 text-xs"
                        data-testid="btn-edit-dates"
                      >
                        Edit
                      </button>
                    )}
                  </span>
                )}
              </div>
              {challenge.activity_summary && (
                <div>
                  <span className="text-slate-500">Challenge Overview:</span>{' '}
                  <span className="text-emerald-400">{challenge.activity_summary}</span>
                </div>
              )}
              {challenge.description && (
                <div>
                  <span className="text-slate-500">Comments:</span>{' '}
                  <span className="text-slate-300">{challenge.description}</span>
                </div>
              )}
              {challenge.stake_text && (
                <div>
                  <span className="text-slate-500">Stakes:</span>{' '}
                  <span className="text-yellow-400">{challenge.stake_text}</span>
                </div>
              )}
            </div>

            {/* Accepted Participants */}
            {challenge.participants && challenge.participants.filter(p => p.state === 'accepted' || p.state === 'latecomer').length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <span className="text-slate-500 text-sm">Active Participants:</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {challenge.participants
                    .filter(p => p.state === 'accepted' || p.state === 'latecomer')
                    .map(p => (
                      <span 
                        key={p.id}
                        className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded-lg"
                        data-testid={`participant-${p.user_id}`}
                      >
                        {p.username}
                      </span>
                    ))
                  }
                </div>
              </div>
            )}

            {/* Flaps Challenge Targets */}
            {(challenge.template_key === 'lone_flaps' || challenge.template_key === 'flap_off' || challenge.template_key === 'team_flaps') && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <span className="text-rose-400 text-sm font-semibold">Challenge Targets:</span>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {challenge.target_duration_minutes && challenge.target_duration_minutes > 0 && (
                    <div className="bg-slate-800 rounded-lg p-3 text-center">
                      <div className="text-rose-400 font-bold text-lg">{challenge.target_duration_minutes}</div>
                      <div className="text-slate-500 text-xs">min Duration</div>
                    </div>
                  )}
                  {challenge.target_avg_heart_rate && challenge.target_avg_heart_rate > 0 && (
                    <div className="bg-slate-800 rounded-lg p-3 text-center">
                      <div className="text-red-400 font-bold text-lg">{challenge.target_avg_heart_rate}</div>
                      <div className="text-slate-500 text-xs">bpm Avg HR</div>
                    </div>
                  )}
                  {challenge.target_calories && challenge.target_calories > 0 && (
                    <div className="bg-slate-800 rounded-lg p-3 text-center">
                      <div className="text-amber-400 font-bold text-lg">{challenge.target_calories}</div>
                      <div className="text-slate-500 text-xs">Calories</div>
                    </div>
                  )}
                </div>
                {challenge.allowed_exercise_modes && challenge.allowed_exercise_modes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="text-slate-500 text-xs">Allowed modes:</span>
                    {challenge.allowed_exercise_modes.map((mode: string) => (
                      <span key={mode} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                        {mode}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Flaps Challenge Progress & Activity */}
          {(challenge.template_key === 'lone_flaps' || challenge.template_key === 'flap_off' || challenge.template_key === 'team_flaps') && (
            <div className="bg-slate-900 border border-rose-700/50 rounded-xl p-4 sm:p-6 mb-6" data-testid="panel-flaps-leaderboard">
              <h2 className="text-lg font-bold text-rose-400 mb-4">
                {challenge.template_key === 'lone_flaps' ? 'Your Progress' : 'Leaderboard'}
              </h2>
              
              {challenge.flaps_leaderboard && challenge.flaps_leaderboard.length > 0 ? (
                <div className="space-y-3">
                  {challenge.flaps_leaderboard.map((entry, idx) => {
                    const userColor = getUserColor(entry.username);
                    const isLeader = idx === 0 && (challenge.template_key === 'flap_off' || challenge.template_key === 'team_flaps');
                    const userEntries = challenge.flaps_entries?.filter((e: any) => e.user_id === entry.user_id) || [];
                    
                    return (
                      <div 
                        key={entry.user_id}
                        className={`p-3 rounded-lg ${isLeader ? 'bg-rose-900/30 border border-rose-600/50' : 'bg-slate-800/50'}`}
                        data-testid={`flaps-entry-${entry.user_id}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {isLeader && <span className="text-amber-400">&#9733;</span>}
                            <span className={`font-bold ${userColor.replace('bg-', 'text-')}`}>{entry.username}</span>
                            {entry.passed && <span className="text-emerald-400 text-xs">&#10003; Passed</span>}
                          </div>
                          <span className="text-slate-400 text-xs">{entry.entries_count} entries</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm mb-2">
                          <div className="text-center">
                            <div className="text-rose-400 font-semibold">{entry.total_duration} min</div>
                            <div className="text-slate-500 text-xs">Total Duration</div>
                          </div>
                          <div className="text-center">
                            <div className="text-red-400 font-semibold">{entry.avg_hr || '-'} bpm</div>
                            <div className="text-slate-500 text-xs">Avg HR</div>
                          </div>
                          <div className="text-center">
                            <div className="text-amber-400 font-semibold">{entry.total_calories} cal</div>
                            <div className="text-slate-500 text-xs">Total Calories</div>
                          </div>
                        </div>
                        
                        {userEntries.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-700/50">
                            <div className="text-xs text-slate-400 mb-1">Activity Log</div>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                              {userEntries.map((fe: any) => (
                                <div 
                                  key={fe.id}
                                  className="bg-slate-900/50 rounded p-2 text-xs"
                                  data-testid={`flaps-log-${fe.id}`}
                                >
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-sky-400 font-medium">{fe.exercise_mode}</span>
                                    <span className="text-slate-500">{fe.entry_date ? formatDate(fe.entry_date) : formatDate(fe.logged_at)}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <span className="text-rose-400">{fe.duration_minutes} min</span>
                                    {fe.distance_km && Number(fe.distance_km) > 0 && (
                                      <span className="text-emerald-400">{Number(fe.distance_km).toFixed(1)} km</span>
                                    )}
                                    {fe.avg_heart_rate && (
                                      <span className="text-red-400">{fe.avg_heart_rate} bpm</span>
                                    )}
                                    {fe.calories_burned && (
                                      <span className="text-amber-400">{fe.calories_burned} cal</span>
                                    )}
                                  </div>
                                  {fe.exercise_mode === 'HIIT' && fe.hiit_details && (() => {
                                    try {
                                      const hiit = typeof fe.hiit_details === 'string' ? JSON.parse(fe.hiit_details) : fe.hiit_details;
                                      return (
                                        <div className="mt-1 text-purple-400">
                                          {hiit.rounds && <span>{hiit.rounds} rounds</span>}
                                          {hiit.work_seconds && <span> | {hiit.work_seconds}s work</span>}
                                          {hiit.rest_seconds && <span> / {hiit.rest_seconds}s rest</span>}
                                          {hiit.exercises && <span className="text-slate-400 ml-1">({hiit.exercises})</span>}
                                        </div>
                                      );
                                    } catch { return null; }
                                  })()}
                                  {fe.notes && (
                                    <div className="mt-1 text-slate-400 italic">{fe.notes}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-4">No activity logged yet. Log your first Flaps entry in Apollo!</p>
              )}
              
              {challenge.current_user_participant && 
               (challenge.current_user_participant.state === 'accepted' || challenge.current_user_participant.state === 'latecomer') &&
               challenge.status === 'active' && (
                <div className="mt-4 text-center">
                  <Link
                    href="/tracker?tab=flaps"
                    className="inline-block px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-medium transition-colors"
                    data-testid="link-log-flaps"
                  >
                    Log Flaps Activity
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Progress Insights Panel - Team/Duel scope only (Solo uses Lone Wolf Progress) */}
          {challenge.is_rep_challenge && challenge.progress_insights && challenge.scope !== 'solo' && (
            <div className="bg-slate-900 border border-emerald-700/50 rounded-xl p-4 sm:p-6 mb-6" data-testid="panel-progress-insights">
              <h2 className="text-lg font-bold text-emerald-400 mb-4">Progress Insights</h2>
              
              {/* Challenge Duration Header */}
              <div className="flex items-center justify-between mb-4 p-3 bg-slate-800/30 rounded-lg">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-center">
                    <div className={`text-xl font-bold ${
                      challenge.progress_insights.days_remaining <= 2 ? 'text-red-400' :
                      challenge.progress_insights.days_remaining <= 5 ? 'text-yellow-400' : 'text-emerald-400'
                    }`} data-testid="stat-days-remaining">
                      {challenge.progress_insights.days_remaining}
                    </div>
                    <div className="text-xs text-slate-400">Days Left</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-slate-300">
                      {challenge.progress_insights.days_elapsed}
                    </div>
                    <div className="text-xs text-slate-400">Days Elapsed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-slate-300">
                      {challenge.progress_insights.total_days}
                    </div>
                    <div className="text-xs text-slate-400">Total Days</div>
                  </div>
                </div>
              </div>
              
              {/* All Participants Insights */}
              {challenge.all_participant_insights && challenge.all_participant_insights.length > 0 ? (
                <div className="space-y-4">
                  {[...challenge.all_participant_insights].sort((a: any, b: any) => (b.overall_percent || 0) - (a.overall_percent || 0)).map((participant: any) => {
                    const userColor = getUserColor(participant.username);
                    return (
                      <div key={participant.user_id} className="bg-slate-800/50 rounded-lg p-4" data-testid={`participant-insights-${participant.username}`}>
                        {/* Participant Header */}
                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-lg" style={{ color: userColor }}>{participant.username}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              participant.pace_indicator === 'ahead' ? 'bg-emerald-600/30 text-emerald-300' :
                              participant.pace_indicator === 'behind' ? 'bg-red-600/30 text-red-300' : 'bg-sky-600/30 text-sky-300'
                            }`}>
                              {participant.pace_indicator === 'ahead' ? 'Ahead' :
                               participant.pace_indicator === 'behind' ? 'Behind' : 'On Track'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <div className="flex items-center gap-1">
                              <span>{participant.current_streak > 0 ? '🔥' : '❄️'}</span>
                              <span className="text-orange-400">{participant.current_streak}d streak</span>
                            </div>
                            <div className="text-slate-400">{participant.active_days} active days</div>
                          </div>
                        </div>
                        
                        {/* Milestone Badges */}
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`text-lg ${participant.milestones.quarter ? 'opacity-100' : 'opacity-30'}`}>🌱</span>
                          <span className={`text-lg ${participant.milestones.half ? 'opacity-100' : 'opacity-30'}`}>🔥</span>
                          <span className={`text-lg ${participant.milestones.threeQuarter ? 'opacity-100' : 'opacity-30'}`}>⚡</span>
                          <span className={`text-lg ${participant.milestones.complete ? 'opacity-100' : 'opacity-30'}`}>🏆</span>
                          <span className="text-sm text-slate-400 ml-2">{participant.overall_percent}% complete</span>
                        </div>
                        
                        {/* Per-Exercise Breakdown */}
                        <div className="space-y-2">
                          {participant.by_exercise.map((exercise: any, idx: number) => (
                            <div key={idx} className="bg-slate-700/50 rounded-lg p-2">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-200">{exercise.exercise_name}</span>
                                  {exercise.is_leading && (
                                    <span className="text-xs bg-amber-600/30 text-amber-300 px-1.5 py-0.5 rounded">Leading</span>
                                  )}
                                </div>
                                <span className="text-sm text-slate-400">
                                  {exercise.total} / {exercise.target} {getUnitLabel(exercise.unit_type)}
                                </span>
                              </div>
                              {/* Progress bar with goal percent */}
                              <div className="mt-1 mb-1 h-2 bg-slate-600 rounded-full overflow-hidden relative">
                                <div 
                                  className={`h-full transition-all duration-300 ${exercise.goal_percent >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`}
                                  style={{ width: `${Math.min(100, exercise.goal_percent)}%`, backgroundColor: userColor }}
                                />
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <div className="flex items-center gap-3">
                                  <span className="text-slate-500">Goal: <span className="text-slate-300">{exercise.goal_percent}%</span></span>
                                  <span className="text-slate-500">Avg: <span className="text-amber-400">{exercise.daily_average}/day</span></span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {exercise.best_day && (
                                    <span className="text-slate-500">Best: <span className="text-purple-400">{exercise.best_day.total}</span></span>
                                  )}
                                  {exercise.goal_percent >= 100 && (
                                    <span className="text-emerald-400">✓</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Biggest Days - top 3 */}
                  {challenge.progress_insights?.biggest_days && (challenge.progress_insights.biggest_days as BiggestDayEntry[]).length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-700">
                      <h3 className="text-sm font-semibold text-amber-400 mb-2" data-testid="text-biggest-days-header">Biggest Days</h3>
                      <div className="space-y-1.5">
                        {(challenge.progress_insights.biggest_days as BiggestDayEntry[]).map((bd, idx) => {
                          const color = getUserColor(bd.username);
                          const dateStr = bd.date ? (() => {
                            const [y, m, d] = bd.date.split('-');
                            return `${d}/${m}`;
                          })() : '';
                          return (
                            <div key={idx} className="bg-amber-900/15 border border-amber-800/25 rounded-lg px-3 py-1.5 flex items-center justify-between gap-2 flex-wrap" data-testid={`biggest-day-${idx}`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-amber-500 w-4">{idx + 1}.</span>
                                <span className="text-sm font-bold" style={{ color }}>{bd.username}</span>
                                <span className="text-sm font-bold text-amber-300">{bd.total}</span>
                                <span className="text-xs text-slate-400">{bd.exercise}</span>
                              </div>
                              {dateStr && <span className="text-xs text-slate-500">{dateStr}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* New Records - only when someone beat their all-time best */}
                  {challenge.progress_insights?.new_records && (challenge.progress_insights.new_records as NewRecord[]).length > 0 && (
                    <div className="mt-3">
                      <h3 className="text-sm font-semibold text-pink-400 mb-2" data-testid="text-new-records-header">New Records</h3>
                      <div className="space-y-1.5">
                        {(challenge.progress_insights.new_records as NewRecord[]).map((r, idx) => {
                          const color = getUserColor(r.username);
                          return (
                            <div key={idx} className="flex items-center justify-between bg-pink-900/20 border border-pink-800/30 rounded-lg px-3 py-1.5" data-testid={`record-new-${idx}`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold" style={{ color }}>{r.username}</span>
                                <span className="text-xs text-slate-400">{r.exercise}</span>
                                <span className="text-xs bg-pink-600/30 text-pink-300 px-1.5 py-0.5 rounded">NEW RECORD</span>
                              </div>
                              <div className="text-right whitespace-nowrap">
                                <span className="text-sm font-bold text-pink-300">{r.value}</span>
                                <span className="text-xs text-slate-500 ml-1.5">prev: {r.previous_best}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {(challenge.progress_insights.past_challenges_count ?? 0) > 0 && (
                        <div className="text-xs text-slate-500 mt-2 text-center">
                          vs {challenge.progress_insights.past_challenges_count} past challenge{(challenge.progress_insights.past_challenges_count ?? 0) !== 1 ? 's' : ''} + activity log
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Pace Tracker - needed per day to finish by end date */}
                  {challenge.progress_insights?.pace_tracker && (challenge.progress_insights.pace_tracker as PaceEntry[]).length > 0 && challenge.progress_insights.days_remaining > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-700">
                      <h3 className="text-sm font-semibold text-slate-300 mb-2" data-testid="text-pace-tracker-header">Pace Tracker</h3>
                      <div className="text-xs text-slate-500 mb-2">{challenge.progress_insights.days_remaining} days remaining</div>
                      <div className="space-y-1.5">
                        {[...(challenge.progress_insights.pace_tracker as PaceEntry[])].sort((a, b) => {
                          const aPercent = a.target_total > 0 ? ((a.target_total - a.remaining) / a.target_total) : 0;
                          const bPercent = b.target_total > 0 ? ((b.target_total - b.remaining) / b.target_total) : 0;
                          return bPercent - aPercent;
                        }).map((p, idx) => {
                          const color = getUserColor(p.username);
                          const statusConfig = {
                            done: { label: 'Done', textColor: 'text-emerald-400', bgColor: 'bg-emerald-900/20' },
                            ahead: { label: 'Ahead', textColor: 'text-emerald-400', bgColor: 'bg-emerald-900/20' },
                            on_track: { label: 'On Track', textColor: 'text-blue-400', bgColor: 'bg-blue-900/20' },
                            behind: { label: 'Behind', textColor: 'text-red-400', bgColor: 'bg-red-900/20' },
                          };
                          const sc = statusConfig[p.status];
                          return (
                            <div key={p.user_id} className={`${sc.bgColor} rounded-lg px-3 py-1.5 flex items-center justify-between gap-2 flex-wrap`} data-testid={`pace-${idx}`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium" style={{ color }}>{p.username}</span>
                                <span className={`text-xs font-semibold ${sc.textColor}`}>{sc.label}</span>
                                <span className="text-xs text-slate-500">avg {p.daily_avg}/day</span>
                              </div>
                              <div className="text-right">
                                {p.status === 'done' ? (
                                  <span className="text-xs text-emerald-400">Target reached</span>
                                ) : p.target_total > 0 ? (
                                  <span className="text-xs text-slate-400">
                                    needs <span className={`font-semibold ${p.needed_per_day > p.daily_avg ? 'text-red-400' : 'text-emerald-400'}`}>{p.needed_per_day}/day</span>
                                    <span className="text-slate-600 ml-1.5">({p.remaining.toLocaleString()} left)</span>
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-500">{p.daily_avg}/day</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Fallback to single user view if no all_participant_insights */
                <>
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-slate-800/50 rounded-lg p-3 text-center" data-testid="stat-pace">
                      <div className={`text-lg font-bold ${
                        challenge.progress_insights.pace_indicator === 'ahead' ? 'text-emerald-400' :
                        challenge.progress_insights.pace_indicator === 'behind' ? 'text-red-400' : 'text-sky-400'
                      }`}>
                        {challenge.progress_insights.pace_indicator === 'ahead' ? 'Ahead' :
                         challenge.progress_insights.pace_indicator === 'behind' ? 'Behind' : 'On Track'}
                      </div>
                      <div className="text-xs text-slate-400">Pace</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3 text-center" data-testid="stat-daily-avg">
                      <div className="text-2xl font-bold text-amber-400">
                        {challenge.progress_insights.daily_average}
                      </div>
                      <div className="text-xs text-slate-400">Daily Avg</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3 text-center" data-testid="stat-best-day">
                      <div className="text-2xl font-bold text-purple-400">
                        {challenge.progress_insights.best_day?.total || 0}
                      </div>
                      <div className="text-xs text-slate-400">Best Day</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-slate-300">
                        {challenge.progress_insights.active_days}
                      </div>
                      <div className="text-xs text-slate-400">Active Days</div>
                    </div>
                  </div>
                  
                  {/* Streak Section */}
                  <div className="flex items-center gap-4 mb-4 p-3 bg-slate-800/30 rounded-lg" data-testid="section-streaks">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{challenge.progress_insights.current_streak > 0 ? '🔥' : '❄️'}</span>
                      <div>
                        <div className="text-lg font-bold text-orange-400" data-testid="text-current-streak">{challenge.progress_insights.current_streak} day{challenge.progress_insights.current_streak !== 1 ? 's' : ''}</div>
                        <div className="text-xs text-slate-400">Current Streak</div>
                      </div>
                    </div>
                    <div className="border-l border-slate-700 pl-4">
                      <div className="text-lg font-bold text-slate-300">{challenge.progress_insights.longest_streak} day{challenge.progress_insights.longest_streak !== 1 ? 's' : ''}</div>
                      <div className="text-xs text-slate-400">Longest Streak</div>
                    </div>
                  </div>
                  
                  {/* Milestone Badges */}
                  <div className="flex items-center justify-center gap-3 sm:gap-6" data-testid="section-milestones">
                    <div className={`text-center ${challenge.progress_insights.milestones.quarter ? 'opacity-100' : 'opacity-30'}`} data-testid="milestone-25">
                      <div className="text-3xl mb-1">🌱</div>
                      <div className="text-xs text-slate-400">25%</div>
                    </div>
                    <div className={`text-center ${challenge.progress_insights.milestones.half ? 'opacity-100' : 'opacity-30'}`} data-testid="milestone-50">
                      <div className="text-3xl mb-1">🔥</div>
                      <div className="text-xs text-slate-400">50%</div>
                    </div>
                    <div className={`text-center ${challenge.progress_insights.milestones.threeQuarter ? 'opacity-100' : 'opacity-30'}`} data-testid="milestone-75">
                      <div className="text-3xl mb-1">⚡</div>
                      <div className="text-xs text-slate-400">75%</div>
                    </div>
                    <div className={`text-center ${challenge.progress_insights.milestones.complete ? 'opacity-100' : 'opacity-30'}`} data-testid="milestone-100">
                      <div className="text-3xl mb-1">🏆</div>
                      <div className="text-xs text-slate-400">100%</div>
                    </div>
                  </div>
                  
                  {/* Overall Progress Bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Overall Progress</span>
                      <span>{challenge.progress_insights.overall_percent}%</span>
                    </div>
                    <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          challenge.progress_insights.overall_percent >= 100 ? 'bg-emerald-500' :
                          challenge.progress_insights.overall_percent >= 75 ? 'bg-yellow-500' :
                          challenge.progress_insights.overall_percent >= 50 ? 'bg-amber-500' : 'bg-sky-500'
                        }`}
                        style={{ width: `${Math.min(100, challenge.progress_insights.overall_percent)}%` }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Current Standings - for Showdown and Team Blitzkrieg */}
          {challenge.is_rep_challenge && (challenge.scope === 'duel' || challenge.scope === 'team') && 
           challenge.progress_insights?.daily_standings && challenge.progress_insights.daily_standings.length > 0 && (
            <div className={`bg-slate-900 border rounded-xl p-4 sm:p-6 mb-6 ${
              challenge.scope === 'duel' ? 'border-red-700/50' : 'border-purple-700/50'
            }`} data-testid="panel-current-standings">
              <h2 className={`text-lg font-bold mb-4 ${
                challenge.scope === 'duel' ? 'text-red-400' : 'text-purple-400'
              }`}>
                Current Standings
              </h2>
              {(() => {
                // Get the latest standings (most recent day)
                const latestDay = challenge.progress_insights.daily_standings[challenge.progress_insights.daily_standings.length - 1];
                const standings = latestDay?.standings || [];
                const positionLabels = ['1st', '2nd', '3rd'];
                
                return (
                  <div className="space-y-2">
                    {standings.slice(0, 3).map((s: any, idx: number) => {
                      const userColor = getUserColor(s.username);
                      const isFirst = idx === 0;
                      return (
                        <div key={s.user_id} className={`flex items-center gap-3 p-2 rounded-lg ${isFirst ? 'bg-slate-800/70' : 'bg-slate-800/30'}`}>
                          <span className={`w-8 text-sm font-bold ${isFirst ? 'text-amber-400' : idx === 1 ? 'text-slate-400' : 'text-amber-700'}`}>
                            {positionLabels[idx]}
                          </span>
                          <span 
                            className={`flex-1 truncate ${isFirst ? 'font-bold text-lg' : 'font-medium'}`}
                            style={{ color: userColor }}
                          >
                            {s.username}
                          </span>
                          <span className={`font-bold ${isFirst ? 'text-lg' : ''}`}>{s.total}</span>
                          <span className="text-slate-500 text-sm">({s.percent}%)</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Head-to-Head Progress Chart - for Showdowns only */}
          {challenge.is_rep_challenge && challenge.scope === 'duel' && 
           challenge.progress_insights?.cumulative_by_day && Object.keys(challenge.progress_insights.cumulative_by_day).length > 0 && (
            <div className="bg-slate-900 border border-red-700/50 rounded-xl p-4 sm:p-6 mb-6" data-testid="panel-head-to-head">
              <h2 className="text-lg font-bold text-red-400 mb-4">Head-to-Head Progress</h2>
              <div className="space-y-3">
                {(() => {
                  const cumulative = challenge.progress_insights!.cumulative_by_day!;
                  const dates = Object.keys(cumulative).sort();
                  const participants = challenge.participants.filter(p => p.state === 'accepted' || p.state === 'latecomer');
                  
                  // Get max value for scaling
                  let maxValue = 0;
                  for (const date of dates) {
                    for (const userId of Object.keys(cumulative[date])) {
                      maxValue = Math.max(maxValue, cumulative[date][userId]);
                    }
                  }
                  
                  return dates.map((date) => {
                    const formattedDate = (() => {
                      const parts = date.split('-');
                      return parts.length === 3 ? `${parts[2]}/${parts[1]}` : date;
                    })();
                    
                    return (
                      <div key={date} className="space-y-1">
                        <div className="text-xs text-slate-500">{formattedDate}</div>
                        <div className="space-y-1">
                          {participants.map(p => {
                            const value = cumulative[date][p.user_id] || 0;
                            const percent = maxValue > 0 ? (value / maxValue) * 100 : 0;
                            const userColor = getUserColor(p.username);
                            
                            return (
                              <div key={p.user_id} className="flex items-center gap-2">
                                <span 
                                  className="text-xs w-16 truncate font-medium"
                                  style={{ color: userColor }}
                                >
                                  {p.username}
                                </span>
                                <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full transition-all duration-300"
                                    style={{ width: `${percent}%`, backgroundColor: userColor }}
                                  />
                                </div>
                                <span className="text-xs text-slate-400 w-12 text-right">{value}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* Action Buttons for Showdown and Team Blitzkrieg */}
          {challenge.is_rep_challenge && (challenge.scope === 'duel' || challenge.scope === 'team') && 
           challenge.current_user_participant && 
           (challenge.current_user_participant.state === 'accepted' || challenge.current_user_participant.state === 'latecomer') && (
            <div className={`bg-slate-900 border rounded-xl p-4 sm:p-6 mb-6 ${
              challenge.scope === 'duel' ? 'border-red-700/50' : 'border-purple-700/50'
            }`}>
              <div className="flex items-center justify-between">
                <Link
                  href="/tracker"
                  className="inline-block px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
                  data-testid="link-log-apollo-multi"
                >
                  Log in Apollo
                </Link>
                <div className="flex flex-col items-end gap-1">
                  {canSurrenderActive && (
                    <button
                      onClick={handleSurrender}
                      disabled={responding}
                      className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                      data-testid="button-surrender-multi"
                    >
                      {responding ? 'Surrendering...' : 'Surrender'}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="text-xs text-red-500 hover:text-red-400 underline disabled:opacity-50"
                      data-testid="button-delete-multi"
                    >
                      {deleting ? 'Deleting...' : 'Delete Challenge'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Lone Wolf Progress - Solo challenges only (team/duel handled by Progress Insights) */}
          {challenge.is_rep_challenge && challenge.scope === 'solo' && (
            <div className="bg-slate-900 border border-sky-700/50 rounded-xl p-4 sm:p-6 mb-6">
              <h2 className="text-lg font-bold mb-4 text-sky-400">
                Lone Wolf Progress
              </h2>

              {/* Challenge Duration Header */}
              {challenge.progress_insights && (
                <div className="flex items-center justify-between mb-4 p-3 bg-slate-800/30 rounded-lg">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="text-center">
                      <div className={`text-xl font-bold ${
                        challenge.progress_insights.days_remaining <= 2 ? 'text-red-400' :
                        challenge.progress_insights.days_remaining <= 5 ? 'text-yellow-400' : 'text-sky-400'
                      }`} data-testid="stat-days-remaining">
                        {challenge.progress_insights.days_remaining}
                      </div>
                      <div className="text-xs text-slate-400">Days Left</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-slate-300">
                        {challenge.progress_insights.days_elapsed}
                      </div>
                      <div className="text-xs text-slate-400">Days Elapsed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-slate-300">
                        {challenge.progress_insights.total_days}
                      </div>
                      <div className="text-xs text-slate-400">Total Days</div>
                    </div>
                  </div>
                  
                  {/* Streak display */}
                  <div className="flex items-center gap-1" data-testid="section-streak">
                    <span className="text-lg">{challenge.progress_insights.current_streak > 0 ? '🔥' : '❄️'}</span>
                    <span className="text-orange-400 font-medium" data-testid="text-streak">{challenge.progress_insights.current_streak}d streak</span>
                    <span className="text-slate-500 text-sm ml-2" data-testid="text-active-days">{challenge.progress_insights.active_days} active days</span>
                  </div>
                </div>
              )}

              {/* Milestone Badges */}
              {challenge.progress_insights?.milestones && (
                <div className="flex items-center gap-2 mb-4 p-3 bg-slate-800/30 rounded-lg" data-testid="section-milestones">
                  <span className={`text-lg ${challenge.progress_insights.milestones.quarter ? 'opacity-100' : 'opacity-30'}`} data-testid="milestone-25">🌱</span>
                  <span className={`text-lg ${challenge.progress_insights.milestones.half ? 'opacity-100' : 'opacity-30'}`} data-testid="milestone-50">🔥</span>
                  <span className={`text-lg ${challenge.progress_insights.milestones.threeQuarter ? 'opacity-100' : 'opacity-30'}`} data-testid="milestone-75">⚡</span>
                  <span className={`text-lg ${challenge.progress_insights.milestones.complete ? 'opacity-100' : 'opacity-30'}`} data-testid="milestone-100">🏆</span>
                  <span className="text-sm text-slate-400 ml-2" data-testid="text-overall-percent">
                    {(() => {
                      if (challenge.all_participant_insights && challenge.all_participant_insights.length > 0) {
                        return `${challenge.all_participant_insights[0].overall_percent}% complete`;
                      }
                      if (challenge.rep_tasks_progress && challenge.rep_tasks_progress.length > 0) {
                        let totalPercent = 0;
                        let taskCount = 0;
                        const soloFallbackId = challenge.current_user_participant?.user_id
                          || challenge.participants?.find((p: any) => p.role === 'creator')?.user_id
                          || challenge.participants?.[0]?.user_id;
                        challenge.rep_tasks_progress.forEach((task) => {
                          const userEntry = task.leaderboard.find(
                            e => e.user_id === soloFallbackId
                          );
                          const userTotal = userEntry?.total || 0;
                          const target = task.effective_target || task.target_value || 0;
                          if (target > 0) {
                            totalPercent += Math.min(100, Math.round((userTotal / target) * 100));
                            taskCount++;
                          }
                        });
                        if (taskCount > 0) {
                          return `${Math.round(totalPercent / taskCount)}% complete`;
                        }
                      }
                      return '';
                    })()}
                  </span>
                </div>
              )}

              {/* Show all tasks/legs with progress and enhanced stats */}
              {challenge.rep_tasks_progress && challenge.rep_tasks_progress.length > 0 ? (
                <div className="space-y-4">
                  {challenge.rep_tasks_progress.map((taskProgress) => {
                    const soloUserId = challenge.current_user_participant?.user_id
                      || challenge.participants?.find((p: any) => p.role === 'creator')?.user_id
                      || challenge.participants?.[0]?.user_id;
                    const userEntry = taskProgress.leaderboard.find(
                      e => e.user_id === soloUserId
                    );
                    const userTotal = userEntry?.total || 0;
                    const isPerDay = taskProgress.target_type === 'per_day';
                    const dailyTarget = taskProgress.target_value || 0;
                    const effectiveTarget = taskProgress.effective_target || dailyTarget;
                    const todayTotal = userEntry?.today_total || 0;

                    const displayValue = isPerDay ? todayTotal : userTotal;
                    const displayTarget = isPerDay ? dailyTarget : effectiveTarget;
                    const percent = displayTarget > 0 ? Math.min(100, Math.round((displayValue / displayTarget) * 100)) : 0;
                    const overallPercent = effectiveTarget > 0 ? Math.min(100, Math.round((userTotal / effectiveTarget) * 100)) : 0;
                    const isTodayComplete = isPerDay && dailyTarget > 0 && todayTotal >= dailyTarget * 0.9;
                    const isOverallComplete = effectiveTarget > 0 && userTotal >= effectiveTarget * 0.9;
                    const isComplete = isPerDay ? isOverallComplete : (effectiveTarget > 0 && userTotal >= effectiveTarget * 0.9);
                    
                    const participantInsight = challenge.all_participant_insights?.find(
                      (p: any) => p.user_id === soloUserId
                    );
                    const exerciseInsight = participantInsight?.by_exercise?.find(
                      (e: any) => e.exercise_name === taskProgress.task_name
                    );
                    const daysElapsed = challenge.progress_insights?.days_elapsed || 1;
                    const fallbackAvg = daysElapsed > 0 ? (userTotal / daysElapsed).toFixed(1) : '0';
                    const dailyAvg = exerciseInsight?.daily_average ?? fallbackAvg;
                    const bestDay = exerciseInsight?.best_day?.total || null;
                    
                    const daysRemaining = challenge.progress_insights?.days_remaining || 0;
                    const remaining = Math.max(0, effectiveTarget - userTotal);
                    const avgNeeded = daysRemaining > 0 ? Math.ceil(remaining / daysRemaining) : remaining;
                    
                    return (
                      <div 
                        key={taskProgress.task_id}
                        className="bg-slate-800 rounded-lg p-3 sm:p-4"
                        data-testid={`leg-progress-${taskProgress.task_id}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-sky-300">{taskProgress.task_name}</h3>
                          <span className={`text-sm sm:text-base font-bold ${(isPerDay ? isTodayComplete : isComplete) ? 'text-emerald-400' : 'text-sky-100'}`}>
                            {displayValue} / {displayTarget || '∞'} {getUnitLabel(taskProgress.unit_type || 'reps')}
                            {isPerDay && <span className="text-xs text-slate-400 ml-1">today</span>}
                          </span>
                        </div>
                        
                        {displayTarget > 0 && (
                          <div className="mb-2">
                            <div className="h-3 bg-slate-700 rounded-full overflow-hidden relative">
                              <div
                                className={`h-full transition-all duration-500 ${(isPerDay ? isTodayComplete : isComplete) ? 'bg-emerald-500' : 'bg-sky-500'}`}
                                style={{ width: `${percent}%` }}
                              />
                              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                                {percent}%
                              </span>
                            </div>
                          </div>
                        )}

                        {isPerDay && effectiveTarget > 0 && (
                          <div className="mb-2">
                            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                              <span>Overall: {userTotal} / {effectiveTarget} {getUnitLabel(taskProgress.unit_type || 'reps')}</span>
                              <span className={isOverallComplete ? 'text-emerald-400 font-semibold' : ''}>{overallPercent}%</span>
                            </div>
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-500 ${isOverallComplete ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                style={{ width: `${overallPercent}%` }}
                              />
                            </div>
                          </div>
                        )}
                        
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-3">
                            <span className="text-slate-500">
                              Avg: <span className="text-amber-400">{dailyAvg}/day</span>
                            </span>
                            {isPerDay && daysRemaining > 0 && remaining > 0 && (
                              <span className="text-slate-500">
                                Need: <span className="text-orange-400">{avgNeeded}/day</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {bestDay !== null && bestDay > 0 && (
                              <span className="text-slate-500">
                                Best: <span className="text-purple-400">{bestDay}</span>
                              </span>
                            )}
                            {isTodayComplete && isPerDay && (
                              <span className="text-emerald-400 font-semibold">Daily Target Hit!</span>
                            )}
                            {isComplete && (
                              <span className="text-emerald-400 font-semibold">Mission Complete!</span>
                            )}
                          </div>
                        </div>
                        
                        {taskProgress.target_value && (
                          <div className="text-xs text-slate-500 mt-2">
                            Target: {taskProgress.target_value}{taskProgress.unit_type === 'km' || taskProgress.unit_type === 'distance' ? 'km' : ''} {taskProgress.task_name} {isPerDay ? 'Per Day' : 'Total'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-4">No challenge tasks defined.</p>
              )}

              {/* Only show Log Reps button if current user is an active participant */}
              {challenge.current_user_participant && 
               (challenge.current_user_participant.state === 'accepted' || challenge.current_user_participant.state === 'latecomer') && (
                <div className="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between">
                  <Link
                    href="/tracker"
                    className="inline-block px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
                    data-testid="link-log-reps"
                  >
                    Log in Apollo
                  </Link>
                  <div className="flex flex-col items-end gap-1">
                    {canSurrenderActive && (
                      <button
                        onClick={handleSurrender}
                        disabled={responding}
                        className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                        data-testid="button-surrender-inline"
                      >
                        {responding ? 'Surrendering...' : 'Surrender'}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="text-xs text-red-500 hover:text-red-400 underline disabled:opacity-50"
                        data-testid="button-delete-challenge"
                      >
                        {deleting ? 'Deleting...' : 'Delete Challenge'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Daily Activity Timeline (all rep-based challenges) */}
          {challenge.is_rep_challenge && challenge.daily_timeline && challenge.daily_timeline.length > 0 && (
            <div className={`bg-slate-900 border rounded-xl p-4 sm:p-6 mb-6 ${
              challenge.scope === 'solo' ? 'border-sky-700/50' :
              challenge.scope === 'duel' ? 'border-red-700/50' : 'border-purple-700/50'
            }`} data-testid="panel-activity-timeline">
              <h2 className={`text-lg font-bold mb-4 ${
                challenge.scope === 'solo' ? 'text-sky-400' :
                challenge.scope === 'duel' ? 'text-red-400' : 'text-purple-400'
              }`}>Activity Timeline</h2>
              <div className="space-y-4 max-h-80 overflow-y-auto">
                {challenge.daily_timeline.map((day: DailyTimelineDay) => {
                  // Format date as DD/MM/YYYY - handle both string and Date object
                  const dateStr = typeof day.date === 'string' ? day.date : String(day.date);
                  const parts = dateStr.split('-');
                  const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
                  
                  return (
                    <div key={day.date} className={`border-l-2 pl-4 ${
                      challenge.scope === 'solo' ? 'border-sky-600' :
                      challenge.scope === 'duel' ? 'border-red-600' : 'border-purple-600'
                    }`}>
                      <div className={`text-sm font-medium mb-2 ${
                        challenge.scope === 'solo' ? 'text-sky-300' :
                        challenge.scope === 'duel' ? 'text-red-300' : 'text-purple-300'
                      }`}>{formattedDate}</div>
                      <div className="space-y-1">
                        {day.entries.map((entry, idx) => {
                          const userColor = getUserColor(entry.username);
                          return (
                            <div key={idx} className="flex items-center gap-2 text-sm">
                              <span className="font-medium" style={{ color: userColor }}>{entry.username}</span>
                              <span className="text-slate-500">logged</span>
                              <span className="text-slate-200">{entry.value} {entry.unit_type === 'km' || entry.unit_type === 'distance' ? 'km' : 'reps'}</span>
                              <span className="text-slate-400">{entry.task_name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Shred Off Progress (weight-based challenges, not Flaps) */}
          {!challenge.is_rep_challenge && !['lone_flaps', 'flap_off', 'team_flaps'].includes(challenge.template_key || '') && (
          <>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 mb-6" data-testid="panel-shredoff-standings">
              <h2 className="text-lg font-bold text-slate-100 mb-1">Standings</h2>
              {challenge.target_weight_kg && (
                <p className="text-xs text-slate-400 mb-4" data-testid="text-target-info">Target: Lose {challenge.target_weight_kg}kg — within 15% of target counts as success</p>
              )}

              {challenge.shred_off_progress?.participants ? (
                <div className="space-y-4">
                  {challenge.shred_off_progress.participants.map((p: any, idx: number) => (
                    <div key={p.user_id} className="bg-slate-800 rounded-lg p-4" data-testid={`shredoff-standing-${idx}`}>
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-400">#{idx + 1}</span>
                          <span className="font-bold" style={{ color: getUserColor(p.username) }}>{p.username}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          p.succeeded ? 'bg-green-900/50 text-green-300' :
                          p.pace_status === 'ahead' ? 'bg-emerald-900/50 text-emerald-300' :
                          p.pace_status === 'on_track' ? 'bg-amber-900/50 text-amber-300' :
                          'bg-red-900/50 text-red-300'
                        }`} data-testid={`badge-status-${p.username}`}>
                          {p.succeeded ? 'Succeeded' : p.pace_status === 'ahead' ? 'Ahead' : p.pace_status === 'on_track' ? 'On Track' : 'Behind'}
                        </span>
                      </div>

                      {challenge.target_weight_kg && (
                        <div className="mb-3">
                          <div className="flex justify-between flex-wrap gap-1 text-xs text-slate-400 mb-1">
                            <span>{p.weight_lost !== null ? (p.weight_lost > 0 ? `${p.weight_lost}kg lost` : p.weight_lost < 0 ? `${Math.abs(p.weight_lost)}kg gained` : '0kg change') : 'No data'}</span>
                            <span>{p.progress_percent}%</span>
                          </div>
                          <div className="w-full bg-slate-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${p.succeeded ? 'bg-green-500' : 'bg-orange-500'}`}
                              style={{ width: `${Math.min(100, p.progress_percent)}%` }}
                              data-testid={`progress-bar-${p.username}`}
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-xs">Start:</span>
                          <span className="text-slate-200 text-xs font-medium" data-testid={`stat-start-weight-${p.username}`}>
                            {p.start_weight !== null ? `${p.start_weight}kg` : '-'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-xs">Current:</span>
                          <span className="text-slate-200 text-xs font-medium" data-testid={`stat-current-weight-${p.username}`}>
                            {p.current_weight !== null ? `${p.current_weight}kg` : '-'}
                          </span>
                        </div>
                        {challenge.target_weight_kg && p.start_weight !== null && (
                          <div className="flex justify-between col-span-2">
                            <span className="text-slate-400 text-xs">Goal:</span>
                            <span className="text-amber-400 text-xs font-medium" data-testid={`stat-goal-weight-${p.username}`}>
                              {Math.round((p.start_weight - challenge.target_weight_kg) * 100) / 100}kg
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <span className="text-slate-400 text-xs block">Change</span>
                          <span className={p.weight_lost !== null && p.weight_lost > 0 ? 'text-green-400 font-medium' : p.weight_lost !== null && p.weight_lost < 0 ? 'text-red-400 font-medium' : 'text-slate-300'} data-testid={`stat-weight-${p.username}`}>
                            {p.weight_lost !== null ? (p.weight_lost === 0 ? '0kg' : `${p.weight_lost > 0 ? '-' : '+'}${Math.abs(p.weight_lost)}kg`) : '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-xs block">Body Fat</span>
                          <span className={p.bf_change !== null && p.bf_change < 0 ? 'text-green-400 font-medium' : p.bf_change !== null && p.bf_change > 0 ? 'text-red-400 font-medium' : 'text-slate-300'} data-testid={`stat-bf-${p.username}`}>
                            {p.bf_change !== null ? (p.bf_change === 0 ? '0%' : `${p.bf_change > 0 ? '+' : ''}${p.bf_change}%`) : '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-xs block">Waist</span>
                          <span className={p.waist_change !== null && p.waist_change < 0 ? 'text-green-400 font-medium' : p.waist_change !== null && p.waist_change > 0 ? 'text-red-400 font-medium' : 'text-slate-300'} data-testid={`stat-waist-${p.username}`}>
                            {p.waist_change !== null ? (p.waist_change === 0 ? '0cm' : `${p.waist_change > 0 ? '+' : ''}${p.waist_change}cm`) : '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {challenge.participants.filter((p: any) => p.state === 'accepted' || p.state === 'latecomer').map((p: any) => (
                    <div key={p.user_id} className="bg-slate-800 rounded-lg p-4">
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                        <span className="font-bold" style={{ color: getUserColor(p.username) }}>{p.username}</span>
                        <span className="text-xs text-slate-400">{p.role}</span>
                      </div>
                      {challenge.result?.participants && (() => {
                        const result = challenge.result.participants.find((r: any) => r.user_id === p.user_id);
                        if (!result) return <p className="text-slate-500 text-sm">No data</p>;
                        return (
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between flex-wrap gap-1">
                              <span className="text-slate-400">Start:</span>
                              <span className="text-slate-200">{result.start_weight ? `${result.start_weight}kg` : '-'}</span>
                            </div>
                            <div className="flex justify-between flex-wrap gap-1">
                              <span className="text-slate-400">Current/End:</span>
                              <span className="text-slate-200">{result.end_weight ? `${result.end_weight}kg` : '-'}</span>
                            </div>
                            <div className="flex justify-between flex-wrap gap-1">
                              <span className="text-slate-400">Delta:</span>
                              <span className={result.delta_kg !== null && result.delta_kg < 0 ? 'text-green-400 font-bold' : 'text-slate-200'}>
                                {result.delta_kg !== null ? `${result.delta_kg > 0 ? '+' : ''}${result.delta_kg}kg` : '-'}
                              </span>
                            </div>
                            <div className="pt-2 border-t border-slate-700">
                              <span className="text-slate-400">Status:</span>{' '}
                              <span className="text-slate-100">{result.status_label}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {challenge.shred_off_progress && (
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 mb-6" data-testid="panel-shredoff-insights">
                <h2 className="text-lg font-bold text-slate-100 mb-4">Progress Insights</h2>

                <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                  <div className="bg-slate-800 rounded-lg p-3">
                    <div className="text-2xl font-bold text-slate-100" data-testid="stat-days-elapsed">{challenge.shred_off_progress.days_elapsed}</div>
                    <div className="text-xs text-slate-400">Days Elapsed</div>
                  </div>
                  <div className="bg-slate-800 rounded-lg p-3">
                    <div className="text-2xl font-bold text-slate-100" data-testid="stat-days-remaining">{challenge.shred_off_progress.days_remaining}</div>
                    <div className="text-xs text-slate-400">Days Left</div>
                  </div>
                  <div className="bg-slate-800 rounded-lg p-3">
                    <div className="text-2xl font-bold text-slate-100" data-testid="stat-total-days">{challenge.shred_off_progress.total_days}</div>
                    <div className="text-xs text-slate-400">Total Days</div>
                  </div>
                </div>

                <h3 className="text-sm font-semibold text-slate-300 mb-3">Pace Tracker</h3>
                <div className="space-y-3">
                  {challenge.shred_off_progress.participants.map((p: any) => (
                    <div key={p.user_id} className="flex items-center justify-between flex-wrap gap-2 bg-slate-800 rounded-lg p-3" data-testid={`pace-tracker-${p.username}`}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getUserColor(p.username) }} />
                        <span className="text-sm font-medium text-slate-200">{p.username}</span>
                      </div>
                      <div className="text-right text-xs">
                        {p.pace_status === 'done' ? (
                          <span className="text-green-400 font-medium">Goal Reached!</span>
                        ) : (() => {
                          const avgDisplay = -p.daily_avg_loss;
                          const needDisplay = -p.needed_per_day;
                          const isOnPace = p.daily_avg_loss >= p.needed_per_day;
                          const avgColor = isOnPace ? 'text-emerald-400' : 'text-red-400';
                          const needColor = isOnPace ? 'text-emerald-400' : 'text-red-400';
                          return (
                            <>
                              <div>
                                <span className="text-slate-400">Avg: </span>
                                <span className={avgColor}>
                                  {avgDisplay > 0 ? '+' : ''}{avgDisplay.toFixed(2)}kg/day
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400">Need: </span>
                                <span className={needColor}>
                                  {needDisplay > 0 ? '+' : ''}{needDisplay.toFixed(2)}kg/day
                                </span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Shred Off Weight Chart */}
                {challenge.shred_off_progress.participants.some((p: any) => p.weight_entries && p.weight_entries.length > 0) && (() => {
                  const participants = challenge.shred_off_progress.participants.filter((p: any) => p.weight_entries && p.weight_entries.length > 0);
                  const targetLoss = challenge.shred_off_progress.target_loss;
                  const startsOn = challenge.starts_on;
                  const endsOn = challenge.ends_on;

                  const allDatesSet = new Set<string>();
                  participants.forEach((p: any) => {
                    p.weight_entries.forEach((e: any) => allDatesSet.add(e.date));
                  });
                  if (startsOn) allDatesSet.add(startsOn);
                  if (endsOn) allDatesSet.add(endsOn);
                  const allDates = [...allDatesSet].sort();

                  const chartData = allDates.map(date => {
                    const point: any = {
                      date,
                      displayDate: (() => {
                        const d = new Date(date);
                        if (isNaN(d.getTime())) return date;
                        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
                      })(),
                    };
                    participants.forEach((p: any) => {
                      const entry = p.weight_entries.find((e: any) => e.date === date);
                      if (entry) point[p.username] = entry.weight;

                      if (p.start_weight && targetLoss && startsOn && endsOn) {
                        const startDate = new Date(startsOn);
                        const endDate = new Date(endsOn);
                        const currentDate = new Date(date);
                        if (currentDate >= startDate && currentDate <= endDate) {
                          const totalMs = endDate.getTime() - startDate.getTime();
                          const elapsedMs = currentDate.getTime() - startDate.getTime();
                          const fraction = totalMs > 0 ? elapsedMs / totalMs : 0;
                          point[`${p.username}_pace`] = Math.round((p.start_weight - (targetLoss * fraction)) * 100) / 100;
                        }
                      }
                    });
                    return point;
                  });

                  const targetWeights: Record<string, number> = {};
                  participants.forEach((p: any) => {
                    if (p.start_weight && targetLoss) {
                      targetWeights[p.username] = Math.round((p.start_weight - targetLoss) * 100) / 100;
                    }
                  });

                  const allWeights = chartData.flatMap(d => {
                    const vals: number[] = [];
                    participants.forEach((p: any) => {
                      if (d[p.username] !== undefined) vals.push(d[p.username]);
                      if (d[`${p.username}_pace`] !== undefined) vals.push(d[`${p.username}_pace`]);
                    });
                    return vals;
                  }).filter(v => typeof v === 'number');
                  Object.values(targetWeights).forEach(tw => allWeights.push(tw));
                  const minWeight = allWeights.length > 0 ? Math.floor(Math.min(...allWeights) - 1) : 70;
                  const maxWeight = allWeights.length > 0 ? Math.ceil(Math.max(...allWeights) + 1) : 100;

                  

                  return (
                    <>
                      <h3 className="text-sm font-semibold text-slate-300 mt-5 mb-3" data-testid="shredoff-chart-title">Weight Tracker</h3>
                      <div className="bg-slate-800 rounded-lg p-3">
                        <ResponsiveContainer width="100%" height={250}>
                          <LineChart data={chartData} margin={{ top: 5, right: 55, left: -15, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis
                              dataKey="displayDate"
                              tick={{ fill: '#94a3b8', fontSize: 10 }}
                              tickLine={{ stroke: '#475569' }}
                              axisLine={{ stroke: '#475569' }}
                              interval="preserveStartEnd"
                            />
                            <YAxis
                              yAxisId="left"
                              domain={[minWeight, maxWeight]}
                              tick={{ fill: '#94a3b8', fontSize: 10 }}
                              tickLine={{ stroke: '#475569' }}
                              axisLine={{ stroke: '#475569' }}
                              tickFormatter={(v: number) => `${v}kg`}
                            />
                            <YAxis
                              yAxisId="right"
                              orientation="right"
                              domain={[minWeight, maxWeight]}
                              tick={false}
                              tickLine={false}
                              axisLine={false}
                            />
                            {participants.map((p: any) => {
                              const tw = targetWeights[p.username];
                              if (!tw) return null;
                              return (
                                <ReferenceLine
                                  key={`target-line-${p.username}`}
                                  yAxisId="left"
                                  y={tw}
                                  stroke={getUserColor(p.username)}
                                  strokeDasharray="2 4"
                                  strokeOpacity={0.3}
                                  label={{
                                    value: `${p.username}: ${tw}kg`,
                                    position: 'right',
                                    fill: getUserColor(p.username),
                                    fontSize: 9,
                                    fontWeight: 600,
                                  }}
                                />
                              );
                            })}
                            <Tooltip
                              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', fontSize: '12px' }}
                              labelStyle={{ color: '#e2e8f0' }}
                              content={({ active, payload, label }: any) => {
                                if (!active || !payload || payload.length === 0) return null;
                                const dateStr = payload[0]?.payload?.date;
                                const isChallStartDate = dateStr === startsOn;
                                return (
                                  <div style={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}>
                                    <p style={{ color: '#e2e8f0', marginBottom: '4px', fontWeight: 600 }}>{label}</p>
                                    {payload.map((entry: any) => {
                                      const isPace = entry.dataKey?.endsWith('_pace');
                                      const username = isPace ? entry.dataKey.replace('_pace', '') : entry.dataKey;
                                      let labelText: string;
                                      if (isPace && isChallStartDate) {
                                        labelText = `${username} (starting weight)`;
                                      } else if (isPace) {
                                        labelText = `${username} (goal pace)`;
                                      } else {
                                        labelText = username;
                                      }
                                      return (
                                        <p key={entry.dataKey} style={{ color: entry.color, margin: '2px 0' }}>
                                          {labelText}: {entry.value}kg
                                        </p>
                                      );
                                    })}
                                  </div>
                                );
                              }}
                            />
                            {participants.map((p: any) => (
                              <Line
                                key={p.username}
                                yAxisId="left"
                                type="monotone"
                                dataKey={p.username}
                                stroke={getUserColor(p.username)}
                                strokeWidth={2}
                                dot={{ r: 3, fill: getUserColor(p.username) }}
                                connectNulls
                                name={p.username}
                              />
                            ))}
                            {participants.map((p: any) => (
                              <Line
                                key={`${p.username}_pace`}
                                yAxisId="left"
                                type="linear"
                                dataKey={`${p.username}_pace`}
                                stroke={getUserColor(p.username)}
                                strokeWidth={1}
                                strokeDasharray="5 5"
                                strokeOpacity={0.5}
                                dot={false}
                                connectNulls
                                name={`${p.username}_pace`}
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                        <div className="flex flex-wrap gap-3 mt-2 justify-center">
                          {participants.map((p: any) => (
                            <div key={p.username} className="flex items-center gap-1.5 text-xs">
                              <div className="w-3 h-0.5 rounded" style={{ backgroundColor: getUserColor(p.username) }} />
                              <span className="text-slate-300">{p.username}</span>
                              {p.start_weight && (
                                <span className="text-slate-500">({p.start_weight}kg)</span>
                              )}
                              {targetLoss && (
                                <>
                                  <div className="w-3 h-0 border-t border-dashed" style={{ borderColor: getUserColor(p.username), opacity: 0.5 }} />
                                  <span className="text-slate-500">goal pace</span>
                                </>
                              )}
                              {targetWeights[p.username] && (
                                <span className="text-slate-500 ml-1">Goal: {targetWeights[p.username]}kg</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  );
                })()}

                {challenge.shred_off_progress.participants.some((p: any) => p.best_day_drop) && (
                  <>
                    <h3 className="text-sm font-semibold text-slate-300 mt-5 mb-3">Best Single-Day Drop</h3>
                    <div className="space-y-2">
                      {challenge.shred_off_progress.participants
                        .filter((p: any) => p.best_day_drop)
                        .sort((a: any, b: any) => b.best_day_drop.drop - a.best_day_drop.drop)
                        .map((p: any, idx: number) => (
                          <div key={p.user_id} className="flex items-center justify-between flex-wrap gap-2 bg-slate-800 rounded-lg p-3" data-testid={`best-drop-${p.username}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-400">{idx + 1}.</span>
                              <span className="text-sm font-medium" style={{ color: getUserColor(p.username) }}>{p.username}</span>
                            </div>
                            <div className="text-right text-xs">
                              <span className="text-green-400 font-medium">-{p.best_day_drop.drop}kg</span>
                              <span className="text-slate-500 ml-2">{formatDate(p.best_day_drop.date)}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </>
                )}

                <h3 className="text-sm font-semibold text-slate-300 mt-5 mb-3">Weigh-in Log</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {challenge.shred_off_progress.participants.map((p: any) => (
                    <div key={p.user_id} className="bg-slate-800 rounded-lg p-3 text-center" data-testid={`weighin-count-${p.username}`}>
                      <span className="text-sm font-medium block" style={{ color: getUserColor(p.username) }}>{p.username}</span>
                      <span className="text-lg font-bold text-slate-100">{p.log_count}</span>
                      <span className="text-xs text-slate-400 block">weigh-ins</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
          )}

          {/* Cancelled Section - for solo/Lone Wolf missions */}
          {challenge.status === 'cancelled' && (
            <div className="rounded-xl p-6 mb-6 bg-slate-800/50 border border-slate-600/50">
              <h2 className="text-lg font-bold mb-2 text-slate-300">
                {challenge.scope === 'solo' ? 'Lone Wolf Mission Cancelled' : 'Challenge Cancelled'}
              </h2>
            </div>
          )}

          {/* Winner Section - only for completed challenges with a winner (NOT for Team Blitzkrieg) */}
          {challenge.status === 'completed' && challenge.winner_user_id && 
            !(challenge.scope === 'team' && !challenge.template_key) && (() => {
            const surrenderer = challenge.participants.find(p => p.state === 'surrendered');
            const winnerName = challenge.participants.find(p => p.user_id === challenge.winner_user_id)?.username || 'Unknown';
            const isLoneWolf = challenge.scope === 'solo' || challenge.scope === 'individual' || challenge.template_key === 'lone_flaps';
            
            return (
              <div className={`rounded-xl p-6 mb-6 ${
                challenge.result?.is_tie 
                  ? 'bg-yellow-900/30 border border-yellow-700/50' 
                  : 'bg-green-900/30 border border-green-700/50'
              }`}>
                <h2 className="text-lg font-bold mb-2">
                  {challenge.result?.is_tie ? (
                    <span className="text-yellow-300">It&apos;s a Tie!</span>
                  ) : isLoneWolf ? (
                    <span className="text-green-300">Lone Wolf Mission Complete</span>
                  ) : surrenderer ? (
                    <span>
                      <span className="text-red-400">{surrenderer.username} Surrendered.</span>
                      {' '}
                      <span className="text-green-300">Winner: {winnerName}</span>
                    </span>
                  ) : (
                    <span className="text-green-300">Winner: {winnerName}</span>
                  )}
                </h2>
                {challenge.completed_at && (
                  <p className="text-sm text-slate-400">
                    Completed on {formatDate(challenge.completed_at.split('T')[0])}
                    {challenge.completed_at.includes('T') && (
                      <span className="ml-1">
                        at {new Date(challenge.completed_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' })}
                      </span>
                    )}
                  </p>
                )}
              </div>
            );
          })()}

          {/* Completed without a specific winner (team flaps, flap_off draws, etc.) */}
          {challenge.status === 'completed' && !challenge.winner_user_id &&
            !(challenge.scope === 'team' && !challenge.template_key) && (
            <div className="rounded-xl p-6 mb-6 bg-green-900/30 border border-green-700/50">
              <h2 className="text-lg font-bold mb-2">
                <span className="text-green-300">Mission Complete</span>
              </h2>
              {challenge.completed_at && (
                <p className="text-sm text-slate-400">
                  Completed on {formatDate(challenge.completed_at.split('T')[0])}
                  {challenge.completed_at.includes('T') && (
                    <span className="ml-1">
                      at {new Date(challenge.completed_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' })}
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Failed challenges — not cancelled, not covered by other sections */}
          {challenge.status === 'failed' && (
            <div className="rounded-xl p-6 mb-6 bg-red-900/30 border border-red-700/50">
              <h2 className="text-lg font-bold mb-2">
                <span className="text-red-300">
                  {challenge.scope === 'solo' || challenge.scope === 'individual' ? 'Mission Failed' : 'Challenge Failed'}
                </span>
              </h2>
              {challenge.completed_at && (
                <p className="text-sm text-slate-400">
                  Ended on {formatDate(challenge.completed_at.split('T')[0])}
                </p>
              )}
            </div>
          )}

          {/* Team Blitzkrieg Completion Section - shows Completed/Failed status */}
          {challenge.status === 'completed' && challenge.scope === 'team' && !challenge.template_key && (() => {
            const result = challenge.result as { team_completed?: boolean; participant_results?: any[] } | null;
            const teamCompleted = result?.team_completed;
            
            return (
              <div className={`rounded-xl p-6 mb-6 ${
                teamCompleted 
                  ? 'bg-green-900/30 border border-green-700/50' 
                  : 'bg-red-900/30 border border-red-700/50'
              }`}>
                <h2 className="text-lg font-bold mb-2">
                  <span className={teamCompleted ? 'text-green-300' : 'text-red-300'}>
                    Mission {teamCompleted ? 'Completed' : 'Failed'}
                  </span>
                </h2>
                {challenge.completed_at && (
                  <p className="text-sm text-slate-400 mb-3">
                    Ended on {formatDate(challenge.completed_at.split('T')[0])}
                    {challenge.completed_at.includes('T') && (
                      <span className="ml-1">
                        at {new Date(challenge.completed_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' })}
                      </span>
                    )}
                  </p>
                )}
                <p className="text-sm text-slate-300">
                  {teamCompleted 
                    ? 'At least one team member completed all objectives!' 
                    : 'No team members completed all objectives.'}
                </p>
              </div>
            );
          })()}

          {/* Action Buttons - Only for pending invites */}
          {canRespond && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
              <h2 className="text-lg font-bold text-slate-100 mb-4">Actions</h2>
              
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleRespond('accept')}
                  disabled={responding}
                  className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 text-white font-bold rounded-lg transition-colors"
                  data-testid="button-accept"
                >
                  {responding ? 'Processing...' : 'Going to War'}
                </button>
                <button
                  onClick={() => handleRespond('decline')}
                  disabled={responding}
                  className="px-6 py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-600 text-white font-bold rounded-lg transition-colors"
                  data-testid="button-decline"
                >
                  {responding ? 'Processing...' : challenge.scope === 'team' ? 'Reject Mission' : 'Decline'}
                </button>
              </div>
            </div>
          )}

          {/* Back to Warzone button */}
          <div className="mt-8 flex items-center justify-between gap-3 px-4">
            <Link
              href="/warzone"
              className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl transition-colors"
              data-testid="button-back-warzone"
            >
              Back to Warzone
            </Link>
            {/* Delete Challenge fallback - only show if not already showing under Surrender */}
            {canDelete && !(challenge.is_rep_challenge && challenge.current_user_participant && 
              (challenge.current_user_participant.state === 'accepted' || challenge.current_user_participant.state === 'latecomer')) && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-red-500 hover:text-red-400 underline disabled:opacity-50"
                data-testid="button-delete-challenge-fallback"
              >
                {deleting ? 'Deleting...' : 'Delete Challenge'}
              </button>
            )}
          </div>
        </main>
      </div>

      {showEditModal && challenge && (
        <ChallengeEditModal
          challengeId={challenge.id}
          initialData={{
            title: challenge.title,
            starts_on: challenge.starts_on,
            ends_on: challenge.ends_on,
            stake_text: challenge.stake_text,
            stake_amount: challenge.stake_amount || null,
            description: challenge.description,
            scope: challenge.scope,
            template_key: challenge.template_key,
            target_weight_kg: challenge.target_weight_kg ? String(challenge.target_weight_kg) : null,
            target_duration_minutes: challenge.target_duration_minutes,
            target_avg_heart_rate: challenge.target_avg_heart_rate,
            target_calories: challenge.target_calories,
            status: challenge.status,
          }}
          tasks={(challenge.tasks || []).map((t: any) => ({
            id: t.id,
            name: t.name || '',
            unit_type: t.unit_type || 'reps',
            target_type: t.target_type || 'total',
            target_value: String(t.target_value || '0'),
          }))}
          participants={(challenge.participants || [])
            .filter((p: any) => p.state === 'accepted' || p.state === 'latecomer' || p.state === 'creator')
            .map((p: any) => ({ user_id: p.user_id, username: p.username }))}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
            fetchChallenge();
          }}
        />
      )}
    </>
  );
}
