// pages/team.tsx
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { parseSessionFromRequest, SessionUser } from '../lib/auth';
import TeamWeightTrackerCard from '../components/TeamWeightTrackerCard';
import TeamMemberStatsCards from '../components/TeamMemberStatsCards';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

type Props = {
  user: SessionUser;
};

type MemberSummary = {
  id: string;
  username: string;
  latestWeight: number | null;
  latestDate: string | null;
  latestComment: string | null;
  pbWeight: number | null;
  weeklyChange: number | null;
  weeklyStartDate: string | null;
  weeklyEndDate: string | null;
  weeklyStatus: 'ripper_week' | 'pisscutter_week' | null;
  weekendStatus: 'massive_blowout' | 'minor_blowout' | 'decent' | 'solid' | 'epic' | null;
  weekendWeightChange: number | null;
  weekendStartDate: string | null;
  weekendEndDate: string | null;
};

type TeamSummaryResponse =
  | { ok: true; members: MemberSummary[] }
  | { ok: false; error: string };

type Banner = {
  id: string;
  team_id: string | null;
  message: string;
  type: string;
  created_at: string;
  created_by: string | null;
};

type BannersResponse =
  | { ok: true; banners: Banner[] }
  | { ok: false; error: string };

type WeightEntry = {
  id: string;
  user_id: string;
  weigh_date: string;
  weight_kg: number;
  inserted_at: string;
  is_monday: boolean;
  is_friday: boolean;
};

type BodyFatEntry = {
  id: string;
  user_id: string;
  log_date: string;
  bf_percent: number;
  inserted_at: string;
};

type SharedJournals = {
  training: boolean;
  diet: boolean;
  supplements: boolean;
  stack: boolean;
};

type WaistEntry = {
  id: string;
  user_id: string;
  log_date: string;
  waist_cm: number;
  inserted_at: string;
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

type TeamWeightsResponse =
  | { ok: true; members: MemberData[] }
  | { ok: false; error: string };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const user = parseSessionFromRequest(ctx.req);

  if (!user) {
    return {
      redirect: { destination: '/login', permanent: false },
    };
  }

  // API will determine if they are in a team
  return { props: { user } };
};

function formatDateAU(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateShort(value: string | null): string {
  if (!value) return '—';
  // Parse YYYY-MM-DD directly without timezone conversion
  const parts = value.split('-');
  if (parts.length !== 3) return '—';
  const [year, month, day] = parts;
  return `${day}/${month}`;
}

// Normalize date string to YYYY-MM-DD format (handles both plain dates and ISO timestamps)
// Uses local time parsing to avoid UTC timezone shifts
function normalizeDateStr(dateStr: string): string {
  // Extract YYYY-MM-DD part (handles timestamps by splitting on 'T')
  const datePart = dateStr.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length !== 3) return datePart;
  
  // Parse as local date (not UTC) to get proper local calendar day
  const year = +parts[0];
  const month = +parts[1] - 1; // JS months are 0-indexed
  const day = +parts[2];
  const d = new Date(year, month, day);
  
  // Return as YYYY-MM-DD using local date components
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Check if we should display weekend status (Mon-Fri of the week containing the Monday)
function shouldShowWeekendStatus(mondayDateStr: string | null): boolean {
  if (!mondayDateStr) return false;
  
  // Normalize Monday date to YYYY-MM-DD (handles timestamps)
  const mondayNorm = normalizeDateStr(mondayDateStr);
  
  // Get today's local date as YYYY-MM-DD string
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  // Calculate Friday of that week (Monday + 4 days)
  const mondayParts = mondayNorm.split('-');
  if (mondayParts.length !== 3) return false;
  const monday = new Date(+mondayParts[0], +mondayParts[1] - 1, +mondayParts[2]);
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);
  const fridayStr = `${friday.getFullYear()}-${String(friday.getMonth() + 1).padStart(2, '0')}-${String(friday.getDate()).padStart(2, '0')}`;
  
  // Show if today is between Monday and Friday (inclusive)
  return todayStr >= mondayNorm && todayStr <= fridayStr;
}

// Check if we should display weekly status (show from latest Friday onwards)
function shouldShowWeeklyStatus(latestFridayDateStr: string | null): boolean {
  if (!latestFridayDateStr) return false;
  
  // Normalize Friday date to YYYY-MM-DD (handles timestamps)
  const fridayNorm = normalizeDateStr(latestFridayDateStr);
  
  // Get today's local date as YYYY-MM-DD string
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  // Show if today is >= latest Friday
  return todayStr >= fridayNorm;
}

function formatNumber(value: number | null, suffix = ''): string {
  if (value === null || value === undefined) return '—';
  return `${value}${suffix}`;
}

function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

type JournalCategory = 'training' | 'diet' | 'supplements' | 'stack';

type JournalEntry = {
  id: string;
  user_id: string;
  category: JournalCategory;
  content: string;
  created_at: string;
};

const CATEGORY_LABELS: Record<JournalCategory, { label: string; color: string }> = {
  training: { label: 'Training', color: 'bg-emerald-600' },
  diet: { label: 'Diet', color: 'bg-teal-600' },
  supplements: { label: 'Supplements', color: 'bg-lime-600' },
  stack: { label: 'Stack', color: 'bg-green-600' },
};

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  
  // Format in Australia/Sydney timezone
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Australia/Sydney',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  
  const formatter = new Intl.DateTimeFormat('en-AU', options);
  const parts = formatter.formatToParts(d);
  
  const day = parts.find(p => p.type === 'day')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const year = parts.find(p => p.type === 'year')?.value || '';
  const hour = parts.find(p => p.type === 'hour')?.value || '';
  const minute = parts.find(p => p.type === 'minute')?.value || '';
  
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

export default function TeamPage({ user }: Props) {
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [notInTeam, setNotInTeam] = useState(false);

  const [banners, setBanners] = useState<Banner[]>([]);
  const [loadingBanners, setLoadingBanners] = useState(true);
  const [bannersError, setBannersError] = useState<string | null>(null);

  const [teamWeights, setTeamWeights] = useState<MemberData[]>([]);
  const [loadingWeights, setLoadingWeights] = useState(true);
  const [weightsError, setWeightsError] = useState<string | null>(null);

  const [teamName, setTeamName] = useState<string>('');
  const [teamMotto, setTeamMotto] = useState<string>('');
  const [loadingTeamInfo, setLoadingTeamInfo] = useState(true);
  const [editingMotto, setEditingMotto] = useState(false);
  const [mottoInput, setMottoInput] = useState<string>('');
  const [savingMotto, setSavingMotto] = useState(false);

  // Journal modal state
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [journalMemberUserId, setJournalMemberUserId] = useState<string | null>(null);
  const [journalMemberUsername, setJournalMemberUsername] = useState<string>('');
  const [journalCategory, setJournalCategory] = useState<JournalCategory>('training');
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [loadingJournal, setLoadingJournal] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [journalShowAll, setJournalShowAll] = useState(false);
  const JOURNAL_ENTRIES_LIMIT = 5;

  async function handleViewJournal(userId: string, username: string, category: JournalCategory) {
    setJournalMemberUserId(userId);
    setJournalMemberUsername(username);
    setJournalCategory(category);
    setShowJournalModal(true);
    setLoadingJournal(true);
    setJournalError(null);
    setJournalEntries([]);
    setJournalShowAll(false);

    try {
      const res = await fetch(`/api/journal/member?userId=${userId}&category=${category}`);
      const data = await res.json();

      if (data.ok) {
        setJournalEntries(data.entries);
      } else {
        setJournalError(data.error || 'Failed to load journal entries');
      }
    } catch (err) {
      console.error('Load journal entries error:', err);
      setJournalError('Something went wrong');
    } finally {
      setLoadingJournal(false);
    }
  }

  // Load team info
  useEffect(() => {
    let cancelled = false;

    async function loadTeamInfo() {
      setLoadingTeamInfo(true);

      try {
        const res = await fetch('/api/team/info');
        const data = await res.json();

        if (!res.ok) {
          if (res.status === 403) {
            if (!cancelled) setNotInTeam(true);
            return;
          }
          return;
        }

        if (data.ok) {
          if (!cancelled) {
            setTeamName(data.team.name);
            setTeamMotto(data.team.motto);
            setMottoInput(data.team.motto);
          }
        }
      } catch (err) {
        console.error('Load team info error:', err);
      } finally {
        if (!cancelled) setLoadingTeamInfo(false);
      }
    }

    loadTeamInfo();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load team summary
  useEffect(() => {
    let cancelled = false;

    async function loadTeam() {
      setLoadingMembers(true);
      setMembersError(null);
      setNotInTeam(false);

      try {
        const res = await fetch('/api/team/summary');
        const data: TeamSummaryResponse = await res.json();

        if (!res.ok) {
          if (res.status === 403) {
            if (!cancelled) setNotInTeam(true);
            return;
          }
          if (!cancelled) setMembersError('Failed to load team summary');
          return;
        }

        if (!data.ok) {
          if (data.error === 'You are not in a team') {
            if (!cancelled) setNotInTeam(true);
            return;
          }
          if (!cancelled) setMembersError(data.error);
          return;
        }

        if (!cancelled) {
          setMembers(data.members);
        }
      } catch (err) {
        console.error('Load team summary error:', err);
        if (!cancelled) setMembersError('Something went wrong');
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    }

    loadTeam();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load team banners
  useEffect(() => {
    let cancelled = false;

    async function loadBanners() {
      setLoadingBanners(true);
      setBannersError(null);

      try {
        const res = await fetch('/api/team/banners');
        const data: BannersResponse = await res.json();

        if (!res.ok) {
          if (res.status === 403) {
            if (!cancelled) setNotInTeam(true);
            return;
          }
          if (!cancelled) setBannersError('Failed to load team news');
          return;
        }

        if (!data.ok) {
          if (data.error === 'You are not in a team') {
            if (!cancelled) setNotInTeam(true);
            return;
          }
          if (!cancelled) setBannersError(data.error);
          return;
        }

        if (!cancelled) {
          setBanners(data.banners);
        }
      } catch (err) {
        console.error('Load banners error:', err);
        if (!cancelled) setBannersError('Something went wrong');
      } finally {
        if (!cancelled) setLoadingBanners(false);
      }
    }

    loadBanners();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load team weights data
  useEffect(() => {
    let cancelled = false;

    async function loadTeamWeights() {
      setLoadingWeights(true);
      setWeightsError(null);

      try {
        const res = await fetch('/api/team/weights');
        const data: TeamWeightsResponse = await res.json();

        if (!res.ok) {
          if (res.status === 403) {
            if (!cancelled) setNotInTeam(true);
            return;
          }
          if (!cancelled) setWeightsError('Failed to load team weights');
          return;
        }

        if (!data.ok) {
          if (data.error === 'You are not in a team') {
            if (!cancelled) setNotInTeam(true);
            return;
          }
          if (!cancelled) setWeightsError(data.error);
          return;
        }

        if (!cancelled) {
          setTeamWeights(data.members);
        }
      } catch (err) {
        console.error('Load team weights error:', err);
        if (!cancelled) setWeightsError('Something went wrong');
      } finally {
        if (!cancelled) setLoadingWeights(false);
      }
    }

    loadTeamWeights();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveMotto = async () => {
    setSavingMotto(true);
    try {
      const res = await fetch('/api/team/update-motto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motto: mottoInput }),
      });

      if (res.ok) {
        setTeamMotto(mottoInput);
        setEditingMotto(false);
      }
    } catch (err) {
      console.error('Save motto error:', err);
    } finally {
      setSavingMotto(false);
    }
  };

  const handleCancelMotto = () => {
    setMottoInput(teamMotto);
    setEditingMotto(false);
  };

  return (
    <>
      <Head>
        <title>Team Shred – Team Dashboard</title>
      </Head>

      <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100 px-4 py-8 relative">
        <div 
          className="fixed inset-0 bg-center bg-no-repeat pointer-events-none bg-slate-950"
          style={{ backgroundImage: "url('/images/teamshred-bg.jpg')", backgroundSize: '100% auto' }}
        />
        <div className="max-w-5xl mx-auto space-y-8 relative z-10">
          {/* Header */}
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <p className="text-xs font-mono text-sky-400/80">TEAM DASHBOARD</p>
              <h1 className="text-3xl font-bold tracking-tight">
                {loadingTeamInfo ? 'Loading...' : teamName || 'Team'}
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Your Dashboard
              </Link>
              <Link
                href="/warzone"
                className="inline-flex items-center justify-center rounded-xl border border-red-500/60 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-100 hover:bg-red-500/25 transition-colors"
                data-testid="link-warzone"
              >
                Warzone
              </Link>
              <Link
                href="/tracker"
                className="inline-flex items-center justify-center rounded-xl border border-emerald-500/60 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25 transition-colors"
                data-testid="link-tracker"
              >
                Apollo
              </Link>
            </div>
          </header>

          {/* Not in a team */}
          {notInTeam && (
            <section className="rounded-2xl border border-slate-800 bg-slate-950/80 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-100 mb-2">
                You&apos;re not in a team yet
              </h2>
              <p className="text-xs text-slate-400 mb-3">
                Ask an admin to add you to a team from the admin control room. Once
                you&apos;re assigned, this page will show your squad&apos;s progress.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-xl border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 transition-colors"
              >
                Go to your dashboard
              </Link>
            </section>
          )}

          {/* Errors (summary) */}
          {membersError && !notInTeam && (
            <section className="rounded-2xl border border-red-900/70 bg-red-950/40 px-5 py-4">
              <p className="text-xs text-red-200">{membersError}</p>
            </section>
          )}

          {/* Team News */}
          {!notInTeam && (
            <section className="rounded-2xl border border-amber-500/40 bg-slate-950/80 shadow-lg shadow-amber-500/10 px-5 py-4 space-y-3">
              <h2 className="text-sm font-semibold text-amber-100">
                {teamName || 'Team'} News
              </h2>

              {loadingBanners ? (
                <p className="text-xs text-slate-500">Loading news…</p>
              ) : bannersError ? (
                <p className="text-xs text-red-300">{bannersError}</p>
              ) : banners.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Get ready to Shred
                </p>
              ) : (
                <ul className="space-y-3 text-xs">
                  {banners.map((b) => {
                    let badgeLabel = 'Update';
                    let badgeClass = 'inline-flex items-center rounded-full bg-slate-800/70 text-slate-200 border border-slate-700/80 px-2.5 py-[3px] text-[10px]';
                    let cardClass = 'rounded-xl px-4 py-3 border';
                    let messageClass = 'text-slate-100 text-sm';

                    if (b.type === 'manual') {
                      badgeLabel = 'Announcement';
                      badgeClass = 'inline-flex items-center rounded-full bg-sky-500/15 text-sky-200 border border-sky-500/40 px-2.5 py-[3px] text-[10px]';
                      cardClass += ' bg-sky-950/30 border-sky-500/20';
                    } else if (b.type === 'pb') {
                      badgeLabel = 'NEW PB';
                      badgeClass = 'inline-flex items-center rounded-full bg-emerald-500/25 text-emerald-100 border border-emerald-400/50 px-2.5 py-[3px] text-[10px] font-bold';
                      cardClass += ' bg-emerald-950/40 border-emerald-500/30 shadow-md shadow-emerald-500/10';
                      messageClass = 'text-emerald-100 text-sm font-medium';
                    } else if (b.type === 'weekend_epic') {
                      badgeLabel = 'EPIC WEEKEND';
                      badgeClass = 'inline-flex items-center rounded-full bg-violet-500/30 text-violet-100 border border-violet-400/60 px-3 py-1 text-[11px] font-bold tracking-wide';
                      cardClass += ' bg-gradient-to-r from-violet-950/50 via-purple-950/40 to-violet-950/50 border-violet-500/40 shadow-lg shadow-violet-500/20';
                      messageClass = 'text-violet-100 text-sm font-semibold';
                    } else if (b.type === 'weekend_solid') {
                      badgeLabel = 'SOLID WEEKEND';
                      badgeClass = 'inline-flex items-center rounded-full bg-emerald-500/20 text-emerald-100 border border-emerald-400/40 px-2.5 py-[3px] text-[10px] font-semibold';
                      cardClass += ' bg-emerald-950/30 border-emerald-500/25 shadow-sm shadow-emerald-500/10';
                      messageClass = 'text-emerald-100 text-sm font-medium';
                    } else if (b.type === 'weekly_pisscutter') {
                      badgeLabel = 'PISSCUTTER WEEK';
                      badgeClass = 'inline-flex items-center rounded-full bg-amber-500/30 text-amber-100 border border-amber-400/60 px-3 py-1 text-[11px] font-bold tracking-wide';
                      cardClass += ' bg-gradient-to-r from-amber-950/50 via-orange-950/40 to-amber-950/50 border-amber-500/40 shadow-lg shadow-amber-500/20';
                      messageClass = 'text-amber-100 text-sm font-semibold';
                    } else if (b.type === 'weekly_ripper') {
                      badgeLabel = 'RIPPER WEEK';
                      badgeClass = 'inline-flex items-center rounded-full bg-green-500/25 text-green-100 border border-green-400/50 px-2.5 py-[3px] text-[10px] font-bold';
                      cardClass += ' bg-green-950/35 border-green-500/30 shadow-md shadow-green-500/10';
                      messageClass = 'text-green-100 text-sm font-medium';
                    } else if (b.type === 'weekend_massive_blowout') {
                      badgeLabel = 'MASSIVE BLOWOUT';
                      badgeClass = 'inline-flex items-center rounded-full bg-red-600/30 text-red-200 border border-red-500/50 px-2.5 py-[3px] text-[10px] font-bold';
                      cardClass += ' bg-red-950/30 border-red-800/30';
                      messageClass = 'text-red-200/80 text-sm';
                    } else if (b.type === 'weekend_minor_blowout') {
                      badgeLabel = 'Minor BlowOut';
                      badgeClass = 'inline-flex items-center rounded-full bg-orange-500/20 text-orange-200 border border-orange-500/40 px-2.5 py-[3px] text-[10px]';
                      cardClass += ' bg-orange-950/20 border-orange-800/25';
                      messageClass = 'text-orange-200/80 text-sm';
                    } else if (b.type === 'weekend_decent') {
                      badgeLabel = 'Decent Weekend';
                      badgeClass = 'inline-flex items-center rounded-full bg-yellow-500/15 text-yellow-200 border border-yellow-500/35 px-2.5 py-[3px] text-[10px]';
                      cardClass += ' bg-yellow-950/15 border-yellow-800/20';
                      messageClass = 'text-yellow-200/80 text-sm';
                    } else if (b.type === 'iron_pb') {
                      badgeLabel = 'IRON PB';
                      badgeClass = 'inline-flex items-center rounded-full bg-orange-500/30 text-orange-100 border border-orange-400/60 px-2.5 py-[3px] text-[10px] font-bold';
                      cardClass += ' bg-gradient-to-r from-orange-950/50 via-red-950/40 to-orange-950/50 border-orange-500/40 shadow-md shadow-orange-500/15';
                      messageClass = 'text-orange-100 text-sm font-semibold';
                    } else if (b.type === 'challenge_completed') {
                      badgeLabel = 'MISSION COMPLETE';
                      badgeClass = 'inline-flex items-center rounded-full bg-green-500/25 text-green-100 border border-green-400/50 px-2.5 py-[3px] text-[10px] font-bold';
                      cardClass += ' bg-gradient-to-r from-green-950/50 via-emerald-950/40 to-green-950/50 border-green-500/35 shadow-md shadow-green-500/15';
                      messageClass = 'text-green-100 text-sm font-semibold';
                    } else if (b.type === 'challenge_won') {
                      badgeLabel = 'CHALLENGE WON';
                      badgeClass = 'inline-flex items-center rounded-full bg-amber-500/30 text-amber-100 border border-amber-400/60 px-2.5 py-[3px] text-[10px] font-bold';
                      cardClass += ' bg-gradient-to-r from-amber-950/50 via-yellow-950/40 to-amber-950/50 border-amber-500/40 shadow-md shadow-amber-500/15';
                      messageClass = 'text-amber-100 text-sm font-semibold';
                    } else {
                      cardClass += ' bg-slate-900/40 border-slate-800/30';
                    }

                    return (
                      <li key={b.id} className={cardClass}>
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="space-y-1.5 flex-1 min-w-[180px]">
                            <span className={badgeClass}>{badgeLabel}</span>
                            <p className={messageClass}>
                              {b.message}
                            </p>
                          </div>
                          <span className="text-[10px] text-slate-500 whitespace-nowrap pt-0.5">
                            {formatDateAU(b.created_at)} {formatTime(b.created_at)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {/* Team Member Stats Cards */}
          {!notInTeam && !loadingWeights && !weightsError && teamWeights.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-400">Team Stats</h2>
              <TeamMemberStatsCards members={teamWeights} onViewJournal={handleViewJournal} />
            </section>
          )}

          {/* Team Weight Tracker Chart */}
          {!notInTeam && (
            <TeamWeightTrackerCard members={teamWeights} loading={loadingWeights} error={weightsError} teamName={teamName} />
          )}

          {/* Loading state for members */}
          {loadingMembers && !notInTeam && !membersError && (
            <p className="text-xs text-slate-500">Loading team data…</p>
          )}

          {/* Team Summary - Tabbed */}
          {!loadingMembers && !notInTeam && !membersError && (
            <section className="rounded-2xl border border-slate-800/80 bg-slate-900/80 shadow-xl shadow-sky-500/5 px-5 py-4">
              {members.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No team members found yet. Ask an admin to add users to this team.
                </p>
              ) : (
                <Tabs defaultValue="latest" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 bg-slate-900/50 border border-slate-700/50">
                    <TabsTrigger value="latest" data-testid="tab-latest">Latest</TabsTrigger>
                    <TabsTrigger value="weekly" data-testid="tab-weekly">Weekly</TabsTrigger>
                    <TabsTrigger value="weekend" data-testid="tab-weekend">Weekend</TabsTrigger>
                  </TabsList>

                  {/* Latest Tab */}
                  <TabsContent value="latest" className="min-h-[400px]">
                    <div className="space-y-2">
                      {[...members].sort((a, b) => {
                        // Sort by latest date descending (most recent first)
                        // Use chronological comparison with Date objects
                        const timeA = a.latestDate ? new Date(a.latestDate).getTime() : Number.NEGATIVE_INFINITY;
                        const timeB = b.latestDate ? new Date(b.latestDate).getTime() : Number.NEGATIVE_INFINITY;
                        return timeB - timeA; // descending (most recent first)
                      }).map((m) => (
                        <div
                          key={m.id}
                          className="flex flex-col py-3 border-b border-slate-800/40 last:border-b-0"
                          data-testid={`member-latest-${m.username}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-mono text-sm text-slate-300">{m.username}</div>
                            <div className="flex flex-col items-end">
                              <span className="text-slate-100 font-semibold">
                                {formatNumber(m.latestWeight, ' kg')}
                              </span>
                              <span className="text-xs text-slate-500">
                                {formatDateAU(m.latestDate)}
                              </span>
                            </div>
                          </div>
                          {m.latestComment && (
                            <div className="mt-2 text-xs text-slate-400 italic line-clamp-2" data-testid={`text-comment-${m.username}`}>
                              "{m.latestComment}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  {/* Weekly Tab */}
                  <TabsContent value="weekly" className="min-h-[400px]">
                    <div className="space-y-3">
                      {members.map((m) => {
                        const weekly = m.weeklyChange;
                        let weeklyContent = null;
                        
                        // Only show weekly status if:
                        // 1. Weekly change exists (API validated Fridays 6-8 days apart)
                        // 2. We're on/after the latest Friday
                        const showWeekly = m.weeklyChange !== null && shouldShowWeeklyStatus(m.weeklyEndDate);
                        
                        if (showWeekly && weekly !== null && m.weeklyStartDate && m.weeklyEndDate) {
                          // Display weekly status if available
                          if (m.weeklyStatus === 'ripper_week' && weekly < 0) {
                            const loss = Math.abs(weekly);
                            weeklyContent = (
                              <div className="inline-flex flex-col items-start rounded-lg bg-emerald-500/20 border border-emerald-500/50 px-3 py-2 w-full">
                                <div className="text-xs text-emerald-400/70 mb-1">
                                  Fri {formatDateShort(m.weeklyStartDate)} - Fri {formatDateShort(m.weeklyEndDate)}
                                </div>
                                <div className="text-xs text-emerald-300 mb-1 font-semibold uppercase tracking-wide flex items-center gap-1.5">
                                  <span className="text-base">🏆</span>
                                  <span>Ripper Week</span>
                                </div>
                                <div className="text-sm font-bold text-emerald-300 flex items-center gap-1">
                                  <span className="text-base">↓</span>
                                  <span>{loss.toFixed(1)} kg</span>
                                </div>
                              </div>
                            );
                          } else if (m.weeklyStatus === 'pisscutter_week' && weekly < 0) {
                            const loss = Math.abs(weekly);
                            weeklyContent = (
                              <div className="inline-flex flex-col items-start rounded-lg bg-purple-500/20 border border-purple-500/50 px-3 py-2 w-full">
                                <div className="text-xs text-purple-400/70 mb-1">
                                  Fri {formatDateShort(m.weeklyStartDate)} - Fri {formatDateShort(m.weeklyEndDate)}
                                </div>
                                <div className="text-xs text-purple-300 mb-1 font-semibold uppercase tracking-wide flex items-center gap-1.5">
                                  <span className="text-base">🔥</span>
                                  <span>Pisscutter week!!!</span>
                                </div>
                                <div className="text-sm font-bold text-purple-300 flex items-center gap-1">
                                  <span className="text-base">↓</span>
                                  <span>{loss.toFixed(1)} kg</span>
                                </div>
                              </div>
                            );
                          } else {
                            // No weekly status (weight gain or no loss)
                            const weeklyArrow = weekly < 0 ? '↓' : weekly > 0 ? '↑' : '';
                            const weeklyBgClass = weekly < 0 
                              ? 'bg-emerald-500/20 border-emerald-500/50' 
                              : weekly > 0 
                              ? 'bg-red-500/20 border-red-500/50'
                              : 'bg-slate-800/80 border-slate-700/80';
                            const weeklyTextClass = weekly < 0 
                              ? 'text-emerald-300' 
                              : weekly > 0 
                              ? 'text-red-300'
                              : 'text-slate-300';
                            
                            weeklyContent = (
                              <div className={`inline-flex flex-col items-start rounded-lg ${weeklyBgClass} border px-3 py-2 w-full`}>
                                <div className="text-xs text-slate-400 mb-1">
                                  Fri {formatDateShort(m.weeklyStartDate)} - Fri {formatDateShort(m.weeklyEndDate)}
                                </div>
                                <div className={`text-sm font-bold ${weeklyTextClass} flex items-center gap-1`}>
                                  {weeklyArrow && <span className="text-base">{weeklyArrow}</span>}
                                  <span>{weekly > 0 ? '+' : ''}{weekly.toFixed(1)} kg</span>
                                </div>
                              </div>
                            );
                          }
                        } else {
                          weeklyContent = (
                            <span className="text-slate-500">—</span>
                          );
                        }

                        return (
                          <div
                            key={m.id}
                            className="space-y-2 pb-3 border-b border-slate-800/40 last:border-b-0"
                            data-testid={`member-weekly-${m.username}`}
                          >
                            <div className="font-mono text-sm text-slate-300">{m.username}</div>
                            {weeklyContent}
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>

                  {/* Weekend Tab */}
                  <TabsContent value="weekend" className="min-h-[400px]">
                    <div className="space-y-3">
                      {members.map((m) => {
                        let weekendStatusContent = null;
                        
                        // Only show weekend status if:
                        // 1. Weekend status exists (API validated Friday within 3 days of Monday)
                        // 2. We're in the Mon-Fri display window of that week
                        const showWeekend = m.weekendStatus && shouldShowWeekendStatus(m.weekendEndDate);
                        
                        if (showWeekend && m.weekendStatus === 'massive_blowout' && m.weekendWeightChange !== null && m.weekendStartDate && m.weekendEndDate) {
                          const change = m.weekendWeightChange > 0 ? `+${m.weekendWeightChange.toFixed(1)}` : m.weekendWeightChange.toFixed(1);
                          weekendStatusContent = (
                            <div className="inline-flex flex-col items-start rounded-lg bg-red-600/30 border border-red-500/60 px-3 py-2 w-full">
                              <div className="text-xs text-red-400/70 mb-1">
                                Fri {formatDateShort(m.weekendStartDate)} - Mon {formatDateShort(m.weekendEndDate)}
                              </div>
                              <div className="text-xs text-red-300 mb-1 font-bold uppercase tracking-wide flex items-center gap-1.5">
                                <span className="text-base">☢️💥</span>
                                <span>Massive BlowOut!</span>
                              </div>
                              <div className="text-sm font-bold text-red-200 flex items-center gap-1">
                                <span className="text-base">↑</span>
                                <span>{change} kg</span>
                              </div>
                            </div>
                          );
                        } else if (showWeekend && m.weekendStatus === 'minor_blowout' && m.weekendWeightChange !== null && m.weekendStartDate && m.weekendEndDate) {
                          const change = m.weekendWeightChange > 0 ? `+${m.weekendWeightChange.toFixed(1)}` : m.weekendWeightChange.toFixed(1);
                          weekendStatusContent = (
                            <div className="inline-flex flex-col items-start rounded-lg bg-orange-500/20 border border-orange-500/50 px-3 py-2 w-full">
                              <div className="text-xs text-orange-400/70 mb-1">
                                Fri {formatDateShort(m.weekendStartDate)} - Mon {formatDateShort(m.weekendEndDate)}
                              </div>
                              <div className="text-xs text-orange-300 mb-1 font-semibold uppercase tracking-wide flex items-center gap-1.5">
                                <span className="text-base">🧨</span>
                                <span>Minor BlowOut</span>
                              </div>
                              <div className="text-sm font-bold text-orange-300 flex items-center gap-1">
                                <span className="text-base">↑</span>
                                <span>{change} kg</span>
                              </div>
                            </div>
                          );
                        } else if (showWeekend && m.weekendStatus === 'decent' && m.weekendWeightChange !== null && m.weekendStartDate && m.weekendEndDate) {
                          const change = m.weekendWeightChange > 0 ? `+${m.weekendWeightChange.toFixed(1)}` : m.weekendWeightChange.toFixed(1);
                          weekendStatusContent = (
                            <div className="inline-flex flex-col items-start rounded-lg bg-yellow-500/20 border border-yellow-500/50 px-3 py-2 w-full">
                              <div className="text-xs text-yellow-400/70 mb-1">
                                Fri {formatDateShort(m.weekendStartDate)} - Mon {formatDateShort(m.weekendEndDate)}
                              </div>
                              <div className="text-xs text-yellow-300 mb-1 font-semibold uppercase tracking-wide flex items-center gap-1.5">
                                <span className="text-base">⚠️</span>
                                <span>Decent Weekend</span>
                              </div>
                              <div className="text-sm font-bold text-yellow-300 flex items-center gap-1">
                                <span className="text-base">↑</span>
                                <span>{change} kg</span>
                              </div>
                            </div>
                          );
                        } else if (showWeekend && m.weekendStatus === 'solid' && m.weekendWeightChange !== null && m.weekendStartDate && m.weekendEndDate) {
                          const change = m.weekendWeightChange > 0 ? `+${m.weekendWeightChange.toFixed(1)}` : m.weekendWeightChange.toFixed(1);
                          const arrow = m.weekendWeightChange < 0 ? '↓' : m.weekendWeightChange > 0 ? '↑' : '';
                          weekendStatusContent = (
                            <div className="inline-flex flex-col items-start rounded-lg bg-emerald-500/20 border border-emerald-500/50 px-3 py-2 w-full">
                              <div className="text-xs text-emerald-400/70 mb-1">
                                Fri {formatDateShort(m.weekendStartDate)} - Mon {formatDateShort(m.weekendEndDate)}
                              </div>
                              <div className="text-xs text-emerald-300 mb-1 font-semibold uppercase tracking-wide flex items-center gap-1.5">
                                <span className="text-base">✅</span>
                                <span>Solid Weekend</span>
                              </div>
                              <div className="text-sm font-bold text-emerald-300 flex items-center gap-1">
                                {arrow && <span className="text-base">{arrow}</span>}
                                <span>{change} kg</span>
                              </div>
                            </div>
                          );
                        } else if (showWeekend && m.weekendStatus === 'epic' && m.weekendWeightChange !== null && m.weekendStartDate && m.weekendEndDate) {
                          const change = m.weekendWeightChange > 0 ? `+${m.weekendWeightChange.toFixed(1)}` : m.weekendWeightChange.toFixed(1);
                          const arrow = m.weekendWeightChange < 0 ? '↓' : m.weekendWeightChange > 0 ? '↑' : '';
                          weekendStatusContent = (
                            <div className="inline-flex flex-col items-start rounded-lg bg-violet-500/20 border border-violet-500/50 px-3 py-2 w-full">
                              <div className="text-xs text-violet-400/70 mb-1">
                                Fri {formatDateShort(m.weekendStartDate)} - Mon {formatDateShort(m.weekendEndDate)}
                              </div>
                              <div className="text-xs text-violet-300 mb-1 font-semibold uppercase tracking-wide flex items-center gap-1.5">
                                <span className="text-base">💪</span>
                                <span>Epic Weekend!</span>
                              </div>
                              <div className="text-sm font-bold text-violet-300 flex items-center gap-1">
                                {arrow && <span className="text-base">{arrow}</span>}
                                <span>{change} kg</span>
                              </div>
                            </div>
                          );
                        } else {
                          // Hidden on Sat/Sun or no weekend data
                          weekendStatusContent = (
                            <span className="text-slate-500">—</span>
                          );
                        }

                        return (
                          <div
                            key={m.id}
                            className="space-y-2 pb-3 border-b border-slate-800/40 last:border-b-0"
                            data-testid={`member-weekend-${m.username}`}
                          >
                            <div className="font-mono text-sm text-slate-300">{m.username}</div>
                            {weekendStatusContent}
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </section>
          )}
        </div>

        {/* Journal Modal */}
        {showJournalModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4" data-testid="journal-modal">
            <div className="bg-slate-900 rounded-2xl border border-slate-700/50 shadow-2xl p-4 sm:p-6 max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium text-white ${CATEGORY_LABELS[journalCategory].color}`}>
                    {CATEGORY_LABELS[journalCategory].label}
                  </span>
                  <h3 className="text-lg font-bold text-slate-100">{journalMemberUsername}'s Journal</h3>
                </div>
                <button
                  onClick={() => setShowJournalModal(false)}
                  className="text-slate-400 hover:text-slate-200 transition-colors text-xl leading-none"
                  data-testid="button-close-journal-modal"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loadingJournal ? (
                  <div className="text-center py-8">
                    <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
                    <p className="text-sm text-slate-500 mt-2">Loading entries...</p>
                  </div>
                ) : journalError ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-red-400">{journalError}</p>
                  </div>
                ) : journalEntries.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-slate-500">
                      {journalMemberUsername} hasn't shared any {CATEGORY_LABELS[journalCategory].label.toLowerCase()} entries yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className={`space-y-3 ${journalShowAll ? 'max-h-[50vh] overflow-y-auto pr-1' : ''}`}>
                      {(journalShowAll ? journalEntries : journalEntries.slice(0, JOURNAL_ENTRIES_LIMIT)).map((entry) => (
                        <div
                          key={entry.id}
                          className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30"
                          data-testid={`journal-modal-entry-${entry.id}`}
                        >
                          <div className="text-xs font-medium text-slate-500 mb-2">
                            {formatDateTime(entry.created_at)}
                          </div>
                          <p className="text-sm text-slate-200 whitespace-pre-wrap">
                            {entry.content}
                          </p>
                        </div>
                      ))}
                    </div>
                    {journalEntries.length > JOURNAL_ENTRIES_LIMIT && (
                      <button
                        onClick={() => setJournalShowAll(!journalShowAll)}
                        className="w-full py-2 text-sm font-medium text-emerald-400 hover:text-emerald-300 bg-slate-800/50 rounded-lg border border-slate-700/50 hover:bg-slate-700/50 transition-colors"
                        data-testid="journal-modal-show-more"
                      >
                        {journalShowAll ? 'Show Less' : `Show More (${journalEntries.length - JOURNAL_ENTRIES_LIMIT} more)`}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-700/50">
                <button
                  onClick={() => setShowJournalModal(false)}
                  className="w-full px-4 py-2 rounded-lg bg-slate-700 text-slate-200 font-medium hover:bg-slate-600 transition-colors text-sm"
                  data-testid="button-close-journal"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
