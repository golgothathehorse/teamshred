// pages/warzone/index.tsx
// Phase 3: Warzone with real API integration
import { useState, useEffect, useRef, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import { parseSessionFromRequest } from '../../lib/auth';
import { sortExerciseTypes } from '../../lib/exercises';
import { getUserColor } from '../../lib/userColors';
import { HiitTooltip } from '../../components/HiitTooltip';
import ChallengeEditModal from '../../components/ChallengeEditModal';

// Helper to format activity feed timestamps
function formatActivityTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 || 12;
  const timeStr = `${hour12}:${minutes.toString().padStart(2, '0')}${ampm}`;
  
  if (isToday) {
    return timeStr;
  }
  
  // For older dates, show day abbreviation
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[date.getDay()]} ${timeStr}`;
}

function formatSeshDuration(startIso: string | null, endIso: string | null): string | null {
  if (!startIso || !endIso) return null;
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (diffMs <= 0) return null;
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatSetSplit(prevIso: string | null, currIso: string | null): string | null {
  if (!prevIso || !currIso) return null;
  const diffMs = new Date(currIso).getTime() - new Date(prevIso).getTime();
  if (diffMs <= 0) return null;
  const totalSec = Math.floor(diffMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `+${m}:${s.toString().padStart(2, '0')}`;
}

// Warzone is always enabled

// Server-side authentication check
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const user = parseSessionFromRequest(ctx.req);
  
  if (!user) {
    return { redirect: { destination: '/login', permanent: false } };
  }
  
  return { props: {} };
};

type Template = {
  id: string;
  name: string;
  category: string;
  description: string;
  duration: string;
  winCondition: string;
  stakes: string;
};

type User = {
  id: string;
  username: string;
};

type Participant = {
  id: string;
  user_id: string;
  username: string;
  role: string;
  state: string;
};

type Challenge = {
  id: string;
  scope: string;
  template_key: string;
  title: string;
  description: string;
  stake_text: string | null;
  starts_on: string;
  ends_on: string;
  status: string;
  created_by_user_id: string;
  created_at: string;
  winner_user_id: string | null;
  participants: Participant[];
  leader_snapshot?: any;
  current_user_participant?: Participant;
  is_rep_challenge?: boolean;
  rep_leaderboard?: any[];
  total_target?: number;
  total_progress?: number;
};

type TabType = 'active';
type LaunchMode = 'attack' | 'team' | 'solo' | null;

type ActivityFeedItem = {
  type: 'challenge_won' | 'challenge_completed' | 'challenge_joined' | 'challenge_created' | 'activity_logged' | 'new_record' | 'sesh_completed' | 'gym_pb' | 'iron_pb' | 'weight_epic' | 'weight_pisscutter' | 'weight_ripper' | 'weight_solid';
  username: string;
  title?: string;
  exercise?: string;
  value?: number;
  unit?: string;
  timestamp: string;
  entry_date?: string;
};

type ExerciseType = {
  id: string;
  name: string;
  unit_type: string;
  unit_label: string;
};

type ChallengeLeg = {
  exercise_type_id: string;
  target_type: string;
  target_value: string;
};

type WallboardUser = {
  user_id: string;
  username: string;
  // Showdown stats (5 columns)
  showdowns_launched: number;
  showdowns_accepted: number;
  showdowns_lost: number;
  showdowns_victories: number;
  showdowns_surrendered: number;
  // Blitzkrieg stats (5 columns)
  blitzkriegs_launched: number;
  blitzkriegs_joined: number;
  blitzkriegs_failed: number;
  blitzkriegs_completed: number;
  blitzkriegs_surrendered: number;
  // Lone Wolf stats (3 columns)
  lonewolf_launched: number;
  lonewolf_failed: number;
  lonewolf_completed: number;
  // Flaps stats (3 columns for each type)
  loneflaps_launched: number;
  loneflaps_completed: number;
  flapoffs_launched: number;
  flapoffs_won: number;
  teamflaps_joined: number;
  teamflaps_completed: number;
  // Legacy fields
  attacks_launched: number;
  surrenders: number;
  successful_lone_wolf: number;
  showdowns_won: number;
  blitzkrieg_completed: number;
  wins: number;
  losses: number;
  share_workout_history: boolean;
};

type TaskParticipant = {
  user_id: string;
  username: string;
  value: number;
  today_value?: number;
};

type TaskBreakdown = {
  task_id: string;
  name: string;
  unit_type: string;
  target_type?: string;
  target: number;
  progress: number;
  today_progress?: number;
  days_elapsed?: number;
  total_days?: number;
  days_met?: number;
  participants?: TaskParticipant[];
};

type LeaderLaggerData = {
  user_id: string;
  username: string;
  total: number;
  tasks: Record<string, number>;
};

type TeamChallenge = Challenge & {
  participant_count: number;
  is_rep_challenge: boolean;
  rep_leaderboard: any[] | null;
  total_target: number;
  total_progress: number;
  task_breakdown?: TaskBreakdown[];
  leader_data?: LeaderLaggerData | null;
  lagger_data?: LeaderLaggerData | null;
  user_has_joined: boolean;
  creator_username?: string;
  target_duration_minutes?: number;
  target_avg_heart_rate?: number;
  target_calories?: number;
  allowed_exercise_modes?: string[];
  target_weight_kg?: string | null;
  flaps_progress?: {
    total_duration: number;
    total_calories: number;
    avg_heart_rate: number;
    session_count: number;
    target_duration: number;
    target_calories: number;
    target_avg_heart_rate: number;
  } | null;
  shred_off_progress?: {
    target_loss: number | null;
    participants: {
      user_id: string;
      username: string;
      weight_lost: number | null;
      progress_percent: number;
      has_data: boolean;
    }[];
  } | null;
};

type HistoryChallenge = {
  id: string;
  title: string;
  scope: string;
  template_key: string | null;
  status: string;
  starts_on: string;
  ends_on: string;
  description: string | null;
  activity_summary: string | null;
  stake_text: string | null;
  result_json: any;
  created_by_user_id: string | null;
  created_by_username: string | null;
  created_at: string | null;
  winner_user_id: string | null;
  winner_username: string | null;
  surrendered_by_user_id: string | null;
  surrendered_by_username: string | null;
  completed_at: string | null;
  participants: {
    user_id: string;
    username: string;
    role: string;
    state: string;
  }[];
  outcome: 'winner' | 'cancelled' | 'surrendered' | 'completed' | 'failed' | 'expired' | 'active' | 'pending';
};

function SetNoteIcon({ note }: { note: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      className="relative"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={() => setVisible(v => !v)}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400 cursor-pointer"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      {visible && (
        <span className="absolute bottom-full left-0 mb-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 whitespace-pre-wrap max-w-[200px] z-10 shadow-lg">
          {note}
        </span>
      )}
    </span>
  );
}

export default function WarZonePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('active');
  
  // Data states
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [teamChallenges, setTeamChallenges] = useState<TeamChallenge[]>([]);
  const [wallboardStats, setWallboardStats] = useState<WallboardUser[]>([]);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [exerciseTypes, setExerciseTypes] = useState<ExerciseType[]>([]);
  const sortedExerciseTypes = useMemo(() => sortExerciseTypes(exerciseTypes), [exerciseTypes]);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>([]);
  const [showActivityFeed, setShowActivityFeed] = useState(true);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showChallengeHistory, setShowChallengeHistory] = useState(false);
  const [challengeHistory, setChallengeHistory] = useState<HistoryChallenge[]>([]);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());
  
  // Shared Workout History states
  const [showSharedWorkoutHistory, setShowSharedWorkoutHistory] = useState(false);
  const [sharedWorkoutSubTab, setSharedWorkoutSubTab] = useState<'activity' | 'flaps' | 'sesh'>('activity');
  const [sharedActivities, setSharedActivities] = useState<any[]>([]);
  const [sharedFlapsEntries, setSharedFlapsEntries] = useState<any[]>([]);
  const [sharedSeshSessions, setSharedSeshSessions] = useState<any[]>([]);
  const [sharedWorkoutLoading, setSharedWorkoutLoading] = useState(false);
  const [teamMembersSharing, setTeamMembersSharing] = useState<{ username: string; shareEnabled: boolean }[]>([]);
  const [expandedSharedSeshIds, setExpandedSharedSeshIds] = useState<Set<string>>(new Set());
  
  // Shared Workout History filters - default to week, expand to month
  const [sharedDateRange, setSharedDateRange] = useState<'today' | 'week' | 'month' | 'all' | 'custom'>('week');
  const [sharedHistoryExpanded, setSharedHistoryExpanded] = useState(false);
  const [sharedCustomStart, setSharedCustomStart] = useState<string>('');
  const [sharedCustomEnd, setSharedCustomEnd] = useState<string>('');
  const [sharedUserFilter, setSharedUserFilter] = useState<string>('all');
  const [sharedExerciseFilter, setSharedExerciseFilter] = useState<string>('all');
  
  // Edit modal state
  const [editChallengeId, setEditChallengeId] = useState<string | null>(null);
  const [editChallengeData, setEditChallengeData] = useState<any>(null);
  const [editChallengeTasks, setEditChallengeTasks] = useState<any[]>([]);
  const [editChallengeParticipants, setEditChallengeParticipants] = useState<{ user_id: string; username: string }[]>([]);
  const [editModalLoading, setEditModalLoading] = useState(false);

  // UI states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  
  // Launch modal states
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [launchMode, setLaunchMode] = useState<LaunchMode>(null);
  
  // Launch form states
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedOpponent, setSelectedOpponent] = useState<string>('');
  const [stakeText, setStakeText] = useState<string>('');
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchSuccess, setLaunchSuccess] = useState<string | null>(null);
  
  // Shred Off date range and custom fields
  const [selectedDateRange, setSelectedDateRange] = useState<string>('');
  const [customTargetWeight, setCustomTargetWeight] = useState<string>('');
  const [customTargetDate, setCustomTargetDate] = useState<string>('');
  
  // Flaps challenge creation state
  const [flapsTitle, setFlapsTitle] = useState<string>('');
  const [flapsDuration, setFlapsDuration] = useState<number>(60);
  const [flapsTargetHR, setFlapsTargetHR] = useState<number>(0);
  const [flapsTargetCalories, setFlapsTargetCalories] = useState<number>(0);
  const [flapsStartDate, setFlapsStartDate] = useState<string>('');
  const [flapsEndDate, setFlapsEndDate] = useState<string>('');
  const [flapsExerciseModes, setFlapsExerciseModes] = useState<string[]>([]);
  const [flapsComments, setFlapsComments] = useState<string>('');

  const [seshTitle, setSeshTitle] = useState<string>('');
  const [seshTargetSessions, setSeshTargetSessions] = useState<number>(10);
  const [seshStartDate, setSeshStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [seshEndDate, setSeshEndDate] = useState<string>(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [seshComments, setSeshComments] = useState<string>('');

  const getFlapsChallengeDays = () => {
    const start = flapsStartDate;
    const end = flapsEndDate || flapsStartDate;
    if (!start || !end) return 1;
    const diffMs = new Date(end).getTime() - new Date(start).getTime();
    return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
  };
  const flapsDays = getFlapsChallengeDays();
  const isMultiDayFlaps = flapsDays > 1;
  
  // Helper to get upcoming weekends (This Weekend, Next Weekend)
  const getUpcomingWeekends = () => {
    const weekends: { id: string; label: string; startDate: string; endDate: string }[] = [];
    const today = new Date();
    
    // Find next Friday
    let friday = new Date(today);
    const dayOfWeek = friday.getDay();
    const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 7 - dayOfWeek + 5;
    friday.setDate(friday.getDate() + daysUntilFriday);
    
    // If today is Sat or Sun, use last Friday as "This Weekend"
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      friday = new Date(today);
      friday.setDate(friday.getDate() - (dayOfWeek === 0 ? 2 : 1));
    }
    
    for (let i = 0; i < 2; i++) {
      const weekendFriday = new Date(friday);
      weekendFriday.setDate(friday.getDate() + i * 7);
      const weekendMonday = new Date(weekendFriday);
      weekendMonday.setDate(weekendFriday.getDate() + 3);
      
      const formatDate = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
      const label = i === 0 ? `This Weekend (${formatDate(weekendFriday)} - ${formatDate(weekendMonday)})` 
                           : `Next Weekend (${formatDate(weekendFriday)} - ${formatDate(weekendMonday)})`;
      
      weekends.push({
        id: `weekend_${i}`,
        label,
        startDate: weekendFriday.toISOString().split('T')[0],
        endDate: weekendMonday.toISOString().split('T')[0],
      });
    }
    return weekends;
  };
  
  // Helper to get upcoming weeks (This Week, Next Week)
  const getUpcomingWeeks = () => {
    const weeks: { id: string; label: string; startDate: string; endDate: string }[] = [];
    const today = new Date();
    
    // Find next Friday
    let friday = new Date(today);
    const dayOfWeek = friday.getDay();
    const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 7 - dayOfWeek + 5;
    friday.setDate(friday.getDate() + daysUntilFriday);
    
    for (let i = 0; i < 2; i++) {
      const weekStart = new Date(friday);
      weekStart.setDate(friday.getDate() + i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      
      const formatDate = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
      const label = i === 0 ? `This Week (${formatDate(weekStart)} - ${formatDate(weekEnd)})` 
                           : `Next Week (${formatDate(weekStart)} - ${formatDate(weekEnd)})`;
      
      weeks.push({
        id: `week_${i}`,
        label,
        startDate: weekStart.toISOString().split('T')[0],
        endDate: weekEnd.toISOString().split('T')[0],
      });
    }
    return weeks;
  };
  
  // Get date options based on selected template
  const getDateOptions = () => {
    const template = templates.find(t => t.id === selectedTemplate);
    if (!template) return [];
    if (template.category === 'weekend') return getUpcomingWeekends();
    if (template.category === 'weekly') return getUpcomingWeeks();
    return [];
  };
  
  const isCustomTemplate = selectedTemplate === 'custom';
  
  // Rep challenge form states
  const [repForm, setRepForm] = useState({
    scope: 'team',
    title: '',
    exercise_type_id: '',
    target_type: 'total',
    target_value: '500',
    starts_on: new Date().toISOString().split('T')[0],
    ends_on: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    opponent_user_id: '',
    stake_text: '',
    description: '',
  });
  const [creatingRep, setCreatingRep] = useState(false);
  
  // Custom challenge with multiple legs
  const [customLegs, setCustomLegs] = useState<ChallengeLeg[]>([
    { exercise_type_id: '', target_type: 'total', target_value: '' }
  ]);
  
  const addLeg = () => {
    if (customLegs.length < 10) {
      const defaultExerciseId = exerciseTypes.length > 0 ? exerciseTypes[0].id : '';
      setCustomLegs([...customLegs, { exercise_type_id: defaultExerciseId, target_type: 'total', target_value: '' }]);
    }
  };
  
  const removeLeg = (index: number) => {
    if (customLegs.length > 1) {
      setCustomLegs(customLegs.filter((_, i) => i !== index));
    }
  };
  
  const updateLeg = (index: number, field: keyof ChallengeLeg, value: string) => {
    const newLegs = [...customLegs];
    newLegs[index] = { ...newLegs[index], [field]: value };
    setCustomLegs(newLegs);
  };

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, []);

  // Ref to prevent double-playing due to React Strict Mode
  const audioPlayedRef = useRef(false);
  
  // Play Warzone intro sound once per session (on first visit after login)
  useEffect(() => {
    // Prevent double-play from React Strict Mode
    if (audioPlayedRef.current) return;
    
    const alreadyPlayed = sessionStorage.getItem('warzone_intro_played');
    if (alreadyPlayed) return;

    // Mark as played immediately to prevent any race conditions
    audioPlayedRef.current = true;
    sessionStorage.setItem('warzone_intro_played', 'true');

    // Small delay to ensure page is ready, then attempt to play
    const playAudio = () => {
      const audio = new Audio('/sounds/warzone-intro.mp3');
      audio.volume = 0.6;
      audio.play().catch(() => {
        // If autoplay blocked, try again on first user interaction
        const playOnInteraction = () => {
          audio.play().catch(() => {});
          document.removeEventListener('click', playOnInteraction);
          document.removeEventListener('keydown', playOnInteraction);
        };
        document.addEventListener('click', playOnInteraction, { once: true });
        document.addEventListener('keydown', playOnInteraction, { once: true });
      });
    };
    
    // Try immediately, then with a small delay
    setTimeout(playAudio, 100);
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    setAuthError(false);

    try {
      // Fetch all data in parallel
      const [challengesRes, templatesRes, usersRes, teamChallengesRes, wallboardRes, teamInfoRes, exerciseTypesRes, activityFeedRes, historyRes] = await Promise.all([
        fetch('/api/warzone/challenges'),
        fetch('/api/warzone/templates'),
        fetch('/api/warzone/users'),
        fetch('/api/warzone/team-challenges'),
        fetch('/api/warzone/wallboard'),
        fetch('/api/team/info'),
        fetch('/api/exercise-types'),
        fetch('/api/warzone/activity-feed'),
        fetch('/api/warzone/challenge-history'),
      ]);

      // Check for auth errors
      if (challengesRes.status === 401 || usersRes.status === 401) {
        setAuthError(true);
        setLoading(false);
        return;
      }

      const [challengesData, templatesData, usersData, teamChallengesData, wallboardData, teamInfoData, exerciseTypesData, activityFeedData] = await Promise.all([
        challengesRes.json(),
        templatesRes.json(),
        usersRes.json(),
        teamChallengesRes.json(),
        wallboardRes.json(),
        teamInfoRes.json(),
        exerciseTypesRes.json(),
        activityFeedRes.json(),
      ]);
      
      // Parse history separately to handle errors gracefully
      let historyData = { ok: false, history: [] };
      if (historyRes.ok) {
        try {
          historyData = await historyRes.json();
        } catch (e) {
          console.error('Failed to parse challenge history:', e);
        }
      }

      if (challengesData.ok) {
        setChallenges(challengesData.challenges || []);
        if (challengesData.current_user_id) {
          setCurrentUserId(challengesData.current_user_id);
        }
        if (challengesData.is_admin !== undefined) {
          setIsAdmin(challengesData.is_admin);
        }
      }

      if (templatesData.ok) {
        setTemplates(templatesData.templates || []);
        if (templatesData.templates?.length > 0) {
          setSelectedTemplate(templatesData.templates[0].id);
        }
      }

      if (usersData.ok) {
        setUsers(usersData.users || []);
        if (usersData.users?.length > 0) {
          setSelectedOpponent(usersData.users[0].id);
        }
      }

      if (teamChallengesData.ok) {
        setTeamChallenges(teamChallengesData.challenges || []);
        // Also get current_user_id from team challenges if not already set
        if (!currentUserId && teamChallengesData.current_user_id) {
          setCurrentUserId(teamChallengesData.current_user_id);
        }
        if (teamChallengesData.is_admin !== undefined && !isAdmin) {
          setIsAdmin(teamChallengesData.is_admin);
        }
      }

      if (wallboardData.ok) {
        setWallboardStats(wallboardData.stats || []);
      }

      if (historyData.ok) {
        setChallengeHistory(historyData.history || []);
      }

      if (teamInfoData.ok && teamInfoData.team) {
        setTeamName(teamInfoData.team.name);
      }

      if (exerciseTypesData.ok) {
        const types = exerciseTypesData.exercise_types || [];
        setExerciseTypes(types);
        // Set default exercise type for forms
        if (types.length > 0) {
          setRepForm(prev => ({ ...prev, exercise_type_id: types[0].id }));
          setCustomLegs([{ exercise_type_id: types[0].id, target_type: 'total', target_value: '' }]);
        }
      }

      if (activityFeedData.ok) {
        setActivityFeed(activityFeedData.activities || []);
      }
    } catch (err) {
      console.error('Error fetching Warzone data:', err);
      setError('Failed to load Warzone data');
    } finally {
      setLoading(false);
    }
  }

  // Fetch shared workout history from team members
  async function fetchSharedWorkoutHistory() {
    setSharedWorkoutLoading(true);
    try {
      // Build query params for filters
      const params = new URLSearchParams();
      params.set('dateRange', sharedDateRange);
      if (sharedDateRange === 'custom' && sharedCustomStart) {
        params.set('startDate', sharedCustomStart);
      }
      if (sharedDateRange === 'custom' && sharedCustomEnd) {
        params.set('endDate', sharedCustomEnd);
      }
      if (sharedUserFilter !== 'all') {
        params.set('username', sharedUserFilter);
      }
      
      // Fetch shared activity history, flaps history, and sesh history in parallel
      const [activitiesRes, flapsRes, seshRes] = await Promise.all([
        fetch(`/api/warzone/shared-activities?${params.toString()}`),
        fetch(`/api/tracker/shared-flaps?${params.toString()}`),
        fetch(`/api/gym/shared-sessions?${params.toString()}`),
      ]);
      
      if (activitiesRes.ok) {
        const activitiesData = await activitiesRes.json();
        if (activitiesData.ok) {
          setSharedActivities(activitiesData.activities || []);
          if (activitiesData.teamMembers) {
            setTeamMembersSharing(activitiesData.teamMembers);
          }
        }
      }
      
      if (flapsRes.ok) {
        const flapsData = await flapsRes.json();
        if (flapsData.ok) {
          setSharedFlapsEntries(flapsData.entries || []);
          if (flapsData.teamMembers) {
            setTeamMembersSharing(flapsData.teamMembers);
          }
        }
      }

      if (seshRes.ok) {
        const seshData = await seshRes.json();
        if (seshData.ok) {
          setSharedSeshSessions(seshData.sessions || []);
          if (seshData.teamMembers) {
            setTeamMembersSharing(seshData.teamMembers);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching shared workout history:', err);
    } finally {
      setSharedWorkoutLoading(false);
    }
  }

  // Fetch shared workout history when section is expanded or filters change
  useEffect(() => {
    if (showSharedWorkoutHistory) {
      fetchSharedWorkoutHistory();
    }
  }, [showSharedWorkoutHistory, sharedDateRange, sharedCustomStart, sharedCustomEnd, sharedUserFilter]);

  // Handle launching an attack
  async function handleLaunchAttack() {
    if (!selectedTemplate || !selectedOpponent) {
      setLaunchError('Please select a template and opponent');
      return;
    }
    
    // Validate date range for non-custom templates
    if (selectedTemplate !== 'custom' && !selectedDateRange) {
      setLaunchError('Please select a timeframe');
      return;
    }
    
    // Validate custom template fields
    if (selectedTemplate === 'custom') {
      if (!customTargetWeight || !customTargetDate) {
        setLaunchError('Please enter target weight loss and deadline');
        return;
      }
      if (parseFloat(customTargetWeight) <= 0) {
        setLaunchError('Target weight loss must be greater than 0');
        return;
      }
    }

    setLaunching(true);
    setLaunchError(null);
    setLaunchSuccess(null);

    try {
      // Build request body based on template type
      let body: any = {
        opponent_user_id: selectedOpponent,
        stake_text: stakeText || null,
      };
      
      if (selectedTemplate === 'custom') {
        // Custom challenge with target weight
        body.template_key = 'custom';
        body.target_weight_kg = parseFloat(customTargetWeight);
        body.starts_on = new Date().toISOString().split('T')[0];
        body.ends_on = customTargetDate;
      } else {
        // Template-based challenge with selected date range
        body.template_key = selectedTemplate;
        const dateOptions = getDateOptions();
        const selectedOption = dateOptions.find(opt => opt.id === selectedDateRange);
        if (selectedOption) {
          body.starts_on = selectedOption.startDate;
          body.ends_on = selectedOption.endDate;
        }
      }
      
      const res = await fetch('/api/warzone/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setLaunchError(data.error || 'Failed to launch attack');
        return;
      }

      // Success - refresh data and show message
      setLaunchSuccess('Attack launched! Waiting for opponent to respond.');
      setStakeText('');
      setSelectedDateRange('');
      setCustomTargetWeight('');
      setCustomTargetDate('');
      await fetchData();
      setActiveTab('active');
    } catch (err) {
      console.error('Error launching attack:', err);
      setLaunchError('Failed to launch attack');
    } finally {
      setLaunching(false);
    }
  }

  // Handle responding to a challenge
  async function handleRespond(challengeId: string, action: 'accept' | 'decline') {
    try {
      const res = await fetch(`/api/warzone/challenges/${challengeId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        alert(data.error || 'Failed to respond');
        return;
      }

      // Refresh data
      await fetchData();
    } catch (err) {
      console.error('Error responding:', err);
      alert('Failed to respond to challenge');
    }
  }

  // Navigate to challenge detail
  function handleView(challengeId: string) {
    router.push(`/warzone/${challengeId}`);
  }

  async function handleOpenEditModal(challengeId: string) {
    setEditChallengeId(challengeId);
    setEditModalLoading(true);
    try {
      const res = await fetch(`/api/warzone/challenges/${challengeId}`);
      const data = await res.json();
      if (data.ok) {
        const c = data.challenge;
        setEditChallengeData({
          title: c.title,
          starts_on: c.starts_on,
          ends_on: c.ends_on,
          stake_text: c.stake_text,
          stake_amount: c.stake_amount,
          description: c.description,
          scope: c.scope,
          template_key: c.template_key,
          target_weight_kg: c.target_weight_kg,
          target_duration_minutes: c.target_duration_minutes,
          target_avg_heart_rate: c.target_avg_heart_rate,
          target_calories: c.target_calories,
          status: c.status,
        });
        setEditChallengeTasks(
          (c.task_breakdown || c.tasks || []).map((t: any) => ({
            id: t.task_id || t.id,
            name: t.name || t.task_name || '',
            unit_type: t.unit_type || 'reps',
            target_type: t.target_type || 'total',
            target_value: String(t.target || t.target_value || '0'),
          }))
        );
        setEditChallengeParticipants(
          (c.participants || [])
            .filter((p: any) => p.state === 'accepted' || p.state === 'latecomer' || p.state === 'creator')
            .map((p: any) => ({ user_id: p.user_id, username: p.username }))
        );
      }
    } catch (err) {
      console.error('Error loading challenge for edit:', err);
    }
    setEditModalLoading(false);
  }

  // Format date for display (DD/MM/YYYY)
  function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  }

  // Handle creating a rep challenge
  async function handleCreateRepChallenge() {
    if (exerciseTypes.length === 0) {
      setLaunchError('Exercise types are still loading. Please wait.');
      return;
    }
    if (!repForm.title.trim()) {
      setLaunchError('Please enter a challenge title');
      return;
    }
    if (!repForm.exercise_type_id) {
      setLaunchError('Please select an exercise type');
      return;
    }
    if (!repForm.target_value || parseInt(repForm.target_value) <= 0) {
      setLaunchError('Please enter a positive target value');
      return;
    }
    if (repForm.scope === 'duel' && !repForm.opponent_user_id) {
      setLaunchError('Please select an opponent');
      return;
    }

    const selectedExerciseType = exerciseTypes.find(et => et.id === repForm.exercise_type_id);
    
    setCreatingRep(true);
    setLaunchError(null);
    setLaunchSuccess(null);

    try {
      const res = await fetch('/api/warzone/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: repForm.scope,
          title: repForm.title,
          exercise_type_id: repForm.exercise_type_id,
          task_name: selectedExerciseType?.name || 'Exercise',
          target_type: repForm.target_type,
          target_value: parseInt(repForm.target_value) || 500,
          starts_on: repForm.starts_on,
          ends_on: repForm.ends_on,
          opponent_user_id: repForm.scope === 'duel' ? repForm.opponent_user_id : undefined,
          stake_text: repForm.stake_text || undefined,
          comments: repForm.description.trim() || undefined,
          challenge_kind: 'reps',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setLaunchError(data.error || 'Failed to create rep challenge');
        return;
      }

      setLaunchSuccess(
        repForm.scope === 'team'
          ? 'Team Blitzkrieg created! Team members can now join.'
          : 'Rep duel launched! Waiting for opponent to respond.'
      );
      setRepForm({
        ...repForm,
        title: '',
        stake_text: '',
        description: '',
      });
      await fetchData();
      setActiveTab('active');
    } catch (err) {
      console.error('Error creating rep challenge:', err);
      setLaunchError('Failed to create rep challenge');
    } finally {
      setCreatingRep(false);
    }
  }

  // Handle creating a custom multi-leg challenge
  async function handleCreateCustomChallenge(scope: 'duel' | 'team' | 'solo') {
    if (exerciseTypes.length === 0) {
      setLaunchError('Exercise types are still loading. Please wait.');
      return;
    }
    if (!repForm.title.trim()) {
      setLaunchError('Please enter a challenge title');
      return;
    }
    if (customLegs.some(leg => !leg.exercise_type_id)) {
      setLaunchError('Please select an exercise type for all legs');
      return;
    }
    if (customLegs.some(leg => !leg.target_value || parseInt(leg.target_value) <= 0)) {
      setLaunchError('Please enter a positive target value for all legs');
      return;
    }
    if (scope === 'duel' && !repForm.opponent_user_id) {
      setLaunchError('Please select an opponent');
      return;
    }

    setCreatingRep(true);
    setLaunchError(null);
    setLaunchSuccess(null);

    try {
      const res = await fetch('/api/warzone/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: scope,
          title: repForm.title,
          starts_on: repForm.starts_on,
          ends_on: repForm.ends_on,
          opponent_user_id: scope === 'duel' ? repForm.opponent_user_id : undefined,
          stake_text: repForm.stake_text || undefined,
          comments: repForm.description.trim() || undefined,
          challenge_kind: 'custom',
          legs: customLegs.map(leg => {
            const exerciseType = exerciseTypes.find(et => et.id === leg.exercise_type_id);
            return {
              exercise_type_id: leg.exercise_type_id,
              task_name: exerciseType?.name || 'Exercise',
              target_type: leg.target_type,
              target_value: parseInt(leg.target_value) || 0,
            };
          }),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setLaunchError(data.error || 'Failed to create custom challenge');
        return;
      }

      setLaunchSuccess(
        scope === 'team'
          ? 'Custom Team Blitzkrieg created! Team members can now join.'
          : scope === 'solo'
          ? 'Custom Lone Wolf challenge created!'
          : 'Custom challenge launched! Waiting for opponent to respond.'
      );
      setRepForm({
        ...repForm,
        title: '',
        stake_text: '',
        description: '',
      });
      const defaultExerciseId = exerciseTypes.length > 0 ? exerciseTypes[0].id : '';
      setCustomLegs([{ exercise_type_id: defaultExerciseId, target_type: 'total', target_value: '' }]);
      await fetchData();
      setActiveTab('active');
    } catch (err) {
      console.error('Error creating custom challenge:', err);
      setLaunchError('Failed to create custom challenge');
    } finally {
      setCreatingRep(false);
    }
  }

  // Handle joining a team challenge
  async function handleJoinChallenge(challengeId: string) {
    try {
      const res = await fetch(`/api/warzone/challenges/${challengeId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        alert(data.error || 'Failed to join challenge');
        return;
      }

      await fetchData();
    } catch (err) {
      console.error('Error joining challenge:', err);
      alert('Failed to join challenge');
    }
  }

  // Handle leaving a team challenge
  async function handleLeaveChallenge(challengeId: string) {
    if (!confirm('Are you sure you want to leave this challenge?')) return;

    try {
      const res = await fetch(`/api/warzone/challenges/${challengeId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        alert(data.error || 'Failed to leave challenge');
        return;
      }

      await fetchData();
    } catch (err) {
      console.error('Error leaving challenge:', err);
      alert('Failed to leave challenge');
    }
  }

  // Handle deleting a challenge (admin only)
  async function handleDeleteChallenge(challengeId: string) {
    if (!confirm('Are you sure you want to delete this challenge? This action cannot be undone.')) return;

    try {
      const res = await fetch(`/api/warzone/challenges/${challengeId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        alert(data.error || 'Failed to delete challenge');
        return;
      }

      await fetchData();
    } catch (err) {
      console.error('Error deleting challenge:', err);
      alert('Failed to delete challenge');
    }
  }

  // Close modal and reset
  function closeLaunchModal() {
    setShowLaunchModal(false);
    setLaunchMode(null);
    setLaunchError(null);
    setLaunchSuccess(null);
    setSeshTitle('');
    setSeshTargetSessions(10);
    setSeshComments('');
  }

  // Handle mode selection in launch modal
  function handleSelectMode(mode: LaunchMode) {
    setLaunchMode(mode);
    // Pre-set repForm scope based on mode
    if (mode === 'team') {
      setRepForm({ ...repForm, scope: 'team' });
    } else if (mode === 'solo') {
      setRepForm({ ...repForm, scope: 'solo' });
    } else if (mode === 'attack') {
      // For attacks, we default to duel mode for rep or use template for status
      setRepForm({ ...repForm, scope: 'duel' });
    }
    // Reset Flaps form state when entering any mode
    setFlapsTitle('');
    setFlapsDuration(60);
    setFlapsTargetHR(0);
    setFlapsTargetCalories(0);
    setFlapsStartDate('');
    setFlapsEndDate('');
    setFlapsExerciseModes([]);
    setFlapsComments('');
  }


  // Auth error
  if (authError) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-100 mb-2">Warzone</h1>
          <p className="text-slate-400 mb-4">Please log in to use Warzone.</p>
          <Link href="/login" className="text-sky-400 hover:text-sky-300">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Warzone | Team Shred</title>
        <meta name="description" content="Challenge your teammates in the Warzone" />
      </Head>

      <div className="min-h-screen bg-slate-950 text-slate-100">
        {/* Header */}
        <header className="bg-slate-900 border-b border-slate-800 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <img 
              src="/images/warzone.png" 
              alt="Warzone" 
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg object-cover flex-shrink-0"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Link 
                href="/tracker" 
                className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                data-testid="link-tracker"
              >
                Apollo
              </Link>
              <Link 
                href="/dashboard" 
                className="px-4 py-2 text-sm font-medium bg-slate-600 hover:bg-slate-500 text-slate-100 rounded-lg transition-colors"
                data-testid="link-dashboard"
              >
                Dashboard
              </Link>
              <Link 
                href="/team" 
                className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                data-testid="link-team-page"
              >
                Team Shred
              </Link>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto p-4">
          {/* Error banner */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Success banner */}
          {launchSuccess && (
            <div className="mb-4 p-3 bg-green-900/50 border border-green-700 rounded-lg text-green-200 text-sm">
              {launchSuccess}
            </div>
          )}

          {/* Launch Attack Button - Centered at top */}
          <div className="flex justify-center mb-4">
            <button
              onClick={() => setShowLaunchModal(true)}
              className="px-6 py-2.5 rounded-lg font-bold bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white transition-colors"
              data-testid="button-launch-challenge"
            >
              Launch Attack
            </button>
          </div>

          {/* Recent Activity Feed */}
          {activityFeed.length > 0 && (
            <div className="mb-6">
              <button
                onClick={() => setShowActivityFeed(!showActivityFeed)}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-2"
                data-testid="toggle-activity-feed"
              >
                <span className="text-emerald-400 font-semibold">Recent Activity</span>
                <span className="text-xs">{showActivityFeed ? '▼' : '▶'}</span>
              </button>
              {showActivityFeed && (
                <div className="border border-slate-700/60 rounded-xl p-3 space-y-2 max-h-52 overflow-y-auto bg-slate-900/60">
                  {activityFeed.slice(0, 15).map((item, idx) => (
                    <div key={idx} className={`text-sm flex items-start gap-2 rounded-lg px-2.5 py-2 ${
                      item.type === 'challenge_won' ? 'bg-gradient-to-r from-amber-950/40 to-transparent border border-amber-500/30 shadow-sm shadow-amber-500/10' :
                      item.type === 'challenge_completed' ? 'bg-gradient-to-r from-green-950/40 to-transparent border border-green-500/25 shadow-sm shadow-green-500/10' :
                      item.type === 'new_record' ? 'bg-gradient-to-r from-pink-950/40 to-transparent border border-pink-500/30 shadow-sm shadow-pink-500/10' :
                      item.type === 'gym_pb' ? 'bg-gradient-to-r from-cyan-950/40 to-transparent border border-cyan-500/25 shadow-sm shadow-cyan-500/10' :
                      item.type === 'iron_pb' ? 'bg-gradient-to-r from-orange-950/40 to-transparent border border-orange-500/30 shadow-sm shadow-orange-500/10' :
                      item.type === 'sesh_completed' ? 'bg-gradient-to-r from-blue-950/30 to-transparent border border-blue-500/20' :
                      item.type === 'weight_epic' ? 'bg-gradient-to-r from-violet-950/40 to-transparent border border-violet-500/30 shadow-sm shadow-violet-500/10' :
                      item.type === 'weight_pisscutter' ? 'bg-gradient-to-r from-amber-950/40 to-transparent border border-amber-400/30 shadow-sm shadow-amber-400/10' :
                      item.type === 'weight_ripper' ? 'bg-gradient-to-r from-green-950/30 to-transparent border border-green-500/20' :
                      item.type === 'weight_solid' ? 'bg-gradient-to-r from-emerald-950/30 to-transparent border border-emerald-500/20' :
                      ''
                    }`}>
                      {item.type === 'challenge_won' && (
                        <>
                          <span className="inline-flex items-center rounded-full bg-amber-500/25 text-amber-200 border border-amber-400/50 px-2 py-[2px] text-[10px] font-bold flex-shrink-0 mt-0.5">WON</span>
                          <span className="text-slate-200 flex-1">
                            <strong className="text-amber-300">{item.username}</strong> won <span className="text-amber-200 font-medium">{item.title}</span>
                          </span>
                          <span className="text-slate-500 text-[10px] flex-shrink-0 mt-0.5">{formatActivityTime(item.timestamp)}</span>
                        </>
                      )}
                      {item.type === 'challenge_completed' && (
                        <>
                          <span className="inline-flex items-center rounded-full bg-green-500/25 text-green-200 border border-green-400/50 px-2 py-[2px] text-[10px] font-bold flex-shrink-0 mt-0.5">DONE</span>
                          <span className="text-slate-200 flex-1">
                            <strong className="text-green-300">{item.username}</strong> completed <span className="text-green-200 font-medium">{item.title}</span>
                          </span>
                          <span className="text-slate-500 text-[10px] flex-shrink-0 mt-0.5">{formatActivityTime(item.timestamp)}</span>
                        </>
                      )}
                      {item.type === 'challenge_created' && (
                        <>
                          <span className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="w-2 h-2 rounded-full bg-blue-400" />
                          </span>
                          <span className="text-slate-300 flex-1">
                            <strong className="text-blue-300">{item.username}</strong> created {item.title}
                          </span>
                          <span className="text-slate-500 text-[10px] flex-shrink-0 mt-0.5">{formatActivityTime(item.timestamp)}</span>
                        </>
                      )}
                      {item.type === 'challenge_joined' && (
                        <>
                          <span className="w-4 h-4 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="w-2 h-2 rounded-full bg-purple-400" />
                          </span>
                          <span className="text-slate-300 flex-1">
                            <strong className="text-purple-300">{item.username}</strong> joined {item.title}
                          </span>
                          <span className="text-slate-500 text-[10px] flex-shrink-0 mt-0.5">{formatActivityTime(item.timestamp)}</span>
                        </>
                      )}
                      {item.type === 'new_record' && (
                        <>
                          <span className="inline-flex items-center rounded-full bg-pink-500/30 text-pink-200 border border-pink-400/50 px-2 py-[2px] text-[10px] font-bold flex-shrink-0 mt-0.5">RECORD</span>
                          <span className="text-slate-200 flex-1">
                            <strong className="text-pink-300">{item.username}</strong> set a new record in <span className="text-pink-200 font-medium">{item.exercise}</span>
                          </span>
                          <span className="text-slate-500 text-[10px] flex-shrink-0 mt-0.5">{formatActivityTime(item.timestamp)}</span>
                        </>
                      )}
                      {item.type === 'gym_pb' && (
                        <>
                          <span className="inline-flex items-center rounded-full bg-cyan-500/25 text-cyan-200 border border-cyan-400/50 px-2 py-[2px] text-[10px] font-bold flex-shrink-0 mt-0.5">GYM PB</span>
                          <span className="text-slate-200 flex-1">
                            <strong className="text-cyan-300">{item.username}</strong> {item.exercise}
                          </span>
                          <span className="text-slate-500 text-[10px] flex-shrink-0 mt-0.5">{formatActivityTime(item.timestamp)}</span>
                        </>
                      )}
                      {item.type === 'iron_pb' && (
                        <>
                          <span className="inline-flex items-center rounded-full bg-orange-500/30 text-orange-200 border border-orange-400/50 px-2 py-[2px] text-[10px] font-bold flex-shrink-0 mt-0.5">IRON PB</span>
                          <span className="text-slate-200 flex-1">
                            <strong className="text-orange-300">{item.username}</strong> {item.exercise}
                          </span>
                          <span className="text-slate-500 text-[10px] flex-shrink-0 mt-0.5">{formatActivityTime(item.timestamp)}</span>
                        </>
                      )}
                      {item.type === 'sesh_completed' && (
                        <>
                          <span className="inline-flex items-center rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/40 px-2 py-[2px] text-[10px] font-semibold flex-shrink-0 mt-0.5">SESH</span>
                          <span className="text-slate-200 flex-1">
                            <strong className="text-blue-300">{item.username}</strong> {item.exercise}
                          </span>
                          <span className="text-slate-500 text-[10px] flex-shrink-0 mt-0.5">{formatActivityTime(item.timestamp)}</span>
                        </>
                      )}
                      {item.type === 'weight_epic' && (
                        <>
                          <span className="inline-flex items-center rounded-full bg-violet-500/30 text-violet-200 border border-violet-400/50 px-2 py-[2px] text-[10px] font-bold flex-shrink-0 mt-0.5">EPIC</span>
                          <span className="text-slate-200 flex-1">
                            <strong className="text-violet-300">{item.username}</strong> {item.exercise}
                          </span>
                          <span className="text-slate-500 text-[10px] flex-shrink-0 mt-0.5">{formatActivityTime(item.timestamp)}</span>
                        </>
                      )}
                      {item.type === 'weight_pisscutter' && (
                        <>
                          <span className="inline-flex items-center rounded-full bg-amber-500/30 text-amber-200 border border-amber-400/50 px-2 py-[2px] text-[10px] font-bold flex-shrink-0 mt-0.5">PISSCUTTER</span>
                          <span className="text-slate-200 flex-1">
                            <strong className="text-amber-300">{item.username}</strong> {item.exercise}
                          </span>
                          <span className="text-slate-500 text-[10px] flex-shrink-0 mt-0.5">{formatActivityTime(item.timestamp)}</span>
                        </>
                      )}
                      {item.type === 'weight_ripper' && (
                        <>
                          <span className="inline-flex items-center rounded-full bg-green-500/20 text-green-200 border border-green-400/40 px-2 py-[2px] text-[10px] font-semibold flex-shrink-0 mt-0.5">RIPPER</span>
                          <span className="text-slate-200 flex-1">
                            <strong className="text-green-300">{item.username}</strong> {item.exercise}
                          </span>
                          <span className="text-slate-500 text-[10px] flex-shrink-0 mt-0.5">{formatActivityTime(item.timestamp)}</span>
                        </>
                      )}
                      {item.type === 'weight_solid' && (
                        <>
                          <span className="inline-flex items-center rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 px-2 py-[2px] text-[10px] font-semibold flex-shrink-0 mt-0.5">SOLID</span>
                          <span className="text-slate-200 flex-1">
                            <strong className="text-emerald-300">{item.username}</strong> {item.exercise}
                          </span>
                          <span className="text-slate-500 text-[10px] flex-shrink-0 mt-0.5">{formatActivityTime(item.timestamp)}</span>
                        </>
                      )}
                      {item.type === 'activity_logged' && (
                        <>
                          <span className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          </span>
                          <span className="text-slate-300 flex-1">
                            <strong className="text-emerald-300">{item.username}</strong>: {item.exercise}
                            {item.entry_date && (() => {
                              const parts = item.entry_date!.split('-');
                              return <span className="text-slate-500 text-xs ml-1">({parseInt(parts[2])}/{parseInt(parts[1])}/{parts[0].slice(2)})</span>;
                            })()}
                          </span>
                          <span className="text-slate-500 text-[10px] flex-shrink-0 mt-0.5">{formatActivityTime(item.timestamp)}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="text-center py-12 text-slate-400">
              Loading Warzone...
            </div>
          )}

          {/* Active Tab Content */}
          {!loading && activeTab === 'active' && (
            <div className="space-y-4">
              {/* Active Challenges Header */}
              <h2 className="text-lg font-bold text-red-400 mb-2">Active Challenges</h2>

              {/* Showdown Section - exclude cancelled only (completed stay until end date passes) */}
              {challenges.filter(c => c.scope === 'duel' && c.status !== 'cancelled').length > 0 && (
                <h3 className="text-base font-bold text-orange-400">Showdown</h3>
              )}

              {challenges.filter(c => c.scope === 'duel' && c.status !== 'cancelled').length === 0 && teamChallenges.filter(tc => tc.status !== 'cancelled').length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  No active challenges. Launch an Attack to get started!
                </div>
              ) : (
                challenges.filter(c => c.scope === 'duel' && c.status !== 'cancelled').map((challenge) => {
                  // Check if this is a Flaps challenge
                  const isFlapsChallenge = ['lone_flaps', 'flap_off', 'team_flaps'].includes(challenge.template_key || '');
                  
                  const scopeConfig: Record<string, { label: string; color: string }> = {
                    duel: { label: 'Showdown', color: 'bg-orange-600/30 text-orange-300 border-orange-500/50' },
                    team: { label: 'Team Blitzkrieg', color: 'bg-purple-600/30 text-purple-300 border-purple-500/50' },
                    solo: { label: 'Lone Wolf', color: 'bg-sky-600/30 text-sky-300 border-sky-500/50' },
                  };
                  
                  // Override with Flaps label and color if it's a Flaps challenge
                  const scopeInfo = isFlapsChallenge 
                    ? { label: 'Flaps', color: 'bg-rose-600/30 text-rose-300 border-rose-500/50' }
                    : (scopeConfig[challenge.scope] || scopeConfig.duel);

                  const statusConfig: Record<string, { color: string }> = {
                    active: { color: 'bg-green-600/30 text-green-300 border-green-500/50' },
                    pending: { color: 'bg-yellow-600/30 text-yellow-300 border-yellow-500/50' },
                    completed: { color: 'bg-blue-600/30 text-blue-300 border-blue-500/50' },
                    cancelled: { color: 'bg-slate-600/30 text-slate-300 border-slate-500/50' },
                  };
                  const statusInfo = statusConfig[challenge.status] || statusConfig.pending;

                  const userParticipant = challenge.current_user_participant;
                  const canRespond = userParticipant?.state === 'invited' && challenge.status === 'pending';
                  const creator = challenge.participants.find(p => p.role === 'creator');
                  const opponent = challenge.participants.find(p => p.role === 'invited');

                  return (
                    <div
                      key={challenge.id}
                      className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3"
                      data-testid={`card-challenge-${challenge.id}`}
                    >
                      {/* Title and Pills */}
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-lg text-slate-100">{challenge.title}</h3>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${scopeInfo.color}`}>
                          {scopeInfo.label}
                        </span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusInfo.color}`}>
                          {challenge.status.toUpperCase()}
                        </span>
                      </div>

                      {/* Dates */}
                      <p className="text-sm text-slate-400">
                        <span className="text-slate-500">Period:</span>{' '}
                        {formatDate(challenge.starts_on)} → {formatDate(challenge.ends_on)}
                      </p>

                      {/* Combatants */}
                      <p className="text-sm text-slate-400">
                        <span className="text-slate-500">Combatants:</span>{' '}
                        <span className="text-slate-200">
                          {creator?.username || 'Unknown'} vs {opponent?.username || 'Unknown'}
                        </span>
                      </p>

                      {/* Stakes */}
                      {challenge.stake_text && (
                        <p className="text-sm text-slate-400">
                          <span className="text-slate-500">Stakes:</span>{' '}
                          <span className="text-yellow-400">{challenge.stake_text}</span>
                        </p>
                      )}

                      {/* Progress Bar for rep-based Showdown challenges */}
                      {challenge.is_rep_challenge && challenge.status === 'active' && challenge.total_target && challenge.total_target > 0 && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-slate-400 mb-2">
                            <span>Progress</span>
                            <span>Goal: {challenge.total_target}</span>
                          </div>
                          {challenge.rep_leaderboard && challenge.rep_leaderboard.map((entry: any) => {
                            const percent = Math.min(100, Math.round((entry.total / (challenge.total_target || 1)) * 100));
                            const userColor = getUserColor(entry.username);
                            return (
                              <div key={entry.user_id} className="mb-2">
                                <div className="flex justify-between text-xs mb-1">
                                  <span style={{ color: userColor }} className="font-medium">{entry.username}</span>
                                  <span className="text-slate-500">
                                    {entry.total} logged
                                    {percent >= 100 && <span className="text-emerald-400 ml-1">✓</span>}
                                  </span>
                                </div>
                                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full transition-all duration-300"
                                    style={{ width: `${percent}%`, backgroundColor: userColor }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Leader snapshot for active challenges */}
                      {challenge.status === 'active' && challenge.leader_snapshot?.participants && (
                        <div className="bg-slate-800/50 rounded-lg p-3 text-sm">
                          <p className="text-slate-400 mb-2">Current standings:</p>
                          <div className="space-y-1">
                            {challenge.leader_snapshot.participants.map((p: any) => (
                              <div key={p.user_id} className="flex justify-between">
                                <span className="text-slate-300">{p.username}</span>
                                <span className={p.delta_kg !== null && p.delta_kg < 0 ? 'text-green-400' : 'text-slate-400'}>
                                  {p.delta_kg !== null ? `${p.delta_kg > 0 ? '+' : ''}${p.delta_kg}kg` : 'No data'}
                                  {p.status_label && p.status_label !== 'No data' && (
                                    <span className="ml-2 text-xs text-slate-500">({p.status_label})</span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Status box for completed/failed challenges */}
                      {(challenge.status === 'completed' || challenge.status === 'failed') && (() => {
                        const isLoneWolf = challenge.scope === 'solo' || challenge.scope === 'individual' || challenge.template_key === 'lone_flaps';
                        const isFailed = challenge.status === 'failed';
                        const winnerUsername = challenge.winner_user_id
                          ? challenge.participants.find(p => p.user_id === challenge.winner_user_id)?.username || 'Unknown'
                          : null;

                        let label = '';
                        if (isFailed) {
                          label = 'Mission Failed';
                        } else if (isLoneWolf || !winnerUsername) {
                          label = 'Mission Complete';
                        } else {
                          label = `Winner: ${winnerUsername}`;
                        }

                        return (
                          <div className={`rounded-lg p-3 ${isFailed ? 'bg-red-900/30 border border-red-700/50' : 'bg-green-900/30 border border-green-700/50'}`}>
                            <p className={`font-medium ${isFailed ? 'text-red-300' : 'text-green-300'}`}>
                              {label}
                            </p>
                          </div>
                        );
                      })()}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 pt-2">
                        <button
                          onClick={() => handleView(challenge.id)}
                          className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors"
                          data-testid={`button-view-${challenge.id}`}
                        >
                          View Details
                        </button>

                        {isAdmin && (
                          <button
                            onClick={() => handleOpenEditModal(challenge.id)}
                            className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors font-medium"
                            data-testid={`button-edit-${challenge.id}`}
                          >
                            Edit
                          </button>
                        )}

                        {challenge.current_user_participant && 
                         (challenge.current_user_participant.state === 'accepted' || challenge.current_user_participant.state === 'latecomer') && (
                          <button
                            onClick={() => {
                              const isFlaps = ['lone_flaps', 'flap_off', 'team_flaps'].includes(challenge.template_key || '');
                              router.push(isFlaps ? '/tracker?tab=flaps' : '/tracker');
                            }}
                            className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-medium"
                            data-testid={`button-log-apollo-${challenge.id}`}
                          >
                            Log in Apollo
                          </button>
                        )}

                        {canRespond && (
                          <>
                            <button
                              onClick={() => handleRespond(challenge.id, 'accept')}
                              className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-medium"
                              data-testid={`button-accept-${challenge.id}`}
                            >
                              Going to War
                            </button>
                            <button
                              onClick={() => handleRespond(challenge.id, 'decline')}
                              className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                              data-testid={`button-decline-${challenge.id}`}
                            >
                              Surrender
                            </button>
                          </>
                        )}

                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Team Blitzkrieg Section - exclude cancelled only (completed stay until end date passes) */}
          {!loading && activeTab === 'active' && teamChallenges.filter(tc => tc.scope === 'team' && tc.status !== 'cancelled').length > 0 && (
            <div className="mt-6 space-y-3">
              <h2 className="text-lg font-bold text-purple-400">Team Blitzkrieg</h2>
              {teamChallenges.filter(tc => tc.scope === 'team' && tc.status !== 'cancelled').map((tc) => (
                <div
                  key={tc.id}
                  className="bg-slate-900 border border-purple-700/30 rounded-xl p-4 space-y-2"
                  data-testid={`card-team-challenge-${tc.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-100">{tc.title}</h3>
                      {tc.template_key === 'team_flaps' && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-rose-600/30 text-rose-300 border-rose-500/50">
                          Flaps
                        </span>
                      )}
                      {tc.template_key && !['team_flaps'].includes(tc.template_key) && !tc.is_rep_challenge && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-orange-600/30 text-orange-300 border-orange-500/50">
                          Shred Off
                        </span>
                      )}
                      {tc.status === 'completed' && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-blue-600/30 text-blue-300 border-blue-500/50">
                          COMPLETED
                        </span>
                      )}
                    </div>
                    <span className="text-xs bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded-full">
                      {tc.participant_count} joined
                    </span>
                  </div>
                  <p className="text-sm text-slate-400">
                    {formatDate(tc.starts_on)} → {formatDate(tc.ends_on)}
                  </p>
                  {/* Shred Off snapshot - target and participants */}
                  {!tc.is_rep_challenge && tc.template_key && !['team_flaps'].includes(tc.template_key) && (
                    <div className="mt-1 space-y-1.5">
                      {tc.target_weight_kg && (
                        <p className="text-xs text-orange-300" data-testid={`shredoff-target-${tc.id}`}>
                          Target: Lose {tc.target_weight_kg}kg
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {tc.participants
                          .filter((p: any) => p.state === 'accepted' || p.state === 'latecomer')
                          .map((p: any) => (
                            <span
                              key={p.user_id}
                              className="text-xs px-1.5 py-0.5 rounded bg-slate-800 font-medium"
                              style={{ color: getUserColor(p.username) }}
                              data-testid={`participant-chip-${p.user_id}`}
                            >
                              {p.username}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                  {/* Shred Off Weight Progress */}
                  {tc.shred_off_progress && tc.shred_off_progress.participants.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {tc.shred_off_progress.participants.map((p) => {
                        const userColor = getUserColor(p.username);
                        const lost = p.weight_lost;
                        const percent = p.progress_percent;
                        const targetLoss = tc.shred_off_progress?.target_loss || 0;
                        const noData = !p.has_data;
                        const lostDisplay = lost !== null
                          ? (lost > 0 ? `-${lost}kg` : lost < 0 ? `+${Math.abs(lost)}kg` : '0kg')
                          : 'No data';
                        return (
                          <div key={p.user_id} className="flex items-center gap-2">
                            <span
                              className="text-xs w-16 truncate font-medium"
                              style={{ color: userColor }}
                            >
                              {p.username}
                            </span>
                            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full transition-all duration-300"
                                style={{ width: `${noData ? 0 : percent}%`, backgroundColor: userColor }}
                              />
                            </div>
                            <span className={`text-xs w-28 text-right ${noData ? 'text-slate-500 italic' : lost !== null && lost > 0 ? 'text-green-400' : lost !== null && lost < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                              {lostDisplay}
                              {!noData && targetLoss > 0 && <span className="text-slate-500"> / {targetLoss}kg</span>}
                              {percent >= 100 && <span className="text-emerald-400 ml-0.5">&#10003;</span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Multi-Task Progress Bars with Mini Leaderboard */}
                  {tc.task_breakdown && tc.task_breakdown.length > 0 && (
                    <div className="mt-2 space-y-3">
                      {tc.task_breakdown.map((task, idx) => {
                        const colors = ['text-purple-400', 'text-emerald-400', 'text-amber-400', 'text-sky-400'];
                        const textColor = colors[idx % colors.length];
                        const unitLabel = (task.unit_type === 'km' || task.unit_type === 'distance') ? 'km' : 'reps';
                        const isPerDay = task.target_type === 'per_day';
                        
                        // For per_day: show today's progress. For total: show overall progress
                        const displayProgress = isPerDay ? (task.today_progress || 0) : task.progress;
                        const percent = task.target > 0 ? Math.min(100, Math.round((displayProgress / task.target) * 100)) : 0;
                        
                        // Overall completion for per_day challenges
                        const overallPercent = isPerDay && task.days_elapsed && task.days_elapsed > 0
                          ? Math.round(((task.days_met || 0) / task.days_elapsed) * 100)
                          : (task.target > 0 ? Math.min(100, Math.round((task.progress / task.target) * 100)) : 0);
                        
                        return (
                          <div key={task.task_id} className="space-y-1">
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className={textColor}>{task.name}</span>
                              {/* For per_day with participants, just show the daily goal - individual progress shown on bars below */}
                              {isPerDay && task.participants && task.participants.length > 0 ? (
                                <span className="text-amber-400">
                                  Daily Goal: {task.target}{unitLabel === 'km' ? 'km' : ''}
                                </span>
                              ) : isPerDay ? (
                                <span className="text-amber-400">
                                  Today: {task.today_progress || 0}{unitLabel === 'km' ? 'km' : ''} 
                                  <span className="text-slate-500">(goal {task.target})</span>
                                  {(task.today_progress || 0) >= task.target * 0.9 && <span className="text-emerald-400 ml-1">✓</span>}
                                  <span className="text-slate-400 ml-1">• {task.days_met || 0}/{task.days_elapsed || 0} days hit</span>
                                </span>
                              ) : (
                                <span className="text-slate-400">
                                  Total: {task.progress}/{task.target}{unitLabel === 'km' ? 'km' : ''} ({overallPercent}%)
                                </span>
                              )}
                            </div>
                            {/* Mini leaderboard - individual bars per participant with user colors */}
                            {task.participants && task.participants.length > 0 ? (
                              <div className="space-y-1">
                                {task.participants.map((p) => {
                                  // For per_day: show today's value. For total: show overall value
                                  const pValue = isPerDay ? (p.today_value || 0) : p.value;
                                  const pPercent = task.target > 0 ? Math.min(100, Math.round((pValue / task.target) * 100)) : 0;
                                  const metGoal = pValue >= task.target;
                                  const userColor = getUserColor(p.username);
                                  return (
                                    <div key={p.user_id} className="flex items-center gap-2">
                                      <span 
                                        className="text-xs w-16 truncate font-medium"
                                        style={{ color: userColor }}
                                      >
                                        {p.username}
                                      </span>
                                      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                          className="h-full transition-all duration-300"
                                          style={{ width: `${pPercent}%`, backgroundColor: userColor }}
                                        />
                                      </div>
                                      <span className="text-xs text-slate-500 w-20 text-right">
                                        {pValue}/{task.target} {unitLabel === 'km' ? 'km' : ''}{metGoal && <span className="text-emerald-400 ml-0.5">✓</span>}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500 italic">No entries yet</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Fallback for old format without task_breakdown */}
                  {(!tc.task_breakdown || tc.task_breakdown.length === 0) && tc.total_target > 0 && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>Team Progress</span>
                        <span>
                          Goal: {tc.total_target}
                          {tc.total_progress >= tc.total_target * 0.9 && <span className="text-emerald-400 ml-1">✓</span>}
                          <span className="text-slate-500 ml-2">({tc.total_progress} logged)</span>
                        </span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 transition-all duration-300"
                          style={{ width: `${Math.min(100, (tc.total_progress / tc.total_target) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {!tc.user_has_joined && (
                      <button
                        onClick={() => handleJoinChallenge(tc.id)}
                        className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm transition-colors"
                        data-testid={`button-join-${tc.id}`}
                      >
                        Join Challenge
                      </button>
                    )}
                    <button
                      onClick={() => handleView(tc.id)}
                      className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
                      data-testid={`button-view-${tc.id}`}
                    >
                      View Details
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleOpenEditModal(tc.id)}
                        className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm transition-colors font-medium"
                        data-testid={`button-edit-${tc.id}`}
                      >
                        Edit
                      </button>
                    )}
                    {tc.user_has_joined && (tc.is_rep_challenge || tc.template_key === 'team_flaps') && (
                      <button
                        onClick={() => {
                          const isFlaps = tc.template_key === 'team_flaps';
                          router.push(isFlaps ? '/tracker?tab=flaps' : '/tracker');
                        }}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm transition-colors font-medium"
                        data-testid={`button-log-apollo-${tc.id}`}
                      >
                        Log in Apollo
                      </button>
                    )}
                    {tc.user_has_joined && tc.template_key && !['team_flaps'].includes(tc.template_key) && !tc.is_rep_challenge && (
                      <button
                        onClick={() => router.push('/dashboard')}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm transition-colors font-medium"
                        data-testid={`button-log-weight-${tc.id}`}
                      >
                        Log Weight
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Lone Wolf Section - exclude cancelled only (completed stay until end date passes) */}
          {!loading && activeTab === 'active' && teamChallenges.filter(tc => tc.scope === 'solo' && tc.status !== 'cancelled').length > 0 && (
            <div className="mt-6 space-y-3">
              <h2 className="text-lg font-bold text-sky-400">Lone Wolf</h2>
              {teamChallenges.filter(tc => tc.scope === 'solo' && tc.status !== 'cancelled').map((tc) => {
                const creatorUsername = tc.creator_username || 'Unknown';
                return (
                  <div
                    key={tc.id}
                    className="bg-slate-900 border border-sky-700/30 rounded-xl p-4 space-y-2"
                    data-testid={`card-lone-wolf-${tc.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-100">{tc.title}</h3>
                        {tc.template_key === 'lone_flaps' && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-rose-600/30 text-rose-300 border-rose-500/50">
                            Flaps
                          </span>
                        )}
                        {tc.status === 'completed' && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-blue-600/30 text-blue-300 border-blue-500/50">
                            COMPLETED
                          </span>
                        )}
                      </div>
                      <span className="text-xs bg-sky-600/30 text-sky-300 px-2 py-0.5 rounded-full">
                        by {creatorUsername}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400">
                      {formatDate(tc.starts_on)} → {formatDate(tc.ends_on)}
                    </p>
                    {/* Multi-Task Progress Bars - same format as Team Blitzkrieg */}
                    {tc.task_breakdown && tc.task_breakdown.length > 0 && (
                      <div className="mt-2 space-y-3">
                        {tc.task_breakdown.map((task, idx) => {
                          const colors = ['text-sky-400', 'text-emerald-400', 'text-amber-400', 'text-purple-400'];
                          const barColors = ['bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500'];
                          const textColor = colors[idx % colors.length];
                          const barColor = barColors[idx % barColors.length];
                          const unitLabel = (task.unit_type === 'km' || task.unit_type === 'distance') ? 'km' : 'reps';
                          const isPerDay = task.target_type === 'per_day';
                          
                          // For per_day: show today's progress. For total: show overall progress
                          const displayProgress = isPerDay ? (task.today_progress || 0) : task.progress;
                          const percent = task.target > 0 ? Math.min(100, Math.round((displayProgress / task.target) * 100)) : 0;
                          const metGoal = displayProgress >= task.target;
                          
                          // Overall completion for per_day challenges
                          const overallPercent = isPerDay && task.days_elapsed && task.days_elapsed > 0
                            ? Math.round(((task.days_met || 0) / task.days_elapsed) * 100)
                            : (task.target > 0 ? Math.min(100, Math.round((task.progress / task.target) * 100)) : 0);
                          
                          return (
                            <div key={task.task_id} className="space-y-1">
                              <div className="flex justify-between text-xs mb-0.5">
                                <span className={textColor}>{task.name}</span>
                                {isPerDay ? (
                                  <span className="text-amber-400">
                                    Today: {task.today_progress || 0}{unitLabel === 'km' ? 'km' : ''} 
                                    <span className="text-slate-500">(goal {task.target})</span>
                                    {(task.today_progress || 0) >= task.target * 0.9 && <span className="text-emerald-400 ml-1">✓</span>}
                                    <span className="text-slate-400 ml-1">• {task.days_met || 0}/{task.days_elapsed || 0} days hit</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400">
                                    Total: {task.progress}/{task.target}{unitLabel === 'km' ? 'km' : ''} ({overallPercent}%)
                                  </span>
                                )}
                              </div>
                              {/* Solo progress bar */}
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-300 ${barColor}`}
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                                <span className="text-xs text-slate-400 w-20 text-right">
                                  {displayProgress}/{task.target} {unitLabel === 'km' ? 'km' : ''}{metGoal && <span className="text-emerald-400 ml-0.5">✓</span>}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Flaps Progress Overview */}
                    {tc.flaps_progress && (
                      <div className="mt-2 space-y-2">
                        {tc.flaps_progress.target_duration > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-rose-400">Duration</span>
                              <span className="text-slate-400">
                                {tc.flaps_progress.total_duration} / {tc.flaps_progress.target_duration} min
                                {tc.flaps_progress.total_duration >= tc.flaps_progress.target_duration && <span className="text-emerald-400 ml-1">&#10003;</span>}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-rose-500 transition-all duration-300"
                                  style={{ width: `${Math.min(100, tc.flaps_progress.target_duration > 0 ? (tc.flaps_progress.total_duration / tc.flaps_progress.target_duration) * 100 : 0)}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-400 w-12 text-right">
                                {tc.flaps_progress.target_duration > 0 ? Math.min(100, Math.round((tc.flaps_progress.total_duration / tc.flaps_progress.target_duration) * 100)) : 0}%
                              </span>
                            </div>
                          </div>
                        )}
                        {tc.flaps_progress.target_calories > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-amber-400">Calories</span>
                              <span className="text-slate-400">
                                {tc.flaps_progress.total_calories} / {tc.flaps_progress.target_calories} cal
                                {tc.flaps_progress.total_calories >= tc.flaps_progress.target_calories && <span className="text-emerald-400 ml-1">&#10003;</span>}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-amber-500 transition-all duration-300"
                                  style={{ width: `${Math.min(100, tc.flaps_progress.target_calories > 0 ? (tc.flaps_progress.total_calories / tc.flaps_progress.target_calories) * 100 : 0)}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-400 w-12 text-right">
                                {tc.flaps_progress.target_calories > 0 ? Math.min(100, Math.round((tc.flaps_progress.total_calories / tc.flaps_progress.target_calories) * 100)) : 0}%
                              </span>
                            </div>
                          </div>
                        )}
                        {tc.flaps_progress.target_avg_heart_rate > 0 && (
                          <div className="flex justify-between text-xs text-slate-400">
                            <span className="text-purple-400">Avg HR Target</span>
                            <span>
                              {tc.flaps_progress.avg_heart_rate > 0 ? tc.flaps_progress.avg_heart_rate : '--'} / {tc.flaps_progress.target_avg_heart_rate} bpm
                              {tc.flaps_progress.avg_heart_rate >= tc.flaps_progress.target_avg_heart_rate && <span className="text-emerald-400 ml-1">&#10003;</span>}
                            </span>
                          </div>
                        )}
                        {tc.flaps_progress.target_duration === 0 && tc.flaps_progress.target_calories === 0 && tc.flaps_progress.target_avg_heart_rate === 0 && tc.flaps_progress.session_count > 0 && (
                          <div className="flex justify-between text-xs text-slate-400">
                            <span className="text-rose-400">Sessions logged</span>
                            <span>{tc.flaps_progress.session_count} ({tc.flaps_progress.total_duration} min total)</span>
                          </div>
                        )}
                        {tc.flaps_progress.session_count === 0 && (
                          <p className="text-xs text-slate-500 italic">No sessions logged yet</p>
                        )}
                      </div>
                    )}
                    {/* Fallback for old format without task_breakdown */}
                    {(!tc.task_breakdown || tc.task_breakdown.length === 0) && !tc.flaps_progress && tc.total_target > 0 && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                          <span>Progress</span>
                          <span>
                            Goal: {tc.total_target}
                            {tc.total_progress >= tc.total_target * 0.9 && <span className="text-emerald-400 ml-1">✓</span>}
                            <span className="text-slate-500 ml-2">({tc.total_progress} logged)</span>
                          </span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-sky-500 transition-all duration-300"
                            style={{ width: `${Math.min(100, (tc.total_progress / tc.total_target) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        onClick={() => handleView(tc.id)}
                        className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
                        data-testid={`button-view-${tc.id}`}
                      >
                        View Details
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleOpenEditModal(tc.id)}
                          className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm transition-colors font-medium"
                          data-testid={`button-edit-${tc.id}`}
                        >
                          Edit
                        </button>
                      )}
                      {tc.user_has_joined && (
                        <button
                          onClick={() => {
                            const isFlaps = tc.template_key === 'lone_flaps';
                            router.push(isFlaps ? '/tracker?tab=flaps' : '/tracker');
                          }}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm transition-colors font-medium"
                          data-testid={`button-log-apollo-${tc.id}`}
                        >
                          Log in Apollo
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Team Leaderboard Section (formerly Wallboard tab) */}
          {!loading && activeTab === 'active' && wallboardStats.length > 0 && (
            <div className="mt-8 border-t border-slate-700 pt-6">
              <button
                onClick={() => setShowLeaderboard(!showLeaderboard)}
                className="flex items-center gap-2 text-lg font-bold text-amber-400 hover:text-amber-300 mb-4"
                data-testid="toggle-leaderboard"
              >
                <span>Team Leaderboard</span>
                <span className="text-sm">{showLeaderboard ? '▼' : '▶'}</span>
              </button>
              
              {showLeaderboard && (
                <div className="space-y-4">
                  {wallboardStats.map((user, index) => {
                    const winRate = user.wins + user.losses > 0
                      ? Math.round((user.wins / (user.wins + user.losses)) * 100)
                      : 0;
                    const rankColor = index === 0 ? 'text-amber-400' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-orange-600' : 'text-slate-500';
                    const medalEmoji = index === 0 ? ' 🥇' : index === 1 ? ' 🥈' : index === 2 ? ' 🥉' : '';
                    const rankLabel = `#${index + 1}${medalEmoji}`;
                    
                    return (
                      <div
                        key={user.user_id}
                        className="bg-slate-900/80 border border-slate-700 rounded-xl overflow-hidden"
                        data-testid={`card-wallboard-${user.user_id}`}
                      >
                        {/* Header row with name, W-L, and History button */}
                        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-lg ${rankColor}`}>{rankLabel}</span>
                            <span className="font-bold text-slate-100 text-lg">{user.username}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold text-sm ${winRate >= 50 ? 'text-green-400' : winRate > 0 ? 'text-yellow-400' : 'text-slate-400'}`}>
                                {winRate}%
                              </span>
                              <span className="text-slate-400 text-sm">
                                ({user.wins}W - {user.losses}L)
                              </span>
                            </div>
                            {user.share_workout_history && (
                              <Link
                                href={`/stats/${user.username}`}
                                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg transition-colors"
                                data-testid={`link-workout-log-${user.user_id}`}
                              >
                                Full History
                              </Link>
                            )}
                          </div>
                        </div>
                        
                        {/* Stats grid - restructured with 3 sections */}
                        <div className="p-2 space-y-2">
                          {/* Showdowns section (5 columns) */}
                          <div className="bg-slate-800/50 rounded-lg p-2">
                            <div className="text-orange-400 text-[10px] font-semibold mb-1">Showdowns</div>
                            <div className="grid grid-cols-5 gap-0.5">
                              <div className="text-center">
                                <div className="text-amber-400 font-bold text-sm">{user.showdowns_launched || 0}</div>
                                <div className="text-slate-500 text-[9px]">Lnch</div>
                              </div>
                              <div className="text-center">
                                <div className="text-slate-300 font-bold text-sm">{user.showdowns_accepted || 0}</div>
                                <div className="text-slate-500 text-[9px]">Acc</div>
                              </div>
                              <div className="text-center">
                                <div className="text-red-400 font-bold text-sm">{user.showdowns_lost || 0}</div>
                                <div className="text-slate-500 text-[9px]">Lost</div>
                              </div>
                              <div className="text-center">
                                <div className="text-green-400 font-bold text-sm">{user.showdowns_victories || 0}</div>
                                <div className="text-slate-500 text-[9px]">Wins</div>
                              </div>
                              <div className="text-center">
                                <div className="text-rose-400 font-bold text-sm">{user.showdowns_surrendered || 0}</div>
                                <div className="text-slate-500 text-[9px]">Surr</div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Blitzkriegs section (5 columns) */}
                          <div className="bg-slate-800/50 rounded-lg p-2">
                            <div className="text-purple-400 text-[10px] font-semibold mb-1">Blitzkriegs</div>
                            <div className="grid grid-cols-5 gap-0.5">
                              <div className="text-center">
                                <div className="text-amber-400 font-bold text-sm">{user.blitzkriegs_launched || 0}</div>
                                <div className="text-slate-500 text-[9px]">Lnch</div>
                              </div>
                              <div className="text-center">
                                <div className="text-slate-300 font-bold text-sm">{user.blitzkriegs_joined || 0}</div>
                                <div className="text-slate-500 text-[9px]">Join</div>
                              </div>
                              <div className="text-center">
                                <div className="text-red-400 font-bold text-sm">{user.blitzkriegs_failed || 0}</div>
                                <div className="text-slate-500 text-[9px]">Fail</div>
                              </div>
                              <div className="text-center">
                                <div className="text-emerald-400 font-bold text-sm">{user.blitzkriegs_completed || 0}</div>
                                <div className="text-slate-500 text-[9px]">Done</div>
                              </div>
                              <div className="text-center">
                                <div className="text-rose-400 font-bold text-sm">{user.blitzkriegs_surrendered || 0}</div>
                                <div className="text-slate-500 text-[9px]">Surr</div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Lone Wolf section (3 columns) */}
                          <div className="bg-slate-800/50 rounded-lg p-2">
                            <div className="text-sky-400 text-[10px] font-semibold mb-1">Lone Wolf</div>
                            <div className="grid grid-cols-3 gap-0.5">
                              <div className="text-center">
                                <div className="text-amber-400 font-bold text-sm">{user.lonewolf_launched || 0}</div>
                                <div className="text-slate-500 text-[9px]">Lnch</div>
                              </div>
                              <div className="text-center">
                                <div className="text-red-400 font-bold text-sm">{user.lonewolf_failed || 0}</div>
                                <div className="text-slate-500 text-[9px]">Fail</div>
                              </div>
                              <div className="text-center">
                                <div className="text-emerald-400 font-bold text-sm">{user.lonewolf_completed || 0}</div>
                                <div className="text-slate-500 text-[9px]">Done</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Challenge History Section */}
          {!loading && activeTab === 'active' && (
            <div className="mt-8 border-t border-slate-700 pt-6">
              <button
                onClick={() => setShowChallengeHistory(!showChallengeHistory)}
                className="flex items-center gap-2 text-lg font-bold text-rose-400 hover:text-rose-300 mb-4"
                data-testid="toggle-challenge-history"
              >
                <span>Challenge History</span>
                <span className="text-sm">{showChallengeHistory ? '▼' : '▶'}</span>
                {challengeHistory.length > 0 && (
                  <span className="text-xs text-slate-500 ml-2">({challengeHistory.length} challenges)</span>
                )}
              </button>
              
              {showChallengeHistory && (
                <div className="space-y-3">
                  {challengeHistory.length === 0 ? (
                    <div className="text-slate-500 text-center py-4">No completed challenges yet</div>
                  ) : (
                    challengeHistory.map((challenge) => {
                      const getOutcomeColor = (challenge: HistoryChallenge) => {
                        // For Team Blitzkrieg, use different colors
                        if (challenge.scope === 'team' && !challenge.template_key) {
                          const resultJson = challenge.result_json as { team_completed?: boolean; participant_results?: any[] } | null;
                          const anyPassed = resultJson?.participant_results?.some((p: any) => p.completed_all);
                          if (challenge.status === 'completed' || challenge.status === 'archived') {
                            if (anyPassed || resultJson?.team_completed) {
                              return 'text-green-400 bg-green-900/30 border-green-600/50'; // Completed (someone passed)
                            }
                            return 'text-red-400 bg-red-900/30 border-red-600/50'; // Failed (nobody passed)
                          }
                        }
                        switch (challenge.outcome) {
                          case 'winner': return 'text-green-400 bg-green-900/30 border-green-600/50';
                          case 'cancelled': return 'text-slate-400 bg-slate-800/50 border-slate-600/50';
                          case 'surrendered': return 'text-red-400 bg-red-900/30 border-red-600/50';
                          case 'failed': return 'text-red-400 bg-red-900/30 border-red-600/50';
                          case 'completed': return 'text-blue-400 bg-blue-900/30 border-blue-600/50';
                          case 'active': return 'text-amber-400 bg-amber-900/30 border-amber-600/50';
                          case 'pending': return 'text-purple-400 bg-purple-900/30 border-purple-600/50';
                          default: return 'text-slate-400 bg-slate-800/50 border-slate-600/50';
                        }
                      };
                      
                      const getOutcomeLabel = (challenge: HistoryChallenge) => {
                        if (challenge.outcome === 'active') return 'In Progress';
                        if (challenge.outcome === 'pending') return 'Pending';
                        if (challenge.outcome === 'surrendered') {
                          const surrendererName = challenge.surrendered_by_username || 
                            challenge.participants.find(p => p.state === 'surrendered')?.username || 
                            'Unknown';
                          // For Team Blitzkrieg, no winner on surrender
                          if (challenge.scope === 'team') {
                            return `${surrendererName} Surrendered`;
                          }
                          if (challenge.winner_username) {
                            return `${surrendererName} Surrendered. Winner: ${challenge.winner_username}`;
                          }
                          return `${surrendererName} Surrendered`;
                        }
                        // For Team Blitzkrieg - show Completed or Failed, not Winner
                        if (challenge.scope === 'team' && !challenge.template_key) {
                          const resultJson = challenge.result_json as { team_completed?: boolean; participant_results?: any[] } | null;
                          if (resultJson?.team_completed) {
                            return 'Completed';
                          } else if (challenge.status === 'completed' || challenge.status === 'archived') {
                            // Check if anyone passed
                            const anyPassed = resultJson?.participant_results?.some((p: any) => p.completed_all);
                            return anyPassed ? 'Completed' : 'Failed';
                          }
                          return 'In Progress';
                        }
                        if (challenge.outcome === 'winner' && challenge.winner_username) {
                          if (challenge.scope === 'solo' || challenge.scope === 'individual' || challenge.template_key === 'lone_flaps') {
                            return 'Completed';
                          }
                          return `Winner: ${challenge.winner_username}`;
                        }
                        if (challenge.outcome === 'cancelled') return 'Cancelled';
                        if (challenge.outcome === 'failed') return 'Failed';
                        if (challenge.outcome === 'completed') return 'Completed';
                        return 'Expired';
                      };
                      
                      const getScopeLabel = (scope: string, template_key: string | null) => {
                        // Check for Flaps challenges first
                        if (template_key === 'lone_flaps' || template_key === 'flap_off' || template_key === 'team_flaps') {
                          return 'Flaps';
                        }
                        if (template_key) return 'Shred Off';
                        switch (scope) {
                          case 'duel': return 'Showdown';
                          case 'team': return 'Team Blitzkrieg';
                          case 'solo': return 'Lone Wolf';
                          default: return scope;
                        }
                      };
                      
                      const formatDate = (dateStr: string) => {
                        const [year, month, day] = dateStr.split('-');
                        return `${day}/${month}/${year}`;
                      };
                      
                      const participantNames = challenge.participants
                        .filter(p => p.state !== 'declined' && p.state !== 'left')
                        .map(p => p.username)
                        .join(' vs ');

                      return (
                        <div
                          key={challenge.id}
                          className="bg-slate-900/80 border border-slate-700 rounded-xl p-4"
                          data-testid={`card-history-${challenge.id}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-100">{challenge.title}</span>
                                <span className="px-2 py-0.5 text-xs rounded-full bg-slate-700 text-slate-300">
                                  {getScopeLabel(challenge.scope, challenge.template_key)}
                                </span>
                              </div>
                              <div className="text-sm text-slate-400 mt-1">
                                {challenge.created_by_username && (
                                  <span className="text-amber-400">Launched by {challenge.created_by_username}</span>
                                )}
                                {challenge.created_at && (
                                  <span className="text-slate-500"> on {formatDate(challenge.created_at.split('T')[0])}</span>
                                )}
                              </div>
                              <div className="text-sm text-slate-500 mt-1">
                                {formatDate(challenge.starts_on)} - {formatDate(challenge.ends_on)}
                              </div>
                              {challenge.activity_summary && (
                                <div className="text-sm text-slate-400 mt-1">
                                  <span className="text-slate-500">Overview: </span>
                                  <span className="text-emerald-400">{challenge.activity_summary}</span>
                                </div>
                              )}
                              {challenge.description && (
                                <div className="text-sm text-slate-400 mt-1">
                                  <span className="text-slate-500">Comments: </span>
                                  {challenge.description}
                                </div>
                              )}
                              {participantNames && (
                                <div className="text-sm text-slate-500 mt-1">
                                  {participantNames}
                                </div>
                              )}
                              {challenge.stake_text && (
                                <div className="text-sm text-amber-400 mt-1">
                                  Stakes: {challenge.stake_text}
                                </div>
                              )}
                            </div>
                            <div className={`px-3 py-1.5 text-sm font-semibold rounded-lg border ${getOutcomeColor(challenge)}`}>
                              {getOutcomeLabel(challenge)}
                            </div>
                          </div>
                          
                          {/* More Info Button */}
                          <button
                            onClick={() => {
                              setExpandedHistoryIds(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(challenge.id)) {
                                  newSet.delete(challenge.id);
                                } else {
                                  newSet.add(challenge.id);
                                }
                                return newSet;
                              });
                            }}
                            className="mt-2 text-sm text-slate-400 hover:text-slate-200 flex items-center gap-1"
                            data-testid={`button-more-info-${challenge.id}`}
                          >
                            <span>{expandedHistoryIds.has(challenge.id) ? '▼' : '▶'}</span>
                            <span>{expandedHistoryIds.has(challenge.id) ? 'Hide Details' : 'More Info'}</span>
                          </button>
                          
                          {/* Expanded Details */}
                          {expandedHistoryIds.has(challenge.id) && (
                            <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                              {/* Participants List with Results */}
                              <div className="text-sm">
                                <div className="font-medium text-slate-300 mb-2">Participants:</div>
                                <div className="space-y-1">
                                  {challenge.participants
                                    .filter(p => p.state !== 'declined' && p.state !== 'left')
                                    .map((participant) => {
                                      const resultJson = challenge.result_json as { participant_results?: any[]; leaderboard?: any[] } | null;
                                      const participantResult = resultJson?.participant_results?.find((r: any) => r.user_id === participant.user_id);
                                      const leaderboardEntry = resultJson?.leaderboard?.find((e: any) => e.user_id === participant.user_id);
                                      
                                      return (
                                        <div 
                                          key={participant.user_id}
                                          className="flex items-center justify-between py-1 px-2 rounded bg-slate-800/50"
                                        >
                                          <span 
                                            className="font-medium"
                                            style={{ color: getUserColor(participant.username) }}
                                          >
                                            {participant.username}
                                          </span>
                                          <div className="flex items-center gap-2">
                                            {/* Show total from leaderboard for non-Team Blitzkrieg challenges */}
                                            {leaderboardEntry && !(challenge.scope === 'team' && !challenge.template_key) && (
                                              <span className="text-slate-400 text-xs">
                                                Total: {leaderboardEntry.total}
                                              </span>
                                            )}
                                            {/* Show pass/fail and per-task progress for Team Blitzkrieg */}
                                            {challenge.scope === 'team' && !challenge.template_key && (
                                              participantResult ? (
                                                <div className="flex flex-col items-end gap-1">
                                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                    participantResult.completed_all 
                                                      ? 'bg-green-900/50 text-green-400' 
                                                      : 'bg-red-900/50 text-red-400'
                                                  }`}>
                                                    {participantResult.completed_all ? 'Passed' : 'Failed'}
                                                  </span>
                                                  {/* Per-task breakdown */}
                                                  {participantResult.task_progress && participantResult.task_progress.length > 0 && (
                                                    <div className="text-xs text-slate-400 space-x-2">
                                                      {participantResult.task_progress.map((task: any, idx: number) => (
                                                        <span key={idx} className={task.completed ? 'text-green-400' : 'text-slate-400'}>
                                                          {task.task_name}: {task.achieved}/{task.target}
                                                          {task.completed && ' ✓'}
                                                        </span>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                              ) : (
                                                <span className="text-xs text-slate-500">
                                                  (View Details for full breakdown)
                                                </span>
                                              )
                                            )}
                                            {/* Show winner badge - but NOT for Team Blitzkrieg */}
                                            {challenge.winner_user_id === participant.user_id && 
                                              !(challenge.scope === 'team' && !challenge.template_key) && (
                                              <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/50 text-green-400">
                                                Winner
                                              </span>
                                            )}
                                            {/* Show surrendered badge */}
                                            {participant.state === 'surrendered' && (
                                              <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400">
                                                Surrendered
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              </div>
                              
                              {/* View Full Details Link */}
                              <div className="pt-2 flex flex-wrap gap-3">
                                <button
                                  onClick={() => router.push(`/warzone/${challenge.id}`)}
                                  className="text-sm text-blue-400 hover:text-blue-300"
                                  data-testid={`button-view-details-${challenge.id}`}
                                >
                                  View Full Details →
                                </button>
                                {isAdmin && (
                                  <button
                                    onClick={() => handleOpenEditModal(challenge.id)}
                                    className="text-sm text-amber-400 hover:text-amber-300"
                                    data-testid={`button-edit-history-${challenge.id}`}
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* Shared Workout History Section */}
          {!loading && activeTab === 'active' && (
            <div className="mt-8 border-t border-slate-700 pt-6">
              <button
                onClick={() => setShowSharedWorkoutHistory(!showSharedWorkoutHistory)}
                className="flex items-center gap-2 text-lg font-bold text-emerald-400 hover:text-emerald-300 mb-4"
                data-testid="toggle-shared-workout-history"
              >
                <span>Shared Workout History</span>
                <span className="text-sm">{showSharedWorkoutHistory ? '▼' : '▶'}</span>
              </button>
              
              {showSharedWorkoutHistory && (
                <div className="space-y-4">
                  {/* Sub-tab toggle: Activity History vs Flaps History vs Sesh History */}
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setSharedWorkoutSubTab('activity')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        sharedWorkoutSubTab === 'activity'
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                      data-testid="btn-shared-activity"
                    >
                      Activity History
                    </button>
                    <button
                      onClick={() => setSharedWorkoutSubTab('flaps')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        sharedWorkoutSubTab === 'flaps'
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                      data-testid="btn-shared-flaps"
                    >
                      Flaps History
                    </button>
                    <button
                      onClick={() => setSharedWorkoutSubTab('sesh')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        sharedWorkoutSubTab === 'sesh'
                          ? 'bg-orange-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                      data-testid="btn-shared-sesh"
                    >
                      Sesh History
                    </button>
                  </div>

                  {/* Filter Controls */}
                  <div className="space-y-3 mb-4">
                    {/* Date Range Filter Row */}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-400">Date Range:</span>
                        <select
                          value={sharedDateRange}
                          onChange={(e) => {
                            const value = e.target.value as 'today' | 'week' | 'month' | 'all' | 'custom';
                            setSharedDateRange(value);
                            setSharedHistoryExpanded(value === 'month');
                          }}
                          className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200"
                          data-testid="shared-date-range-select"
                        >
                          <option value="today">Today</option>
                          <option value="week">This Week</option>
                          <option value="month">This Month</option>
                          <option value="all">All Time</option>
                          <option value="custom">Custom</option>
                        </select>
                      </div>
                      
                      {/* Custom Date Range Inputs */}
                      {sharedDateRange === 'custom' && (
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={sharedCustomStart}
                            onChange={(e) => setSharedCustomStart(e.target.value)}
                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200"
                            data-testid="shared-custom-start"
                          />
                          <span className="text-slate-400">to</span>
                          <input
                            type="date"
                            value={sharedCustomEnd}
                            onChange={(e) => setSharedCustomEnd(e.target.value)}
                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200"
                            data-testid="shared-custom-end"
                          />
                        </div>
                      )}
                      
                    </div>

                    {/* Team Member Filter */}
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-sm">Member:</span>
                      <select
                        value={sharedUserFilter}
                        onChange={(e) => setSharedUserFilter(e.target.value)}
                        className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200"
                        data-testid="shared-user-filter"
                      >
                        <option value="all">All Members</option>
                        {teamMembersSharing
                          .filter(m => m.shareEnabled)
                          .map(member => (
                            <option key={member.username} value={member.username}>
                              {member.username}
                            </option>
                          ))}
                      </select>
                    </div>
                    {sharedWorkoutSubTab !== 'sesh' && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-sm">Exercise:</span>
                        <select
                          value={sharedExerciseFilter}
                          onChange={(e) => setSharedExerciseFilter(e.target.value)}
                          className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200"
                          data-testid="shared-exercise-filter"
                        >
                          <option value="all">All Exercises</option>
                          {exerciseTypes
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(et => (
                              <option key={et.id} value={et.name}>{et.name}</option>
                            ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {sharedWorkoutLoading ? (
                    <div className="text-center py-8 text-slate-500">Loading shared workout history...</div>
                  ) : (
                    <>
                      {/* Team members sharing status */}
                      {teamMembersSharing.filter(m => m.shareEnabled).length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                          <p>No team members are sharing their workout history</p>
                          <p className="text-sm mt-2">Team members can enable sharing in Apollo → History tab</p>
                        </div>
                      ) : (
                        <>
                          {/* Activity History Sub-Tab */}
                          {sharedWorkoutSubTab === 'activity' && (
                            <>
                              {sharedActivities.length === 0 ? (
                                <div className="text-center py-6 text-slate-500">
                                  No shared activities yet
                                </div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-sm" data-testid="shared-activity-table">
                                    <thead className="bg-slate-700 text-slate-300">
                                      <tr>
                                        <th className="px-3 py-2 rounded-tl-lg">Date</th>
                                        <th className="px-3 py-2">User</th>
                                        <th className="px-3 py-2">Exercise</th>
                                        <th className="px-3 py-2 text-right rounded-tr-lg">Value</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700">
                                      {sharedActivities
                                        .filter(activity => sharedExerciseFilter === 'all' || activity.exercise_types?.name === sharedExerciseFilter)
                                        .map(activity => (
                                        <tr
                                          key={activity.id}
                                          className="bg-slate-800 hover:bg-slate-750"
                                          data-testid={`shared-activity-row-${activity.id}`}
                                        >
                                          <td className="px-3 py-2 text-slate-400">
                                            {new Date(activity.entry_date).toLocaleDateString('en-AU')}
                                          </td>
                                          <td className="px-3 py-2 font-medium" style={{ color: getUserColor(activity.username) }}>
                                            {activity.username}
                                          </td>
                                          <td className="px-3 py-2 text-slate-300">
                                            {activity.exercise_types?.name}
                                          </td>
                                          <td className="px-3 py-2 text-right font-bold text-purple-300">
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
                            </>
                          )}

                          {/* Flaps History Sub-Tab */}
                          {sharedWorkoutSubTab === 'flaps' && (
                            <>
                              {sharedFlapsEntries.length === 0 ? (
                                <div className="text-center py-6 text-slate-500">
                                  No shared Flaps activities yet
                                </div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-sm" data-testid="shared-flaps-table">
                                    <thead className="bg-slate-700 text-slate-300">
                                      <tr>
                                        <th className="px-2 py-2 rounded-tl-lg">Date</th>
                                        <th className="px-2 py-2">User</th>
                                        <th className="px-2 py-2">Exercise</th>
                                        <th className="px-2 py-2 text-right">Time</th>
                                        <th className="px-2 py-2 text-right">Km</th>
                                        <th className="px-2 py-2 text-right">Avg HR</th>
                                        <th className="px-2 py-2 text-right rounded-tr-lg">Cal</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700">
                                      {sharedFlapsEntries.map(entry => (
                                        <tr
                                          key={entry.id}
                                          className="bg-slate-800 hover:bg-slate-750"
                                          data-testid={`shared-flaps-row-${entry.id}`}
                                        >
                                          <td className="px-2 py-2 text-slate-400">
                                            {new Date(entry.entry_date).toLocaleDateString('en-AU')}
                                          </td>
                                          <td className="px-2 py-2 font-medium" style={{ color: getUserColor(entry.username) }}>
                                            {entry.username}
                                          </td>
                                          <td className="px-2 py-2 text-rose-300">
                                            <div className="flex items-center gap-1">
                                              <span>{entry.exercise_mode === 'Custom' ? entry.custom_exercise || 'Custom' : entry.exercise_mode}</span>
                                              {entry.exercise_mode === 'HIIT' && entry.hiit_details && (
                                                <HiitTooltip 
                                                  hiitDetails={entry.hiit_details} 
                                                  testId={`hiit-info-shared-${entry.id}`}
                                                />
                                              )}
                                            </div>
                                          </td>
                                          <td className="px-2 py-2 text-right text-slate-300">
                                            {entry.duration_minutes} min
                                          </td>
                                          <td className="px-2 py-2 text-right text-slate-300">
                                            {entry.distance_km && parseFloat(entry.distance_km) > 0 ? `${parseFloat(entry.distance_km).toFixed(1)}` : '-'}
                                          </td>
                                          <td className="px-2 py-2 text-right text-slate-300">
                                            {entry.avg_heart_rate || '-'}
                                          </td>
                                          <td className="px-2 py-2 text-right text-slate-300">
                                            {entry.calories_burned || '-'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </>
                          )}

                          {/* Sesh History Sub-Tab */}
                          {sharedWorkoutSubTab === 'sesh' && (
                            <>
                              {sharedSeshSessions.length === 0 ? (
                                <div className="text-center py-6 text-slate-500">
                                  No shared Sesh sessions yet
                                </div>
                              ) : (
                                <div className="space-y-2" data-testid="shared-sesh-list">
                                  {sharedSeshSessions.map((sess: any) => {
                                    const isExpanded = expandedSharedSeshIds.has(sess.id);
                                    return (
                                      <div key={sess.id} className="bg-slate-800 rounded-lg border border-slate-700" data-testid={`shared-sesh-${sess.id}`}>
                                        <button
                                          onClick={() => {
                                            setExpandedSharedSeshIds(prev => {
                                              const next = new Set(prev);
                                              if (next.has(sess.id)) next.delete(sess.id);
                                              else next.add(sess.id);
                                              return next;
                                            });
                                          }}
                                          className="w-full text-left p-3 flex items-center justify-between"
                                          data-testid={`shared-sesh-toggle-${sess.id}`}
                                        >
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium" style={{ color: getUserColor(sess.username) }}>
                                                {sess.username}
                                              </span>
                                              <span className="text-slate-400 text-xs">
                                                {new Date(sess.session_date).toLocaleDateString('en-AU')}
                                              </span>
                                            </div>
                                            <p className="text-orange-300 text-sm mt-0.5 flex flex-wrap items-center gap-x-2">
                                              <span>{sess.name || 'Gym Session'}</span>
                                              <span className="text-slate-500 text-xs">
                                                {sess.exercises.length} exercise{sess.exercises.length !== 1 ? 's' : ''}
                                              </span>
                                              {sess.total_volume > 0 && (
                                                <span className="text-orange-400/70 text-xs font-medium">
                                                  {sess.total_volume.toLocaleString()}kg iron
                                                </span>
                                              )}
                                              {(() => {
                                                const firstSet = sess.exercises
                                                  .flatMap((ex: any) => ex.sets)
                                                  .filter((s: any) => s.created_at)
                                                  .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
                                                const dur = formatSeshDuration(firstSet?.created_at ?? null, sess.finished_at);
                                                return dur ? <span className="text-slate-500 text-xs">{dur}</span> : null;
                                              })()}
                                            </p>
                                          </div>
                                          <span className="text-slate-500 text-xs ml-2">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                                        </button>
                                        {isExpanded && (() => {
                                          const allSets = sess.exercises
                                            .flatMap((ex: any) => ex.sets.map((s: any) => ({ ...s, _exIdx: ex.exercise_name })))
                                            .filter((s: any) => s.created_at)
                                            .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                                          const firstSetAt: string | null = allSets[0]?.created_at ?? null;
                                          const sessDur = formatSeshDuration(firstSetAt, sess.finished_at);
                                          const splitMap = new Map<string, string>();
                                          allSets.forEach((s: any, idx: number) => {
                                            const prev = allSets[idx - 1];
                                            if (prev) {
                                              const split = formatSetSplit(prev.created_at, s.created_at);
                                              if (split) splitMap.set(s.created_at, split);
                                            }
                                          });
                                          return (
                                            <div className="border-t border-slate-700 p-3 space-y-2">
                                              {sessDur && (
                                                <p className="text-slate-500 text-xs pb-1 border-b border-slate-700/50">
                                                  Session time: {sessDur}
                                                </p>
                                              )}
                                              {sess.exercises.length === 0 ? (
                                                <p className="text-slate-500 text-xs">No exercises recorded</p>
                                              ) : (
                                                sess.exercises.map((ex: any, i: number) => (
                                                  <div key={i}>
                                                    <p className="text-slate-300 text-xs font-medium">
                                                      {ex.exercise_name} <span className="text-slate-500">({ex.muscle_group})</span>
                                                    </p>
                                                    {ex.sets.map((set: any) => (
                                                      <div key={set.set_number} className="flex items-center gap-1 ml-3">
                                                        <p className="text-slate-400 text-xs">
                                                          {set.is_warmup ? '(W) ' : ''}Set {set.set_number}: {set.weight_kg != null ? `${set.weight_kg}kg` : '-'} x {set.reps ?? '-'}
                                                        </p>
                                                        {set.created_at && splitMap.get(set.created_at) && (
                                                          <span className="text-slate-600 text-xs font-mono">{splitMap.get(set.created_at)}</span>
                                                        )}
                                                        {set.notes && (
                                                          <SetNoteIcon note={set.notes} />
                                                        )}
                                                      </div>
                                                    ))}
                                                  </div>
                                                ))
                                              )}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          )}

                          {/* Refresh Button */}
                          <button
                            onClick={fetchSharedWorkoutHistory}
                            disabled={sharedWorkoutLoading}
                            className="w-full mt-4 bg-slate-700 hover:bg-slate-600 py-2 rounded-lg text-sm disabled:opacity-50"
                            data-testid="btn-refresh-shared-workout"
                          >
                            Refresh Shared History
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Launch Challenge Modal */}
        {showLaunchModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-700">
                <h2 className="text-lg font-bold text-slate-100">
                  {!launchMode ? 'Launch Attack' : 
                    launchMode === 'attack' ? 'Showdown' :
                    launchMode === 'team' ? 'Team Blitzkrieg' : 'Lone Wolf'}
                </h2>
                <button
                  onClick={closeLaunchModal}
                  className="text-slate-400 hover:text-slate-200 text-2xl leading-none"
                  data-testid="button-close-modal"
                >
                  &times;
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 space-y-4">
                {/* Mode Selection */}
                {!launchMode && (
                  <div className="grid grid-cols-1 gap-3">
                    <button
                      onClick={() => handleSelectMode('attack')}
                      className="p-4 bg-orange-900/30 border border-orange-600/50 rounded-xl text-left hover:bg-orange-900/50 transition-colors"
                      data-testid="button-mode-attack"
                    >
                      <h3 className="font-bold text-orange-400 text-lg">Showdown</h3>
                      <p className="text-sm text-slate-400 mt-1">1v1 challenge against a teammate (Shred Off or Onslaught)</p>
                    </button>
                    <button
                      onClick={() => handleSelectMode('team')}
                      className="p-4 bg-purple-900/30 border border-purple-600/50 rounded-xl text-left hover:bg-purple-900/50 transition-colors"
                      data-testid="button-mode-team"
                    >
                      <h3 className="font-bold text-purple-400 text-lg">Team Blitzkrieg</h3>
                      <p className="text-sm text-slate-400 mt-1">Open team challenge - all members can join and compete</p>
                    </button>
                    <button
                      onClick={() => handleSelectMode('solo')}
                      className="p-4 bg-sky-900/30 border border-sky-600/50 rounded-xl text-left hover:bg-sky-900/50 transition-colors"
                      data-testid="button-mode-solo"
                    >
                      <h3 className="font-bold text-sky-400 text-lg">Lone Wolf</h3>
                      <p className="text-sm text-slate-400 mt-1">Solo challenge (Rep-based or Cardio)</p>
                    </button>
                  </div>
                )}

                {/* Attack Mode Form */}
                {launchMode === 'attack' && (
                  <div className="space-y-4">
                    <button
                      onClick={() => setLaunchMode(null)}
                      className="text-sm text-slate-400 hover:text-slate-200"
                    >
                      ← Back to mode selection
                    </button>

                    {/* Challenge Type Selection */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Challenge Type
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setRepForm({ ...repForm, scope: 'status' as any })}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            (repForm.scope as any) === 'status'
                              ? 'bg-orange-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                          data-testid="button-type-shredoff"
                        >
                          Shred Off
                        </button>
                        <button
                          type="button"
                          onClick={() => setRepForm({ ...repForm, scope: 'duel' })}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            repForm.scope === 'duel'
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                          data-testid="button-type-onslaught"
                        >
                          Onslaught
                        </button>
                        <button
                          type="button"
                          onClick={() => setRepForm({ ...repForm, scope: 'flap_off' as any })}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            (repForm.scope as any) === 'flap_off'
                              ? 'bg-rose-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                          data-testid="button-type-flapoff"
                        >
                          Flap Off
                        </button>
                        <button
                          type="button"
                          onClick={() => setRepForm({ ...repForm, scope: 'sesh_off' as any })}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            (repForm.scope as any) === 'sesh_off'
                              ? 'bg-teal-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                          data-testid="button-type-seshoff"
                        >
                          Sesh Off
                        </button>
                      </div>
                    </div>

                    {/* Flap Off Form (Cardio 1v1) */}
                    {(repForm.scope as any) === 'flap_off' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Opponent</label>
                          <select
                            value={selectedOpponent}
                            onChange={(e) => setSelectedOpponent(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="select-flapoff-opponent"
                          >
                            <option value="">Select opponent...</option>
                            {users.filter(u => u.id !== currentUserId).map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.username}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Challenge Title</label>
                          <input
                            type="text"
                            value={flapsTitle}
                            onChange={(e) => setFlapsTitle(e.target.value)}
                            placeholder="e.g., Cardio Clash"
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-flapoff-title"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Start Date</label>
                            <input
                              type="date"
                              value={flapsStartDate}
                              onChange={(e) => {
                                setFlapsStartDate(e.target.value);
                                if (!flapsEndDate || e.target.value > flapsEndDate) {
                                  setFlapsEndDate(e.target.value);
                                }
                              }}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-flapoff-start-date"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">End Date</label>
                            <input
                              type="date"
                              value={flapsEndDate || flapsStartDate}
                              onChange={(e) => setFlapsEndDate(e.target.value)}
                              min={flapsStartDate || undefined}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-flapoff-end-date"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">
                            {isMultiDayFlaps ? 'Daily Duration Target (mins)' : 'Target Duration (mins)'}
                          </label>
                          <input
                            type="number"
                            value={flapsDuration || ''}
                            onChange={(e) => setFlapsDuration(parseInt(e.target.value) || 0)}
                            placeholder="e.g., 90"
                            min={1}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-flapoff-duration"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">
                              {isMultiDayFlaps ? 'Daily Avg HR (optional)' : 'Target Avg HR (optional)'}
                            </label>
                            <input
                              type="number"
                              value={flapsTargetHR || ''}
                              onChange={(e) => setFlapsTargetHR(parseInt(e.target.value) || 0)}
                              placeholder="e.g., 140"
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-flapoff-hr"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">
                              {isMultiDayFlaps ? 'Daily Calories (optional)' : 'Target Calories (optional)'}
                            </label>
                            <input
                              type="number"
                              value={flapsTargetCalories || ''}
                              onChange={(e) => setFlapsTargetCalories(parseInt(e.target.value) || 0)}
                              placeholder="e.g., 1000"
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-flapoff-calories"
                            />
                          </div>
                        </div>
                        {isMultiDayFlaps && (
                          <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                            <span className="text-xs font-medium text-amber-400 block mb-2">{flapsDays}-Day Challenge Totals:</span>
                            <div className="grid grid-cols-3 gap-2 text-xs text-slate-300">
                              <div>
                                <span className="text-slate-400">Duration:</span>{' '}
                                <span className="font-medium text-slate-100">{flapsDuration * flapsDays} mins</span>
                              </div>
                              {flapsTargetHR > 0 && (
                                <div>
                                  <span className="text-slate-400">Avg HR:</span>{' '}
                                  <span className="font-medium text-slate-100">{flapsTargetHR} bpm</span>
                                </div>
                              )}
                              {flapsTargetCalories > 0 && (
                                <div>
                                  <span className="text-slate-400">Calories:</span>{' '}
                                  <span className="font-medium text-slate-100">{flapsTargetCalories * flapsDays} cal</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Comments (optional)</label>
                          <textarea
                            value={flapsComments}
                            onChange={(e) => setFlapsComments(e.target.value)}
                            placeholder="Add any notes or details about the challenge..."
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 resize-none"
                            rows={2}
                            data-testid="input-flapoff-comments"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Stake (optional)</label>
                          <input
                            type="text"
                            value={stakeText}
                            onChange={(e) => setStakeText(e.target.value)}
                            placeholder="e.g., Loser buys coffee"
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-flapoff-stake"
                          />
                        </div>
                        {launchError && (
                          <div className="p-2 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">{launchError}</div>
                        )}
                        {launchSuccess && (
                          <div className="p-2 bg-green-900/50 border border-green-700 rounded-lg text-green-200 text-sm">{launchSuccess}</div>
                        )}
                        <button
                          onClick={async () => {
                            if (!selectedOpponent) {
                              setLaunchError('Please select an opponent');
                              return;
                            }
                            if (!flapsTitle.trim()) {
                              setLaunchError('Please enter a title');
                              return;
                            }
                            if (!flapsStartDate) {
                              setLaunchError('Please select a start date');
                              return;
                            }
                            const effectiveEndDate = flapsEndDate || flapsStartDate;
                            if (effectiveEndDate < flapsStartDate) {
                              setLaunchError('End date must be on or after start date');
                              return;
                            }
                            if (flapsDuration <= 0) {
                              setLaunchError('Target duration must be at least 1 minute');
                              return;
                            }
                            setLaunching(true);
                            setLaunchError(null);
                            try {
                              const days = Math.max(1, Math.round((new Date(effectiveEndDate).getTime() - new Date(flapsStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);
                              const totalDuration = days > 1 ? flapsDuration * days : flapsDuration;
                              const totalCalories = days > 1 && flapsTargetCalories ? flapsTargetCalories * days : flapsTargetCalories;
                              const res = await fetch('/api/warzone/challenges', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  challenge_kind: 'flaps',
                                  scope: 'duel',
                                  title: flapsTitle.trim(),
                                  starts_on: flapsStartDate,
                                  ends_on: effectiveEndDate,
                                  target_duration_minutes: totalDuration,
                                  target_avg_heart_rate: flapsTargetHR || null,
                                  target_calories: totalCalories || null,
                                  comments: flapsComments.trim() || null,
                                  stake_text: stakeText.trim() || null,
                                  opponent_user_id: selectedOpponent,
                                }),
                              });
                              if (!res.ok) {
                                const errData = await res.json();
                                throw new Error(errData.error || 'Failed to create challenge');
                              }
                              setLaunchSuccess('Flap Off challenge created!');
                              setTimeout(() => {
                                closeLaunchModal();
                                window.location.reload();
                              }, 1500);
                            } catch (err: any) {
                              setLaunchError(err.message || 'Failed to create challenge');
                            } finally {
                              setLaunching(false);
                            }
                          }}
                          disabled={launching}
                          className="w-full py-3 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-600 text-white font-bold rounded-lg"
                          data-testid="button-launch-flapoff"
                        >
                          {launching ? 'Launching...' : 'Launch Flap Off'}
                        </button>
                      </>
                    )}

                    {/* Sesh Off Form (Gym Session 1v1) */}
                    {(repForm.scope as any) === 'sesh_off' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Opponent</label>
                          <select
                            value={selectedOpponent}
                            onChange={(e) => setSelectedOpponent(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="select-seshoff-opponent"
                          >
                            <option value="">Select opponent...</option>
                            {users.filter(u => u.id !== currentUserId).map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.username}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Challenge Title</label>
                          <input
                            type="text"
                            value={seshTitle}
                            onChange={(e) => setSeshTitle(e.target.value)}
                            placeholder="e.g., Gym Warrior Showdown"
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-seshoff-title"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Start Date</label>
                            <input
                              type="date"
                              value={seshStartDate}
                              onChange={(e) => {
                                setSeshStartDate(e.target.value);
                                if (e.target.value > seshEndDate) {
                                  setSeshEndDate(e.target.value);
                                }
                              }}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-seshoff-start-date"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">End Date</label>
                            <input
                              type="date"
                              value={seshEndDate}
                              onChange={(e) => setSeshEndDate(e.target.value)}
                              min={seshStartDate || undefined}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-seshoff-end-date"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Target Sessions</label>
                          <input
                            type="number"
                            value={seshTargetSessions || ''}
                            onChange={(e) => setSeshTargetSessions(parseInt(e.target.value) || 0)}
                            placeholder="e.g., 10"
                            min={1}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-seshoff-target"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Comments (optional)</label>
                          <textarea
                            value={seshComments}
                            onChange={(e) => setSeshComments(e.target.value)}
                            placeholder="Add any notes or details about the challenge..."
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 resize-none"
                            rows={2}
                            data-testid="input-seshoff-comments"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Stake (optional)</label>
                          <input
                            type="text"
                            value={stakeText}
                            onChange={(e) => setStakeText(e.target.value)}
                            placeholder="e.g., Loser buys coffee"
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-seshoff-stake"
                          />
                        </div>
                        {launchError && (
                          <div className="p-2 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">{launchError}</div>
                        )}
                        {launchSuccess && (
                          <div className="p-2 bg-green-900/50 border border-green-700 rounded-lg text-green-200 text-sm">{launchSuccess}</div>
                        )}
                        <button
                          onClick={async () => {
                            if (!selectedOpponent) {
                              setLaunchError('Please select an opponent');
                              return;
                            }
                            if (!seshTitle.trim()) {
                              setLaunchError('Please enter a title');
                              return;
                            }
                            if (!seshStartDate || !seshEndDate) {
                              setLaunchError('Please select start and end dates');
                              return;
                            }
                            if (seshEndDate < seshStartDate) {
                              setLaunchError('End date must be on or after start date');
                              return;
                            }
                            if (seshTargetSessions <= 0) {
                              setLaunchError('Target sessions must be greater than 0');
                              return;
                            }
                            setLaunching(true);
                            setLaunchError(null);
                            try {
                              const res = await fetch('/api/warzone/challenges', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  challenge_kind: 'reps',
                                  scope: 'duel',
                                  title: seshTitle.trim(),
                                  exercise_type_id: 'b8f3d4e1-7a2c-4f5b-9e1d-3c6a8b0f2e4d',
                                  task_name: 'Sesh',
                                  target_type: 'total',
                                  target_value: seshTargetSessions,
                                  starts_on: seshStartDate,
                                  ends_on: seshEndDate,
                                  opponent_user_id: selectedOpponent,
                                  stake_text: stakeText.trim() || null,
                                  comments: seshComments.trim() || null,
                                }),
                              });
                              if (!res.ok) {
                                const errData = await res.json();
                                throw new Error(errData.error || 'Failed to create challenge');
                              }
                              setLaunchSuccess('Sesh Off challenge launched!');
                              setTimeout(() => {
                                closeLaunchModal();
                                window.location.reload();
                              }, 1500);
                            } catch (err: any) {
                              setLaunchError(err.message || 'Failed to create challenge');
                            } finally {
                              setLaunching(false);
                            }
                          }}
                          disabled={launching}
                          className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 text-white font-bold rounded-lg"
                          data-testid="button-launch-seshoff"
                        >
                          {launching ? 'Launching...' : 'Launch Sesh Off'}
                        </button>
                      </>
                    )}

                    {/* Status-based Attack Form (Shred Off) */}
                    {(repForm.scope as any) === 'status' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Template</label>
                          <select
                            value={selectedTemplate}
                            onChange={(e) => {
                              setSelectedTemplate(e.target.value);
                              setSelectedDateRange(''); // Reset date range when template changes
                            }}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="select-shredoff-template"
                          >
                            {templates.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                            <option value="custom">Custom</option>
                          </select>
                        </div>
                        
                        {/* Date Range dropdown for non-custom templates */}
                        {!isCustomTemplate && selectedTemplate && (
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">When</label>
                            <select
                              value={selectedDateRange}
                              onChange={(e) => setSelectedDateRange(e.target.value)}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="select-shredoff-daterange"
                            >
                              <option value="">Select timeframe...</option>
                              {getDateOptions().map((opt) => (
                                <option key={opt.id} value={opt.id}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        
                        {/* Custom template fields */}
                        {isCustomTemplate && (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-slate-300 mb-1">Target Weight Loss (kg)</label>
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                placeholder="e.g., 2.0"
                                value={customTargetWeight}
                                onChange={(e) => setCustomTargetWeight(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                                data-testid="input-custom-target-weight"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-300 mb-1">Deadline</label>
                              <input
                                type="date"
                                value={customTargetDate}
                                onChange={(e) => setCustomTargetDate(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                                data-testid="input-custom-target-date"
                              />
                            </div>
                          </>
                        )}
                        
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Opponent</label>
                          <select
                            value={selectedOpponent}
                            onChange={(e) => setSelectedOpponent(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="select-shredoff-opponent"
                          >
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>{u.username}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Stakes (optional)</label>
                          <input
                            type="text"
                            value={stakeText}
                            onChange={(e) => setStakeText(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-shredoff-stakes"
                          />
                        </div>
                        {launchError && (
                          <div className="p-2 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">{launchError}</div>
                        )}
                        <button
                          onClick={async () => {
                            await handleLaunchAttack();
                            if (!launchError) closeLaunchModal();
                          }}
                          disabled={launching}
                          className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-600 text-white font-bold rounded-lg"
                          data-testid="button-launch-shredoff"
                        >
                          {launching ? 'Launching...' : 'Launch Shred Off'}
                        </button>
                      </>
                    )}

                    {/* Rep-based Duel Form (Onslaught) with Multi-Leg Support */}
                    {repForm.scope === 'duel' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Title</label>
                          <input
                            type="text"
                            value={repForm.title}
                            onChange={(e) => setRepForm({ ...repForm, title: e.target.value })}
                            placeholder="e.g., Push-up Showdown"
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500"
                          />
                        </div>
                        
                        {/* Legs */}
                        <div className="space-y-3">
                          <label className="block text-sm font-medium text-slate-300">Legs</label>
                          {customLegs.map((leg, index) => (
                            <div key={index} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-400 font-medium">Leg {index + 1}</span>
                                {customLegs.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeLeg(index)}
                                    className="text-red-400 hover:text-red-300 text-xs"
                                    data-testid={`button-remove-leg-${index}`}
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs text-slate-400 mb-1">Exercise</label>
                                <select
                                  value={leg.exercise_type_id}
                                  onChange={(e) => updateLeg(index, 'exercise_type_id', e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
                                  data-testid={`select-leg-${index}-exercise`}
                                >
                                  {sortedExerciseTypes.map(et => (
                                    <option key={et.id} value={et.id}>
                                      {et.name} ({et.unit_label})
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-xs text-slate-400 mb-1">Target Type</label>
                                  <select
                                    value={leg.target_type}
                                    onChange={(e) => updateLeg(index, 'target_type', e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
                                    data-testid={`select-leg-${index}-type`}
                                  >
                                    <option value="total">Total</option>
                                    <option value="per_day">Per Day</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-slate-400 mb-1">Target ({exerciseTypes.find(et => et.id === leg.exercise_type_id)?.unit_label || 'units'})</label>
                                  <input
                                    type="number"
                                    value={leg.target_value}
                                    onChange={(e) => updateLeg(index, 'target_value', e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
                                    data-testid={`input-leg-${index}-target`}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                          {customLegs.length < 10 && (
                            <button
                              type="button"
                              onClick={addLeg}
                              className="w-full py-2 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:text-slate-200 hover:border-slate-500 text-sm transition-colors"
                              data-testid="button-add-leg"
                            >
                              + Add Another Leg
                            </button>
                          )}
                          {customLegs.length > 1 && (
                            <p className="text-xs text-slate-500">{customLegs.length}/10 legs</p>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Start</label>
                            <input
                              type="date"
                              value={repForm.starts_on}
                              onChange={(e) => setRepForm({ ...repForm, starts_on: e.target.value })}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">End</label>
                            <input
                              type="date"
                              value={repForm.ends_on}
                              onChange={(e) => setRepForm({ ...repForm, ends_on: e.target.value })}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Opponent</label>
                          <select
                            value={repForm.opponent_user_id}
                            onChange={(e) => setRepForm({ ...repForm, opponent_user_id: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                          >
                            <option value="">Select opponent...</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>{u.username}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Stakes (optional)</label>
                          <input
                            type="text"
                            value={repForm.stake_text}
                            onChange={(e) => setRepForm({ ...repForm, stake_text: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Comments (optional)</label>
                          <textarea
                            value={repForm.description}
                            onChange={(e) => setRepForm({ ...repForm, description: e.target.value })}
                            placeholder="Add any notes or details about this challenge..."
                            rows={2}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 resize-none"
                            data-testid="input-onslaught-comments"
                          />
                        </div>
                        {launchError && (
                          <div className="p-2 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">{launchError}</div>
                        )}
                        <button
                          onClick={async () => {
                            await handleCreateCustomChallenge('duel');
                            if (!launchError) closeLaunchModal();
                          }}
                          disabled={creatingRep}
                          className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 text-white font-bold rounded-lg"
                        >
                          {creatingRep ? 'Creating...' : 'Launch Onslaught'}
                        </button>
                      </>
                    )}

                  </div>
                )}

                {/* Team Blitzkrieg Form with Multi-Task Support */}
                {launchMode === 'team' && (
                  <div className="space-y-4">
                    <button
                      onClick={() => setLaunchMode(null)}
                      className="text-sm text-slate-400 hover:text-slate-200"
                    >
                      ← Back to mode selection
                    </button>
                    
                    {/* Challenge Type Selection */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Challenge Type
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setRepForm({ ...repForm, scope: 'team_shredoff' as any })}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            (repForm.scope as any) === 'team_shredoff'
                              ? 'bg-orange-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                          data-testid="button-type-teamshredoff"
                        >
                          Team Shred Off
                        </button>
                        <button
                          type="button"
                          onClick={() => setRepForm({ ...repForm, scope: 'team' })}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            repForm.scope === 'team'
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                          data-testid="button-type-teamblitz"
                        >
                          Team Blitz
                        </button>
                        <button
                          type="button"
                          onClick={() => setRepForm({ ...repForm, scope: 'team_flaps' as any })}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            (repForm.scope as any) === 'team_flaps'
                              ? 'bg-rose-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                          data-testid="button-type-teamflaps"
                        >
                          Team Flaps
                        </button>
                        <button
                          type="button"
                          onClick={() => setRepForm({ ...repForm, scope: 'team_sesh' as any })}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            (repForm.scope as any) === 'team_sesh'
                              ? 'bg-teal-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                          data-testid="button-type-teamsesh"
                        >
                          Team Sesh
                        </button>
                      </div>
                    </div>

                    {/* Team Shred Off Form */}
                    {(repForm.scope as any) === 'team_shredoff' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Template</label>
                          <select
                            value={selectedTemplate}
                            onChange={(e) => {
                              setSelectedTemplate(e.target.value);
                              setSelectedDateRange('');
                            }}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="select-teamshredoff-template"
                          >
                            {templates.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                            <option value="custom">Custom</option>
                          </select>
                        </div>

                        {!isCustomTemplate && selectedTemplate && (
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">When</label>
                            <select
                              value={selectedDateRange}
                              onChange={(e) => setSelectedDateRange(e.target.value)}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="select-teamshredoff-daterange"
                            >
                              <option value="">Select timeframe...</option>
                              {getDateOptions().map((opt) => (
                                <option key={opt.id} value={opt.id}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {isCustomTemplate && (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-slate-300 mb-1">Target Weight Loss (kg)</label>
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                placeholder="e.g., 2.0"
                                value={customTargetWeight}
                                onChange={(e) => setCustomTargetWeight(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                                data-testid="input-teamshredoff-target-weight"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-300 mb-1">Deadline</label>
                              <input
                                type="date"
                                value={customTargetDate}
                                onChange={(e) => setCustomTargetDate(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                                data-testid="input-teamshredoff-target-date"
                              />
                            </div>
                          </>
                        )}

                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Stakes (optional)</label>
                          <input
                            type="text"
                            value={stakeText}
                            onChange={(e) => setStakeText(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-teamshredoff-stakes"
                          />
                        </div>
                        {launchError && (
                          <div className="p-2 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">{launchError}</div>
                        )}
                        {launchSuccess && (
                          <div className="p-2 bg-green-900/50 border border-green-700 rounded-lg text-green-200 text-sm">{launchSuccess}</div>
                        )}
                        <button
                          onClick={async () => {
                            if (selectedTemplate === 'custom') {
                              if (!customTargetWeight || !customTargetDate) {
                                setLaunchError('Please enter target weight loss and deadline');
                                return;
                              }
                              if (parseFloat(customTargetWeight) <= 0) {
                                setLaunchError('Target weight loss must be greater than 0');
                                return;
                              }
                            } else if (!selectedDateRange) {
                              setLaunchError('Please select a timeframe');
                              return;
                            }

                            setLaunching(true);
                            setLaunchError(null);
                            setLaunchSuccess(null);

                            try {
                              let body: any = {
                                scope: 'team',
                                stake_text: stakeText || null,
                              };

                              if (selectedTemplate === 'custom') {
                                body.template_key = 'custom';
                                body.target_weight_kg = parseFloat(customTargetWeight);
                                body.starts_on = new Date().toISOString().split('T')[0];
                                body.ends_on = customTargetDate;
                              } else {
                                body.template_key = selectedTemplate;
                                const dateOptions = getDateOptions();
                                const selectedOption = dateOptions.find(opt => opt.id === selectedDateRange);
                                if (selectedOption) {
                                  body.starts_on = selectedOption.startDate;
                                  body.ends_on = selectedOption.endDate;
                                }
                              }

                              const res = await fetch('/api/warzone/challenges', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(body),
                              });

                              const data = await res.json();

                              if (!res.ok || !data.ok) {
                                setLaunchError(data.error || 'Failed to create challenge');
                                return;
                              }

                              setLaunchSuccess('Team Shred Off launched!');
                              setStakeText('');
                              setSelectedDateRange('');
                              setCustomTargetWeight('');
                              setCustomTargetDate('');
                              setTimeout(() => {
                                closeLaunchModal();
                                window.location.reload();
                              }, 1500);
                            } catch (err: any) {
                              setLaunchError(err.message || 'Failed to create challenge');
                            } finally {
                              setLaunching(false);
                            }
                          }}
                          disabled={launching}
                          className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-600 text-white font-bold rounded-lg"
                          data-testid="button-launch-teamshredoff"
                        >
                          {launching ? 'Launching...' : 'Launch Team Shred Off'}
                        </button>
                      </>
                    )}

                    {/* Team Flaps Form */}
                    {(repForm.scope as any) === 'team_flaps' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Challenge Title</label>
                          <input
                            type="text"
                            value={flapsTitle}
                            onChange={(e) => setFlapsTitle(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-teamflaps-title"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Start Date</label>
                            <input
                              type="date"
                              value={flapsStartDate}
                              onChange={(e) => {
                                setFlapsStartDate(e.target.value);
                                if (!flapsEndDate || e.target.value > flapsEndDate) {
                                  setFlapsEndDate(e.target.value);
                                }
                              }}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-teamflaps-start-date"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">End Date</label>
                            <input
                              type="date"
                              value={flapsEndDate || flapsStartDate}
                              onChange={(e) => setFlapsEndDate(e.target.value)}
                              min={flapsStartDate || undefined}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-teamflaps-end-date"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">
                            {isMultiDayFlaps ? 'Daily Duration Target (mins)' : 'Target Duration (mins)'}
                          </label>
                          <input
                            type="number"
                            value={flapsDuration || ''}
                            onChange={(e) => setFlapsDuration(parseInt(e.target.value) || 0)}
                            placeholder="e.g., 90"
                            min={1}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-teamflaps-duration"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">
                              {isMultiDayFlaps ? 'Daily Avg HR (optional)' : 'Target Avg HR (optional)'}
                            </label>
                            <input
                              type="number"
                              value={flapsTargetHR || ''}
                              onChange={(e) => setFlapsTargetHR(parseInt(e.target.value) || 0)}
                              placeholder="e.g., 140"
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-teamflaps-hr"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">
                              {isMultiDayFlaps ? 'Daily Calories (optional)' : 'Target Calories (optional)'}
                            </label>
                            <input
                              type="number"
                              value={flapsTargetCalories || ''}
                              onChange={(e) => setFlapsTargetCalories(parseInt(e.target.value) || 0)}
                              placeholder="e.g., 1000"
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-teamflaps-calories"
                            />
                          </div>
                        </div>
                        {isMultiDayFlaps && (
                          <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                            <span className="text-xs font-medium text-amber-400 block mb-2">{flapsDays}-Day Challenge Totals:</span>
                            <div className="grid grid-cols-3 gap-2 text-xs text-slate-300">
                              <div>
                                <span className="text-slate-400">Duration:</span>{' '}
                                <span className="font-medium text-slate-100">{flapsDuration * flapsDays} mins</span>
                              </div>
                              {flapsTargetHR > 0 && (
                                <div>
                                  <span className="text-slate-400">Avg HR:</span>{' '}
                                  <span className="font-medium text-slate-100">{flapsTargetHR} bpm</span>
                                </div>
                              )}
                              {flapsTargetCalories > 0 && (
                                <div>
                                  <span className="text-slate-400">Calories:</span>{' '}
                                  <span className="font-medium text-slate-100">{flapsTargetCalories * flapsDays} cal</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Comments (optional)</label>
                          <textarea
                            value={flapsComments}
                            onChange={(e) => setFlapsComments(e.target.value)}
                            placeholder="Add any notes or details about the challenge..."
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 resize-none"
                            rows={2}
                            data-testid="input-teamflaps-comments"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Stake (optional)</label>
                          <input
                            type="text"
                            value={stakeText}
                            onChange={(e) => setStakeText(e.target.value)}
                            placeholder="e.g., Loser does extra workout"
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-teamflaps-stake"
                          />
                        </div>
                        {launchError && (
                          <div className="p-2 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">{launchError}</div>
                        )}
                        {launchSuccess && (
                          <div className="p-2 bg-green-900/50 border border-green-700 rounded-lg text-green-200 text-sm">{launchSuccess}</div>
                        )}
                        <button
                          onClick={async () => {
                            if (!flapsTitle.trim()) {
                              setLaunchError('Please enter a title');
                              return;
                            }
                            if (!flapsStartDate) {
                              setLaunchError('Please select a start date');
                              return;
                            }
                            const effectiveEndDate = flapsEndDate || flapsStartDate;
                            if (effectiveEndDate < flapsStartDate) {
                              setLaunchError('End date must be on or after start date');
                              return;
                            }
                            if (flapsDuration <= 0) {
                              setLaunchError('Target duration must be at least 1 minute');
                              return;
                            }
                            setLaunching(true);
                            setLaunchError(null);
                            try {
                              const days = Math.max(1, Math.round((new Date(effectiveEndDate).getTime() - new Date(flapsStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);
                              const totalDuration = days > 1 ? flapsDuration * days : flapsDuration;
                              const totalCalories = days > 1 && flapsTargetCalories ? flapsTargetCalories * days : flapsTargetCalories;
                              const res = await fetch('/api/warzone/challenges', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  challenge_kind: 'flaps',
                                  scope: 'team',
                                  title: flapsTitle.trim(),
                                  starts_on: flapsStartDate,
                                  ends_on: effectiveEndDate,
                                  target_duration_minutes: totalDuration,
                                  target_avg_heart_rate: flapsTargetHR || null,
                                  target_calories: totalCalories || null,
                                  comments: flapsComments.trim() || null,
                                  stake_text: stakeText.trim() || null,
                                }),
                              });
                              if (!res.ok) {
                                const errData = await res.json();
                                throw new Error(errData.error || 'Failed to create challenge');
                              }
                              setLaunchSuccess('Team Flaps challenge created!');
                              setTimeout(() => {
                                closeLaunchModal();
                                window.location.reload();
                              }, 1500);
                            } catch (err: any) {
                              setLaunchError(err.message || 'Failed to create challenge');
                            } finally {
                              setLaunching(false);
                            }
                          }}
                          disabled={launching}
                          className="w-full py-3 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-600 text-white font-bold rounded-lg"
                          data-testid="button-launch-teamflaps"
                        >
                          {launching ? 'Creating...' : 'Launch Team Flaps'}
                        </button>
                      </>
                    )}

                    {/* Team Sesh Form */}
                    {(repForm.scope as any) === 'team_sesh' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Challenge Title</label>
                          <input
                            type="text"
                            value={seshTitle}
                            onChange={(e) => setSeshTitle(e.target.value)}
                            placeholder="e.g., Team Gym Grind"
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-teamsesh-title"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Start Date</label>
                            <input
                              type="date"
                              value={seshStartDate}
                              onChange={(e) => {
                                setSeshStartDate(e.target.value);
                                if (e.target.value > seshEndDate) {
                                  setSeshEndDate(e.target.value);
                                }
                              }}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-teamsesh-start-date"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">End Date</label>
                            <input
                              type="date"
                              value={seshEndDate}
                              onChange={(e) => setSeshEndDate(e.target.value)}
                              min={seshStartDate || undefined}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-teamsesh-end-date"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Target Sessions</label>
                          <input
                            type="number"
                            value={seshTargetSessions || ''}
                            onChange={(e) => setSeshTargetSessions(parseInt(e.target.value) || 0)}
                            placeholder="e.g., 10"
                            min={1}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-teamsesh-target"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Comments (optional)</label>
                          <textarea
                            value={seshComments}
                            onChange={(e) => setSeshComments(e.target.value)}
                            placeholder="Add any notes or details about the challenge..."
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 resize-none"
                            rows={2}
                            data-testid="input-teamsesh-comments"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Stake (optional)</label>
                          <input
                            type="text"
                            value={stakeText}
                            onChange={(e) => setStakeText(e.target.value)}
                            placeholder="e.g., Loser does extra workout"
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-teamsesh-stake"
                          />
                        </div>
                        {launchError && (
                          <div className="p-2 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">{launchError}</div>
                        )}
                        {launchSuccess && (
                          <div className="p-2 bg-green-900/50 border border-green-700 rounded-lg text-green-200 text-sm">{launchSuccess}</div>
                        )}
                        <button
                          onClick={async () => {
                            if (!seshTitle.trim()) {
                              setLaunchError('Please enter a title');
                              return;
                            }
                            if (!seshStartDate || !seshEndDate) {
                              setLaunchError('Please select start and end dates');
                              return;
                            }
                            if (seshEndDate < seshStartDate) {
                              setLaunchError('End date must be on or after start date');
                              return;
                            }
                            if (seshTargetSessions <= 0) {
                              setLaunchError('Target sessions must be greater than 0');
                              return;
                            }
                            setLaunching(true);
                            setLaunchError(null);
                            try {
                              const res = await fetch('/api/warzone/challenges', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  challenge_kind: 'reps',
                                  scope: 'team',
                                  title: seshTitle.trim(),
                                  exercise_type_id: 'b8f3d4e1-7a2c-4f5b-9e1d-3c6a8b0f2e4d',
                                  task_name: 'Sesh',
                                  target_type: 'total',
                                  target_value: seshTargetSessions,
                                  starts_on: seshStartDate,
                                  ends_on: seshEndDate,
                                  stake_text: stakeText.trim() || null,
                                  comments: seshComments.trim() || null,
                                }),
                              });
                              if (!res.ok) {
                                const errData = await res.json();
                                throw new Error(errData.error || 'Failed to create challenge');
                              }
                              setLaunchSuccess('Team Sesh challenge created!');
                              setTimeout(() => {
                                closeLaunchModal();
                                window.location.reload();
                              }, 1500);
                            } catch (err: any) {
                              setLaunchError(err.message || 'Failed to create challenge');
                            } finally {
                              setLaunching(false);
                            }
                          }}
                          disabled={launching}
                          className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 text-white font-bold rounded-lg"
                          data-testid="button-launch-teamsesh"
                        >
                          {launching ? 'Creating...' : 'Launch Team Sesh'}
                        </button>
                      </>
                    )}

                    {/* Team Blitz Rep Form */}
                    {repForm.scope === 'team' && (
                      <>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Challenge Title</label>
                      <input
                        type="text"
                        value={repForm.title}
                        onChange={(e) => setRepForm({ ...repForm, title: e.target.value })}
                        placeholder="e.g., 10K Push-up Team Challenge"
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500"
                      />
                    </div>
                    
                    {/* Legs */}
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-300">Legs</label>
                      {customLegs.map((leg, index) => (
                        <div key={index} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400 font-medium">Leg {index + 1}</span>
                            {customLegs.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeLeg(index)}
                                className="text-red-400 hover:text-red-300 text-xs"
                                data-testid={`button-remove-team-leg-${index}`}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Exercise</label>
                            <select
                              value={leg.exercise_type_id}
                              onChange={(e) => updateLeg(index, 'exercise_type_id', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
                              data-testid={`select-team-leg-${index}-exercise`}
                            >
                              {sortedExerciseTypes.map(et => (
                                <option key={et.id} value={et.id}>
                                  {et.name} ({et.unit_label})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-slate-400 mb-1">Target Type</label>
                              <select
                                value={leg.target_type}
                                onChange={(e) => updateLeg(index, 'target_type', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
                                data-testid={`select-team-leg-${index}-type`}
                              >
                                <option value="total">Total</option>
                                <option value="per_day">Per Day</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-slate-400 mb-1">Target ({exerciseTypes.find(et => et.id === leg.exercise_type_id)?.unit_label || 'units'})</label>
                              <input
                                type="number"
                                value={leg.target_value}
                                onChange={(e) => updateLeg(index, 'target_value', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
                                data-testid={`input-team-leg-${index}-target`}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {customLegs.length < 10 && (
                        <button
                          type="button"
                          onClick={addLeg}
                          className="w-full py-2 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:text-slate-200 hover:border-slate-500 text-sm transition-colors"
                          data-testid="button-add-team-leg"
                        >
                          + Add Another Leg
                        </button>
                      )}
                      {customLegs.length > 1 && (
                        <p className="text-xs text-slate-500">{customLegs.length}/10 legs</p>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={repForm.starts_on}
                          onChange={(e) => setRepForm({ ...repForm, starts_on: e.target.value })}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">End Date</label>
                        <input
                          type="date"
                          value={repForm.ends_on}
                          onChange={(e) => setRepForm({ ...repForm, ends_on: e.target.value })}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Stakes (optional)</label>
                      <input
                        type="text"
                        value={repForm.stake_text}
                        onChange={(e) => setRepForm({ ...repForm, stake_text: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Comments (optional)</label>
                      <textarea
                        value={repForm.description}
                        onChange={(e) => setRepForm({ ...repForm, description: e.target.value })}
                        placeholder="Add any notes or details about this challenge..."
                        rows={2}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 resize-none"
                        data-testid="input-team-blitz-comments"
                      />
                    </div>
                    {launchError && (
                      <div className="p-2 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">{launchError}</div>
                    )}
                    <button
                      onClick={async () => {
                        await handleCreateCustomChallenge('team');
                        if (!launchError) closeLaunchModal();
                      }}
                      disabled={creatingRep}
                      className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 text-white font-bold rounded-lg"
                    >
                      {creatingRep ? 'Creating...' : 'Launch Team Blitzkrieg'}
                    </button>
                      </>
                    )}
                  </div>
                )}

                {/* Lone Wolf Form with Multi-Task Support */}
                {launchMode === 'solo' && (
                  <div className="space-y-4">
                    <button
                      onClick={() => setLaunchMode(null)}
                      className="text-sm text-slate-400 hover:text-slate-200"
                    >
                      ← Back to mode selection
                    </button>
                    
                    {/* Challenge Type Selection */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Challenge Type
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setRepForm({ ...repForm, scope: 'solo' })}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            repForm.scope === 'solo'
                              ? 'bg-sky-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                          data-testid="button-type-lonewolf"
                        >
                          Lone Wolf
                        </button>
                        <button
                          type="button"
                          onClick={() => setRepForm({ ...repForm, scope: 'lone_flaps' as any })}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            (repForm.scope as any) === 'lone_flaps'
                              ? 'bg-rose-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                          data-testid="button-type-loneflaps"
                        >
                          Lone Flaps
                        </button>
                        <button
                          type="button"
                          onClick={() => setRepForm({ ...repForm, scope: 'lone_sesh' as any })}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            (repForm.scope as any) === 'lone_sesh'
                              ? 'bg-teal-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                          data-testid="button-type-lonesesh"
                        >
                          Lone Sesh
                        </button>
                      </div>
                    </div>

                    {/* Lone Flaps Form */}
                    {(repForm.scope as any) === 'lone_flaps' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Challenge Title</label>
                          <input
                            type="text"
                            value={flapsTitle}
                            onChange={(e) => setFlapsTitle(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-loneflaps-title"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Start Date</label>
                            <input
                              type="date"
                              value={flapsStartDate}
                              onChange={(e) => {
                                setFlapsStartDate(e.target.value);
                                if (!flapsEndDate || e.target.value > flapsEndDate) {
                                  setFlapsEndDate(e.target.value);
                                }
                              }}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-loneflaps-start-date"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">End Date</label>
                            <input
                              type="date"
                              value={flapsEndDate || flapsStartDate}
                              onChange={(e) => setFlapsEndDate(e.target.value)}
                              min={flapsStartDate || undefined}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-loneflaps-end-date"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">
                            {isMultiDayFlaps ? 'Daily Duration Target (mins)' : 'Target Duration (mins)'}
                          </label>
                          <input
                            type="number"
                            value={flapsDuration || ''}
                            onChange={(e) => setFlapsDuration(parseInt(e.target.value) || 0)}
                            placeholder="e.g., 90"
                            min={1}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-loneflaps-duration"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">
                              {isMultiDayFlaps ? 'Daily Avg HR (optional)' : 'Target Avg HR (optional)'}
                            </label>
                            <input
                              type="number"
                              value={flapsTargetHR || ''}
                              onChange={(e) => setFlapsTargetHR(parseInt(e.target.value) || 0)}
                              placeholder="e.g., 140"
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-loneflaps-hr"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">
                              {isMultiDayFlaps ? 'Daily Calories (optional)' : 'Target Calories (optional)'}
                            </label>
                            <input
                              type="number"
                              value={flapsTargetCalories || ''}
                              onChange={(e) => setFlapsTargetCalories(parseInt(e.target.value) || 0)}
                              placeholder="e.g., 1000"
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-loneflaps-calories"
                            />
                          </div>
                        </div>
                        {isMultiDayFlaps && (
                          <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                            <span className="text-xs font-medium text-amber-400 block mb-2">{flapsDays}-Day Challenge Totals:</span>
                            <div className="grid grid-cols-3 gap-2 text-xs text-slate-300">
                              <div>
                                <span className="text-slate-400">Duration:</span>{' '}
                                <span className="font-medium text-slate-100">{flapsDuration * flapsDays} mins</span>
                              </div>
                              {flapsTargetHR > 0 && (
                                <div>
                                  <span className="text-slate-400">Avg HR:</span>{' '}
                                  <span className="font-medium text-slate-100">{flapsTargetHR} bpm</span>
                                </div>
                              )}
                              {flapsTargetCalories > 0 && (
                                <div>
                                  <span className="text-slate-400">Calories:</span>{' '}
                                  <span className="font-medium text-slate-100">{flapsTargetCalories * flapsDays} cal</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Comments (optional)</label>
                          <textarea
                            value={flapsComments}
                            onChange={(e) => setFlapsComments(e.target.value)}
                            placeholder="Add any notes or details about the challenge..."
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 resize-none"
                            rows={2}
                            data-testid="input-loneflaps-comments"
                          />
                        </div>
                        {launchError && (
                          <div className="p-2 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">{launchError}</div>
                        )}
                        {launchSuccess && (
                          <div className="p-2 bg-green-900/50 border border-green-700 rounded-lg text-green-200 text-sm">{launchSuccess}</div>
                        )}
                        <button
                          onClick={async () => {
                            if (!flapsTitle.trim()) {
                              setLaunchError('Please enter a title');
                              return;
                            }
                            if (!flapsStartDate) {
                              setLaunchError('Please select a start date');
                              return;
                            }
                            const effectiveEndDate = flapsEndDate || flapsStartDate;
                            if (effectiveEndDate < flapsStartDate) {
                              setLaunchError('End date must be on or after start date');
                              return;
                            }
                            if (flapsDuration <= 0) {
                              setLaunchError('Target duration must be at least 1 minute');
                              return;
                            }
                            setLaunching(true);
                            setLaunchError(null);
                            try {
                              const days = Math.max(1, Math.round((new Date(effectiveEndDate).getTime() - new Date(flapsStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);
                              const totalDuration = days > 1 ? flapsDuration * days : flapsDuration;
                              const totalCalories = days > 1 && flapsTargetCalories ? flapsTargetCalories * days : flapsTargetCalories;
                              const res = await fetch('/api/warzone/challenges', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  challenge_kind: 'flaps',
                                  scope: 'solo',
                                  title: flapsTitle.trim(),
                                  starts_on: flapsStartDate,
                                  ends_on: effectiveEndDate,
                                  target_duration_minutes: totalDuration,
                                  target_avg_heart_rate: flapsTargetHR || null,
                                  target_calories: totalCalories || null,
                                  comments: flapsComments.trim() || null,
                                  stake_text: stakeText.trim() || null,
                                }),
                              });
                              if (!res.ok) {
                                const errData = await res.json();
                                throw new Error(errData.error || 'Failed to create challenge');
                              }
                              setLaunchSuccess('Lone Flaps challenge created!');
                              setTimeout(() => {
                                closeLaunchModal();
                                window.location.reload();
                              }, 1500);
                            } catch (err: any) {
                              setLaunchError(err.message || 'Failed to create challenge');
                            } finally {
                              setLaunching(false);
                            }
                          }}
                          disabled={launching}
                          className="w-full py-3 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-600 text-white font-bold rounded-lg"
                          data-testid="button-launch-loneflaps"
                        >
                          {launching ? 'Creating...' : 'Launch Lone Flaps'}
                        </button>
                      </>
                    )}

                    {/* Lone Sesh Form */}
                    {(repForm.scope as any) === 'lone_sesh' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Challenge Title</label>
                          <input
                            type="text"
                            value={seshTitle}
                            onChange={(e) => setSeshTitle(e.target.value)}
                            placeholder="e.g., Solo Gym Streak"
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-lonesesh-title"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Start Date</label>
                            <input
                              type="date"
                              value={seshStartDate}
                              onChange={(e) => {
                                setSeshStartDate(e.target.value);
                                if (e.target.value > seshEndDate) {
                                  setSeshEndDate(e.target.value);
                                }
                              }}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-lonesesh-start-date"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">End Date</label>
                            <input
                              type="date"
                              value={seshEndDate}
                              onChange={(e) => setSeshEndDate(e.target.value)}
                              min={seshStartDate || undefined}
                              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                              data-testid="input-lonesesh-end-date"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Target Sessions</label>
                          <input
                            type="number"
                            value={seshTargetSessions || ''}
                            onChange={(e) => setSeshTargetSessions(parseInt(e.target.value) || 0)}
                            placeholder="e.g., 10"
                            min={1}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                            data-testid="input-lonesesh-target"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Comments (optional)</label>
                          <textarea
                            value={seshComments}
                            onChange={(e) => setSeshComments(e.target.value)}
                            placeholder="Add any notes or details about the challenge..."
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 resize-none"
                            rows={2}
                            data-testid="input-lonesesh-comments"
                          />
                        </div>
                        {launchError && (
                          <div className="p-2 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">{launchError}</div>
                        )}
                        {launchSuccess && (
                          <div className="p-2 bg-green-900/50 border border-green-700 rounded-lg text-green-200 text-sm">{launchSuccess}</div>
                        )}
                        <button
                          onClick={async () => {
                            if (!seshTitle.trim()) {
                              setLaunchError('Please enter a title');
                              return;
                            }
                            if (!seshStartDate || !seshEndDate) {
                              setLaunchError('Please select start and end dates');
                              return;
                            }
                            if (seshEndDate < seshStartDate) {
                              setLaunchError('End date must be on or after start date');
                              return;
                            }
                            if (seshTargetSessions <= 0) {
                              setLaunchError('Target sessions must be greater than 0');
                              return;
                            }
                            setLaunching(true);
                            setLaunchError(null);
                            try {
                              const res = await fetch('/api/warzone/challenges', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  challenge_kind: 'reps',
                                  scope: 'solo',
                                  title: seshTitle.trim(),
                                  exercise_type_id: 'b8f3d4e1-7a2c-4f5b-9e1d-3c6a8b0f2e4d',
                                  task_name: 'Sesh',
                                  target_type: 'total',
                                  target_value: seshTargetSessions,
                                  starts_on: seshStartDate,
                                  ends_on: seshEndDate,
                                  comments: seshComments.trim() || null,
                                }),
                              });
                              if (!res.ok) {
                                const errData = await res.json();
                                throw new Error(errData.error || 'Failed to create challenge');
                              }
                              setLaunchSuccess('Lone Sesh challenge created!');
                              setTimeout(() => {
                                closeLaunchModal();
                                window.location.reload();
                              }, 1500);
                            } catch (err: any) {
                              setLaunchError(err.message || 'Failed to create challenge');
                            } finally {
                              setLaunching(false);
                            }
                          }}
                          disabled={launching}
                          className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 text-white font-bold rounded-lg"
                          data-testid="button-launch-lonesesh"
                        >
                          {launching ? 'Creating...' : 'Launch Lone Sesh'}
                        </button>
                      </>
                    )}

                    {/* Lone Wolf Rep Form */}
                    {repForm.scope === 'solo' && (
                      <>
                    <p className="text-sm text-slate-400">
                      Create a personal challenge to track your own goals. Use the Rep Tracker to log your progress.
                    </p>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Challenge Title</label>
                      <input
                        type="text"
                        value={repForm.title}
                        onChange={(e) => setRepForm({ ...repForm, title: e.target.value })}
                        placeholder="e.g., 100 Push-ups Daily"
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500"
                      />
                    </div>
                    
                    {/* Legs */}
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-300">Legs</label>
                      {customLegs.map((leg, index) => (
                        <div key={index} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400 font-medium">Leg {index + 1}</span>
                            {customLegs.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeLeg(index)}
                                className="text-red-400 hover:text-red-300 text-xs"
                                data-testid={`button-remove-solo-leg-${index}`}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Exercise</label>
                            <select
                              value={leg.exercise_type_id}
                              onChange={(e) => updateLeg(index, 'exercise_type_id', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
                              data-testid={`select-solo-leg-${index}-exercise`}
                            >
                              {sortedExerciseTypes.map(et => (
                                <option key={et.id} value={et.id}>
                                  {et.name} ({et.unit_label})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-slate-400 mb-1">Target Type</label>
                              <select
                                value={leg.target_type}
                                onChange={(e) => updateLeg(index, 'target_type', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
                                data-testid={`select-solo-leg-${index}-type`}
                              >
                                <option value="total">Total</option>
                                <option value="per_day">Per Day</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-slate-400 mb-1">Target ({exerciseTypes.find(et => et.id === leg.exercise_type_id)?.unit_label || 'units'})</label>
                              <input
                                type="number"
                                value={leg.target_value}
                                onChange={(e) => updateLeg(index, 'target_value', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
                                data-testid={`input-solo-leg-${index}-target`}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {customLegs.length < 10 && (
                        <button
                          type="button"
                          onClick={addLeg}
                          className="w-full py-2 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:text-slate-200 hover:border-slate-500 text-sm transition-colors"
                          data-testid="button-add-solo-leg"
                        >
                          + Add Another Leg
                        </button>
                      )}
                      {customLegs.length > 1 && (
                        <p className="text-xs text-slate-500">{customLegs.length}/10 legs</p>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={repForm.starts_on}
                          onChange={(e) => setRepForm({ ...repForm, starts_on: e.target.value })}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">End Date</label>
                        <input
                          type="date"
                          value={repForm.ends_on}
                          onChange={(e) => setRepForm({ ...repForm, ends_on: e.target.value })}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Comments (optional)</label>
                      <textarea
                        value={repForm.description}
                        onChange={(e) => setRepForm({ ...repForm, description: e.target.value })}
                        placeholder="Add any notes or details about this challenge..."
                        rows={2}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 resize-none"
                        data-testid="input-lonewolf-comments"
                      />
                    </div>
                    {launchError && (
                      <div className="p-2 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">{launchError}</div>
                    )}
                    <button
                      onClick={async () => {
                        await handleCreateCustomChallenge('solo');
                        if (!launchError) closeLaunchModal();
                      }}
                      disabled={creatingRep}
                      className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-600 text-white font-bold rounded-lg"
                    >
                      {creatingRep ? 'Creating...' : 'Create Lone Wolf Challenge'}
                    </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {editChallengeId && editChallengeData && !editModalLoading && (
        <ChallengeEditModal
          challengeId={editChallengeId}
          initialData={editChallengeData}
          tasks={editChallengeTasks}
          participants={editChallengeParticipants}
          onClose={() => {
            setEditChallengeId(null);
            setEditChallengeData(null);
            setEditChallengeTasks([]);
            setEditChallengeParticipants([]);
          }}
          onSaved={() => {
            fetchData();
          }}
        />
      )}

      {editModalLoading && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
          <div className="bg-slate-900 border border-slate-600 rounded-xl px-8 py-6">
            <p className="text-slate-300">Loading challenge data...</p>
          </div>
        </div>
      )}
    </>
  );
}
