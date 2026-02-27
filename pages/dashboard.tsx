// pages/dashboard.tsx
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { parseSessionFromRequest, SessionUser } from '../lib/auth';
import { db, users, teams, userTeams } from '../lib/db';
import { eq, ilike } from 'drizzle-orm';
import WeightTrackerCard from '../components/WeightTrackerCard';
import WeightLogTable from '../components/WeightLogTable';
import PersonalStatsCard from '../components/PersonalStatsCard';
import { TeamSwitcher } from '../components/TeamSwitcher';
import JournalSection from '../components/JournalSection';

type UserTeam = {
  team_id: string;
  team_name: string;
};

type Props = {
  user: SessionUser;
  teamName: string | null;
  userTeams: UserTeam[];
};

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

type ProfileData = {
  pb_weight_kg: number | null;
  pb_date: string | null;
  goal_weight: number | null;
  goal_bf: number | null;
  sex: string | null;
  age: number | null;
  height_cm: number | null;
  activity_level: string | null;
  tdee_goal: string | null;
  cut_level: string | null;
  bulk_level: string | null;
};

type BodyFatRow = {
  id: string;
  user_id: string;
  log_date: string;
  bf_percent: number;
  inserted_at: string;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  let user = parseSessionFromRequest(ctx.req);

  // TESTING BYPASS: Auto-login as nox if no session (only when TEST_BYPASS_AUTH is set)
  if (!user && process.env.TEST_BYPASS_AUTH === 'true') {
    try {
      const noxUserData = await db
        .select({ id: users.id, username: users.username, is_admin: users.is_admin })
        .from(users)
        .where(ilike(users.username, 'nox'))
        .limit(1);
      
      if (noxUserData.length > 0) {
        const noxUser = noxUserData[0];
        user = { id: noxUser.id, username: noxUser.username, isAdmin: noxUser.is_admin || false };
      }
    } catch (error) {
      console.error('Dashboard: test bypass auth error:', error);
    }
  }
  
  if (!user) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  // Look up the user's active team (if any)
  let teamName: string | null = null;
  let activeTeamId: string | null = null;

  try {
    const userRowData = await db
      .select({ active_team_id: users.active_team_id })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (userRowData.length > 0 && userRowData[0].active_team_id) {
      activeTeamId = userRowData[0].active_team_id;
      const teamRowData = await db
        .select({ name: teams.name })
        .from(teams)
        .where(eq(teams.id, activeTeamId))
        .limit(1);

      if (teamRowData.length > 0) {
        teamName = teamRowData[0].name;
      }
    }
  } catch (error) {
    console.error('Dashboard: load user active team error:', error);
  }

  // Fallback: if active_team_id is null or points to a deleted team,
  // check user_teams junction table and find a valid team they're a member of
  if (!teamName) {
    try {
      const membershipsData = await db
        .select({ team_id: userTeams.team_id })
        .from(userTeams)
        .where(eq(userTeams.user_id, user.id));

      for (const membership of membershipsData) {
        const fallbackTeamData = await db
          .select({ id: teams.id, name: teams.name })
          .from(teams)
          .where(eq(teams.id, membership.team_id))
          .limit(1);

        if (fallbackTeamData.length > 0) {
          teamName = fallbackTeamData[0].name;
          // Update the user's active_team_id to this valid team
          if (fallbackTeamData[0].id !== activeTeamId) {
            await db
              .update(users)
              .set({ active_team_id: fallbackTeamData[0].id })
              .where(eq(users.id, user.id));
          }
          break;
        }
      }
    } catch (error) {
      console.error('Dashboard: load user_teams fallback error:', error);
    }
  }

  // Fetch all teams the user belongs to
  let userTeamsList: UserTeam[] = [];
  try {
    const membershipsData = await db
      .select({ team_id: userTeams.team_id, team_name: teams.name })
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.team_id, teams.id))
      .where(eq(userTeams.user_id, user.id));

    userTeamsList = membershipsData.map((m) => ({
      team_id: m.team_id,
      team_name: m.team_name,
    }));
  } catch (error) {
    console.error('Dashboard: load user teams error:', error);
  }

  return { props: { user, teamName, userTeams: userTeamsList } };
};

// Format DD/MM/YYYY (AU)
function formatDateAU(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Get today's date as ISO string (yyyy-mm-dd) in local timezone
function getTodayIso() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get today's date as DD/MM/YYYY
function getTodayDDMMYYYY() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Convert DD/MM/YYYY to YYYY-MM-DD with validation
function ddmmyyyyToIso(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split('/');
  if (parts.length !== 3) return '';
  const [dayStr, monthStr, yearStr] = parts;
  if (!dayStr || !monthStr || !yearStr) return '';
  
  const day = parseInt(dayStr, 10);
  const month = parseInt(monthStr, 10);
  const year = parseInt(yearStr, 10);
  
  // Validate ranges
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) {
    return '';
  }
  
  // Construct ISO date and validate it actually exists
  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const testDate = new Date(isoDate + 'T00:00:00');
  
  // Check if the date is valid by comparing parsed values
  if (testDate.getFullYear() !== year || testDate.getMonth() + 1 !== month || testDate.getDate() !== day) {
    return ''; // Invalid date (e.g., Feb 30)
  }
  
  return isoDate;
}

// Convert YYYY-MM-DD to DD/MM/YYYY
function isoToDDMMYYYY(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return '';
  const [year, month, day] = parts;
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
}

export default function Dashboard({ user, teamName, userTeams }: Props) {
  const router = useRouter();

  const [weightInput, setWeightInput] = useState('');
  const [dateInput, setDateInput] = useState(getTodayDDMMYYYY);
  const [commentInput, setCommentInput] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [bfInput, setBfInput] = useState('');
  const [bfDateInput, setBfDateInput] = useState(getTodayDDMMYYYY);
  const [bfCommentInput, setBfCommentInput] = useState('');
  const [savingBf, setSavingBf] = useState(false);
  const [saveBfError, setSaveBfError] = useState<string | null>(null);
  const [saveBfSuccess, setSaveBfSuccess] = useState<string | null>(null);

  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [bodyFatLogs, setBodyFatLogs] = useState<BodyFatRow[]>([]);
  const [profile, setProfile] = useState<ProfileData | undefined>(undefined);
  const [loadingWeights, setLoadingWeights] = useState(true);
  const [loadingBf, setLoadingBf] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [goalWeightInput, setGoalWeightInput] = useState('');
  const [goalBfInput, setGoalBfInput] = useState('');
  const [savingGoals, setSavingGoals] = useState(false);
  const [saveGoalsError, setSaveGoalsError] = useState<string | null>(null);
  const [saveGoalsSuccess, setSaveGoalsSuccess] = useState<string | null>(null);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [savePasswordError, setSavePasswordError] = useState<string | null>(null);
  const [savePasswordSuccess, setSavePasswordSuccess] = useState<string | null>(null);

  const [deletingEntries, setDeletingEntries] = useState(false);

  const [logType, setLogType] = useState<'weight' | 'bodyfat' | 'waist'>('weight');

  // Waist logging state
  const [waistInput, setWaistInput] = useState('');
  const [waistDateInput, setWaistDateInput] = useState(getTodayDDMMYYYY);
  const [waistCommentInput, setWaistCommentInput] = useState('');
  const [savingWaist, setSavingWaist] = useState(false);
  const [saveWaistError, setSaveWaistError] = useState<string | null>(null);
  const [saveWaistSuccess, setSaveWaistSuccess] = useState<string | null>(null);

  type WaistRow = {
    id: string;
    user_id: string;
    log_date: string;
    waist_cm: number;
    inserted_at: string;
  };
  const [waistLogs, setWaistLogs] = useState<WaistRow[]>([]);
  const [loadingWaist, setLoadingWaist] = useState(true);

  // BMR Calculator state
  const [bmrSex, setBmrSex] = useState<'male' | 'female'>('male');
  const [bmrAge, setBmrAge] = useState('');
  const [bmrHeight, setBmrHeight] = useState('');
  const [bmrWeight, setBmrWeight] = useState('');
  const [calculatedBmr, setCalculatedBmr] = useState<number | null>(null);
  const [bmrEditMode, setBmrEditMode] = useState(false);
  const [savingBmr, setSavingBmr] = useState(false);
  const [bmrSaveError, setBmrSaveError] = useState<string | null>(null);
  const [activityLevel, setActivityLevel] = useState<'sedentary' | 'active' | 'full_apollo'>('active');
  const [goal, setGoal] = useState<'cut' | 'maintain' | 'bulk'>('cut');
  const [cutLevel, setCutLevel] = useState<'relaxed' | 'cut' | 'full_shred'>('cut');
  const [bulkLevel, setBulkLevel] = useState<'big' | 'bigger' | 'massive'>('big');
  const [savingShredulator, setSavingShredulator] = useState(false);
  const [shredError, setShredError] = useState<string | null>(null);

  const isNoxAdmin =
    user.isAdmin && user.username.toLowerCase() === 'nox';

  // BMR Calculator - Mifflin-St Jeor formula
  function calculateBMR() {
    const age = parseFloat(bmrAge);
    const height = parseFloat(bmrHeight);
    const weight = parseFloat(bmrWeight);

    if (!age || !height || !weight || age <= 0 || height <= 0 || weight <= 0) {
      setCalculatedBmr(null);
      return;
    }

    // Mifflin-St Jeor formula
    // Men: BMR = (10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) + 5
    // Women: BMR = (10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) - 161
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    
    if (bmrSex === 'male') {
      bmr += 5;
    } else {
      bmr -= 161;
    }

    setCalculatedBmr(Math.round(bmr));
  }

  async function loadWeights() {
    setLoadingWeights(true);
    try {
      const res = await fetch('/api/weights');
      const data = await res.json();
      if (data.ok) {
        setWeights(data.weights || []);
        // Update only PB data, preserve other profile fields
        if (data.profile) {
          setProfile((prev) => ({
            pb_weight_kg: data.profile.pb_weight_kg,
            pb_date: data.profile.pb_date,
            goal_weight: prev?.goal_weight ?? null,
            goal_bf: prev?.goal_bf ?? null,
            sex: prev?.sex ?? null,
            age: prev?.age ?? null,
            height_cm: prev?.height_cm ?? null,
            activity_level: prev?.activity_level ?? null,
            tdee_goal: prev?.tdee_goal ?? null,
            cut_level: prev?.cut_level ?? null,
            bulk_level: prev?.bulk_level ?? null,
          }));
        }
      } else {
        console.error('Load weights error:', data.error);
      }
    } catch (err) {
      console.error('Load weights error:', err);
    } finally {
      setLoadingWeights(false);
    }
  }

  async function loadBodyFatLogs() {
    setLoadingBf(true);
    try {
      const res = await fetch('/api/bodyfat');
      const data = await res.json();
      if (data.ok) {
        setBodyFatLogs(data.logs || []);
      } else {
        console.error('Load body fat logs error:', data.error);
      }
    } catch (err) {
      console.error('Load body fat logs error:', err);
    } finally {
      setLoadingBf(false);
    }
  }

  async function loadWaistLogs() {
    setLoadingWaist(true);
    try {
      const res = await fetch('/api/waist');
      const data = await res.json();
      if (data.ok) {
        setWaistLogs(data.logs || []);
      } else {
        console.error('Load waist logs error:', data.error);
      }
    } catch (err) {
      console.error('Load waist logs error:', err);
    } finally {
      setLoadingWaist(false);
    }
  }

  async function loadProfile() {
    setLoadingProfile(true);
    try {
      const res = await fetch('/api/profile');
      const data = await res.json();
      if (data.ok) {
        setProfile({
          pb_weight_kg: data.profile.pb_weight_kg,
          pb_date: data.profile.pb_date,
          goal_weight: data.profile.goal_weight,
          goal_bf: data.profile.goal_bf,
          sex: data.profile.sex,
          age: data.profile.age,
          height_cm: data.profile.height_cm,
          activity_level: data.profile.activity_level,
          tdee_goal: data.profile.tdee_goal,
          cut_level: data.profile.cut_level,
          bulk_level: data.profile.bulk_level,
        });
        
        // Load saved BMR profile data
        if (data.profile.sex) {
          setBmrSex(data.profile.sex as 'male' | 'female');
        }
        if (data.profile.age) {
          setBmrAge(String(data.profile.age));
        }
        if (data.profile.height_cm) {
          setBmrHeight(String(data.profile.height_cm));
        }
        // Shredulator settings are now loaded from localStorage (see useEffect below)
      } else {
        console.error('Load profile error:', data.error);
      }
    } catch (err) {
      console.error('Load profile error:', err);
    } finally {
      setLoadingProfile(false);
    }
  }

  useEffect(() => {
    loadWeights();
    loadBodyFatLogs();
    loadWaistLogs();
    loadProfile();
    
    // Load Shredulator settings from localStorage
    try {
      const savedSettings = localStorage.getItem('shredulator_settings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        if (settings.activity_level) {
          setActivityLevel(settings.activity_level as 'sedentary' | 'active' | 'full_apollo');
        }
        if (settings.tdee_goal) {
          setGoal(settings.tdee_goal as 'cut' | 'maintain' | 'bulk');
        }
        if (settings.cut_level) {
          setCutLevel(settings.cut_level as 'relaxed' | 'cut' | 'full_shred');
        }
        if (settings.bulk_level) {
          setBulkLevel(settings.bulk_level as 'big' | 'bigger' | 'massive');
        }
      }
    } catch (err) {
      console.error('Error loading Shredulator settings from localStorage:', err);
    }
  }, []);

  // Auto-calculate BMR when profile or weights change
  useEffect(() => {
    if (profile?.sex && profile?.age && profile?.height_cm && weights.length > 0) {
      // Use latest weight for BMR calculation
      // Weights are sorted by weigh_date descending, so weights[0] is the newest
      const latestWeight = weights[0];
      if (latestWeight) {
        const age = profile.age;
        const height = profile.height_cm;
        const weight = latestWeight.weight_kg;

        // Mifflin-St Jeor formula
        // Men: BMR = (10 × weight) + (6.25 × height) - (5 × age) + 5
        // Women: BMR = (10 × weight) + (6.25 × height) - (5 × age) - 161
        let bmr = (10 * weight) + (6.25 * height) - (5 * age);
        if (profile.sex === 'male') {
          bmr += 5;
        } else {
          bmr -= 161;
        }

        setCalculatedBmr(Math.round(bmr));
        setBmrWeight(String(weight));
      }
    }
  }, [profile, weights]);

  async function handleSubmit() {
    if (!weightInput || !dateInput) return;

    // Convert DD/MM/YYYY to ISO format for API
    const isoDate = ddmmyyyyToIso(dateInput);
    if (!isoDate) {
      setSaveError('Invalid date format. Please use DD/MM/YYYY');
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const res = await fetch('/api/weights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weightKg: weightInput,
          weighDate: isoDate,
          comment: commentInput.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setSaveError(data.error || 'Failed to log weight');
        setSaving(false);
        return;
      }

      setSaveSuccess('Weight logged successfully');
      // Wait for data reload before resetting form
      await loadWeights();
      setWeightInput('');
      setDateInput(getTodayDDMMYYYY());
      setCommentInput('');
    } catch (err) {
      console.error('Save weight error:', err);
      setSaveError('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitBf() {
    if (!bfInput || !bfDateInput) return;

    // Convert DD/MM/YYYY to ISO format for API
    const isoDate = ddmmyyyyToIso(bfDateInput);
    if (!isoDate) {
      setSaveBfError('Invalid date format. Please use DD/MM/YYYY');
      return;
    }

    setSavingBf(true);
    setSaveBfError(null);
    setSaveBfSuccess(null);

    try {
      const res = await fetch('/api/bodyfat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bfPercent: bfInput,
          logDate: isoDate,
          comment: bfCommentInput.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setSaveBfError(data.error || 'Failed to log body fat');
        setSavingBf(false);
        return;
      }

      setSaveBfSuccess('Body fat logged successfully');
      // Wait for data reload before resetting form
      await loadBodyFatLogs();
      setBfInput('');
      setBfDateInput(getTodayDDMMYYYY());
      setBfCommentInput('');
    } catch (err) {
      console.error('Save body fat error:', err);
      setSaveBfError('Something went wrong');
    } finally {
      setSavingBf(false);
    }
  }

  async function handleSubmitWaist() {
    if (!waistInput || !waistDateInput) return;

    // Convert DD/MM/YYYY to ISO format for API
    const isoDate = ddmmyyyyToIso(waistDateInput);
    if (!isoDate) {
      setSaveWaistError('Invalid date format. Please use DD/MM/YYYY');
      return;
    }

    setSavingWaist(true);
    setSaveWaistError(null);
    setSaveWaistSuccess(null);

    try {
      const res = await fetch('/api/waist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waistCm: waistInput,
          logDate: isoDate,
          comment: waistCommentInput.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setSaveWaistError(data.error || 'Failed to log waist');
        setSavingWaist(false);
        return;
      }

      setSaveWaistSuccess('Waist logged successfully');
      // Wait for data reload before resetting form
      await loadWaistLogs();
      setWaistInput('');
      setWaistDateInput(getTodayDDMMYYYY());
      setWaistCommentInput('');
    } catch (err) {
      console.error('Save waist error:', err);
      setSaveWaistError('Something went wrong');
    } finally {
      setSavingWaist(false);
    }
  }

  async function handleDeleteEntries(weightIds: string[], bfIds: string[], waistIds: string[] = []) {
    setDeletingEntries(true);

    try {
      // Delete weights
      if (weightIds.length > 0) {
        const resWeights = await fetch('/api/weights', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: weightIds }),
        });

        const dataWeights = await resWeights.json();
        if (!resWeights.ok || !dataWeights.ok) {
          console.error('Delete weights error:', dataWeights.error);
        }
      }

      // Delete body fat logs
      if (bfIds.length > 0) {
        const resBf = await fetch('/api/bodyfat', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: bfIds }),
        });

        const dataBf = await resBf.json();
        if (!resBf.ok || !dataBf.ok) {
          console.error('Delete body fat error:', dataBf.error);
        }
      }

      // Delete waist logs
      if (waistIds.length > 0) {
        const resWaist = await fetch('/api/waist', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: waistIds }),
        });

        const dataWaist = await resWaist.json();
        if (!resWaist.ok || !dataWaist.ok) {
          console.error('Delete waist error:', dataWaist.error);
        }
      }

      // Reload data
      loadWeights();
      loadBodyFatLogs();
      loadWaistLogs();
    } catch (err) {
      console.error('Delete entries error:', err);
    } finally {
      setDeletingEntries(false);
    }
  }

  async function handleSaveGoals() {
    setSavingGoals(true);
    setSaveGoalsError(null);
    setSaveGoalsSuccess(null);

    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalWeight: goalWeightInput || null,
          goalBf: goalBfInput || null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setSaveGoalsError(data.error || 'Failed to save goals');
        setSavingGoals(false);
        return;
      }

      setSaveGoalsSuccess('Goals updated successfully');
      // Reload profile to get updated goals
      await loadProfile();
      // Delay before closing modal so user sees success message
      setTimeout(() => {
        setShowGoalsModal(false);
      }, 1500);
    } catch (err) {
      console.error('Save goals error:', err);
      setSaveGoalsError('Something went wrong');
    } finally {
      setSavingGoals(false);
    }
  }

  async function handleSaveBmrProfile() {
    if (!bmrSex || !bmrAge || !bmrHeight) {
      setBmrSaveError('Please fill in all BMR profile fields');
      return;
    }

    setSavingBmr(true);
    setBmrSaveError(null);

    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sex: bmrSex,
          age: parseFloat(bmrAge),
          heightCm: parseFloat(bmrHeight),
          activityLevel: activityLevel,
          tdeeGoal: goal,
          cutLevel: cutLevel,
          bulkLevel: bulkLevel,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setBmrSaveError(data.error || 'Failed to save BMR profile');
        setSavingBmr(false);
        return;
      }

      // Reload profile to get updated BMR data
      await loadProfile();
      setBmrEditMode(false);
      setBmrSaveError(null);
    } catch (err) {
      console.error('Save BMR profile error:', err);
      setBmrSaveError('Something went wrong');
    } finally {
      setSavingBmr(false);
    }
  }

  function handleSaveShredulator() {
    setSavingShredulator(true);
    setShredError(null);

    try {
      // Save to localStorage for persistence
      const settings = {
        activity_level: activityLevel,
        tdee_goal: goal,
        cut_level: cutLevel,
        bulk_level: bulkLevel,
      };
      localStorage.setItem('shredulator_settings', JSON.stringify(settings));
      
      // Brief visual feedback
      setTimeout(() => {
        setSavingShredulator(false);
      }, 300);
    } catch (err) {
      console.error('Save shredulator error:', err);
      setShredError('Failed to save settings');
      setSavingShredulator(false);
    }
  }

  function handleOpenGoalsModal() {
    setGoalWeightInput(profile?.goal_weight?.toString() || '');
    setGoalBfInput(profile?.goal_bf?.toString() || '');
    setSaveGoalsError(null);
    setSaveGoalsSuccess(null);
    setShowGoalsModal(true);
  }

  function handleOpenPasswordModal() {
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmPasswordInput('');
    setSavePasswordError(null);
    setSavePasswordSuccess(null);
    setShowPasswordModal(true);
  }

  async function handleChangePassword() {
    setSavingPassword(true);
    setSavePasswordError(null);
    setSavePasswordSuccess(null);

    // Validate inputs
    if (!currentPasswordInput || !newPasswordInput || !confirmPasswordInput) {
      setSavePasswordError('All fields are required');
      setSavingPassword(false);
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      setSavePasswordError('New passwords do not match');
      setSavingPassword(false);
      return;
    }

    if (newPasswordInput.length < 6) {
      setSavePasswordError('New password must be at least 6 characters');
      setSavingPassword(false);
      return;
    }

    try {
      const res = await fetch('/api/password/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPasswordInput,
          newPassword: newPasswordInput,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setSavePasswordError(data.error || 'Failed to change password');
        setSavingPassword(false);
        return;
      }

      setSavePasswordSuccess('Password changed successfully');
      setTimeout(() => {
        setShowPasswordModal(false);
      }, 1500);
    } catch (err) {
      console.error('Change password error:', err);
      setSavePasswordError('Something went wrong');
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      router.push('/login');
    }
  }

  return (
    <>
      <Head>
        <title>Team Shred – Dashboard</title>
      </Head>

      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100 px-4 py-8">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Header */}
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="/images/shredhome.png" 
                alt="Team Shred" 
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-lg object-cover"
              />
              <div className="space-y-0.5">
                <p className="text-xs font-mono text-emerald-400/80">DASHBOARD</p>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight">
                  {teamName ? `Welcome to ${teamName}, ${user.username}` : `Welcome, ${user.username}`}
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-end">
              <Link
                href="/team"
                className="inline-flex items-center justify-center rounded-xl border border-indigo-500/60 bg-indigo-500/15 px-4 min-h-11 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/25 transition-colors"
                data-testid="link-team-shred"
              >
                Team Shred
              </Link>
              <Link
                href="/warzone"
                className="inline-flex items-center justify-center rounded-xl border border-red-500/60 bg-red-500/15 px-4 min-h-11 text-sm font-semibold text-red-100 hover:bg-red-500/25 transition-colors"
                data-testid="link-warzone"
              >
                Warzone
              </Link>
              <Link
                href="/tracker"
                className="inline-flex items-center justify-center rounded-xl border border-emerald-500/60 bg-emerald-500/15 px-4 min-h-11 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25 transition-colors"
                data-testid="link-tracker"
              >
                Apollo
              </Link>
              {isNoxAdmin && (
                <Link
                  href="/admin"
                  className="inline-flex items-center justify-center rounded-xl border border-purple-500/60 bg-purple-500/10 px-4 min-h-11 text-sm font-semibold text-purple-200 hover:bg-purple-500/20 transition-colors"
                >
                  Admin
                </Link>
              )}
              <button
                type="button"
                onClick={handleOpenPasswordModal}
                data-testid="button-change-password"
                className="text-xs text-slate-400 hover:text-sky-300 underline underline-offset-2 transition-colors"
              >
                Change Password
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs text-slate-400 hover:text-red-300 underline underline-offset-2 transition-colors"
              >
                Logout
              </button>
            </div>
          </header>

          {/* Team info (only if user has teams) */}
          {userTeams.length > 0 && (
            <section className="rounded-2xl border border-sky-500/40 bg-slate-950/70 shadow-lg shadow-sky-500/10 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-[11px] font-mono text-sky-300/80">
                  Your Teams
                </p>
                <p className="text-sm font-semibold text-sky-100">
                  {userTeams.map((t) => t.team_name).join(', ')}
                </p>
              </div>
              {userTeams.length > 1 && (
                <div className="flex items-center gap-2">
                  <TeamSwitcher />
                </div>
              )}
            </section>
          )}

          {/* Combined Log card */}
          <section className="rounded-2xl border border-emerald-500/40 bg-slate-950/70 shadow-lg shadow-emerald-500/10 p-5 space-y-4">
            <h2 className="text-lg font-semibold text-emerald-300">Log</h2>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {/* Type selector */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Type</label>
                <select
                  value={logType}
                  onChange={(e) => {
                    setLogType(e.target.value as 'weight' | 'bodyfat' | 'waist');
                    setSaveError(null);
                    setSaveSuccess(null);
                    setSaveBfError(null);
                    setSaveBfSuccess(null);
                    setSaveWaistError(null);
                    setSaveWaistSuccess(null);
                  }}
                  data-testid="select-log-type"
                  className="w-full rounded-lg bg-slate-900 border border-emerald-500/40 px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="weight">Log Weight</option>
                  <option value="bodyfat">Log Body Fat %</option>
                  <option value="waist">Log Waist</option>
                </select>
              </div>

              {/* Value input - conditional based on type */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  {logType === 'weight' ? 'Weight (kg)' : logType === 'bodyfat' ? 'Body Fat (%)' : 'Waist (cm)'}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={logType === 'weight' ? weightInput : logType === 'bodyfat' ? bfInput : waistInput}
                  onChange={(e) => {
                    if (logType === 'weight') setWeightInput(e.target.value);
                    else if (logType === 'bodyfat') setBfInput(e.target.value);
                    else setWaistInput(e.target.value);
                  }}
                  placeholder=""
                  data-testid={logType === 'weight' ? 'input-weight' : logType === 'bodyfat' ? 'input-bodyfat' : 'input-waist'}
                  className="w-full rounded-lg bg-slate-900 border border-emerald-500/40 px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Date input */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Date</label>
                <input
                  type="text"
                  placeholder="DD/MM/YYYY"
                  pattern="\\d{2}/\\d{2}/\\d{4}"
                  value={logType === 'weight' ? dateInput : logType === 'bodyfat' ? bfDateInput : waistDateInput}
                  onChange={(e) => {
                    if (logType === 'weight') setDateInput(e.target.value);
                    else if (logType === 'bodyfat') setBfDateInput(e.target.value);
                    else setWaistDateInput(e.target.value);
                  }}
                  data-testid={logType === 'weight' ? 'input-date' : logType === 'bodyfat' ? 'input-bodyfat-date' : 'input-waist-date'}
                  className="w-full rounded-lg bg-slate-900 border border-emerald-500/40 px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Optional comment (all log types) */}
              <div className="sm:col-span-4">
                <label className="block text-xs text-slate-400 mb-1">Comment (optional)</label>
                <textarea
                  value={logType === 'weight' ? commentInput : logType === 'bodyfat' ? bfCommentInput : waistCommentInput}
                  onChange={(e) => {
                    if (logType === 'weight') setCommentInput(e.target.value);
                    else if (logType === 'bodyfat') setBfCommentInput(e.target.value);
                    else setWaistCommentInput(e.target.value);
                  }}
                  placeholder=""
                  maxLength={500}
                  rows={2}
                  data-testid={logType === 'weight' ? 'input-weight-comment' : logType === 'bodyfat' ? 'input-bodyfat-comment' : 'input-waist-comment'}
                  className="w-full rounded-lg bg-slate-900 border border-emerald-500/40 px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  {(logType === 'weight' ? commentInput : logType === 'bodyfat' ? bfCommentInput : waistCommentInput).length}/500 characters
                </p>
              </div>

              {/* Button - always full width at bottom */}
              <div className="sm:col-span-4">
                <button
                  onClick={logType === 'weight' ? handleSubmit : logType === 'bodyfat' ? handleSubmitBf : handleSubmitWaist}
                  disabled={logType === 'weight' ? saving : logType === 'bodyfat' ? savingBf : savingWaist}
                  data-testid={logType === 'weight' ? 'button-log-weight' : logType === 'bodyfat' ? 'button-log-bodyfat' : 'button-log-waist'}
                  className="w-full rounded-lg bg-emerald-500 text-slate-950 font-semibold px-3 py-2 text-sm hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {logType === 'weight' 
                    ? (saving ? 'Saving…' : 'Log Weight')
                    : logType === 'bodyfat'
                    ? (savingBf ? 'Saving…' : 'Log Body Fat')
                    : (savingWaist ? 'Saving…' : 'Log Waist')
                  }
                </button>
              </div>
            </div>

            {/* Error messages */}
            {(logType === 'weight' ? saveError : logType === 'bodyfat' ? saveBfError : saveWaistError) && (
              <p className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded-lg border border-red-700/50">
                {logType === 'weight' ? saveError : logType === 'bodyfat' ? saveBfError : saveWaistError}
              </p>
            )}

            {/* Success messages */}
            {(logType === 'weight' ? saveSuccess : logType === 'bodyfat' ? saveBfSuccess : saveWaistSuccess) && (
              <p className="text-xs text-emerald-300 bg-emerald-900/30 px-3 py-2 rounded-lg border border-emerald-700/50">
                {logType === 'weight' ? saveSuccess : logType === 'bodyfat' ? saveBfSuccess : saveWaistSuccess}
              </p>
            )}
          </section>

          {/* Goals Card */}
          <section className="rounded-2xl border border-amber-500/40 bg-slate-950/70 shadow-lg shadow-amber-500/10 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-amber-300">Your Goals</h2>
              <button
                onClick={handleOpenGoalsModal}
                data-testid="button-edit-goals"
                className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/20 transition-colors"
              >
                Edit Goals
              </button>
            </div>

            {loadingProfile ? (
              <p className="text-xs text-slate-500">Loading goals…</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                  <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wide mb-1">
                    Goal Weight
                  </p>
                  <p className="text-2xl font-bold text-amber-100">
                    {profile?.goal_weight ? `${profile.goal_weight} kg` : 'Not set'}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                  <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wide mb-1">
                    Goal Body Fat %
                  </p>
                  <p className="text-2xl font-bold text-amber-100">
                    {profile?.goal_bf ? `${profile.goal_bf}%` : 'Not set'}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Personal Stats Card */}
          <PersonalStatsCard
            username={user.username}
            profile={profile}
            bodyFatLogs={bodyFatLogs}
            weights={weights}
            loading={loadingProfile || loadingBf}
          />

          {/* BMR Calculator */}
          <section className="rounded-2xl border-2 border-indigo-500/40 bg-slate-900/60 shadow-lg shadow-indigo-500/10 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-indigo-300">The Shredulator</h2>
                <p className="text-xs text-slate-400">
                  {profile?.sex && profile?.age && profile?.height_cm
                    ? 'Auto-calculated from your latest weight'
                    : 'Calculate your Basal Metabolic Rate using the Mifflin-St Jeor formula'}
                </p>
              </div>
              {profile?.sex && profile?.age && profile?.height_cm && !bmrEditMode && (
                <button
                  onClick={() => setBmrEditMode(true)}
                  data-testid="button-edit-bmr"
                  className="rounded-lg border border-indigo-500/60 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 transition-colors"
                >
                  Edit Profile
                </button>
              )}
            </div>

            {bmrEditMode || !profile?.sex || !profile?.age || !profile?.height_cm ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Sex */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Sex</label>
                    <select
                      value={bmrSex}
                      onChange={(e) => setBmrSex(e.target.value as 'male' | 'female')}
                      data-testid="select-bmr-sex"
                      className="w-full rounded-lg bg-slate-950 border border-indigo-500/40 px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>

                  {/* Age */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Age (years)</label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={bmrAge}
                      onChange={(e) => setBmrAge(e.target.value)}
                      placeholder="e.g. 30"
                      data-testid="input-bmr-age"
                      className="w-full rounded-lg bg-slate-950 border border-indigo-500/40 px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* Height */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Height (cm)</label>
                    <input
                      type="number"
                      min="1"
                      max="300"
                      step="0.1"
                      value={bmrHeight}
                      onChange={(e) => setBmrHeight(e.target.value)}
                      placeholder="e.g. 175"
                      data-testid="input-bmr-height"
                      className="w-full rounded-lg bg-slate-950 border border-indigo-500/40 px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {bmrSaveError && (
                  <p className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded-lg border border-red-700/50">
                    {bmrSaveError}
                  </p>
                )}

                <div className="flex gap-2">
                  {bmrEditMode && (
                    <button
                      onClick={() => {
                        setBmrEditMode(false);
                        setBmrSaveError(null);
                        // Restore saved values
                        if (profile?.sex) setBmrSex(profile.sex as 'male' | 'female');
                        if (profile?.age) setBmrAge(String(profile.age));
                        if (profile?.height_cm) setBmrHeight(String(profile.height_cm));
                      }}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
                      data-testid="button-cancel-bmr"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={handleSaveBmrProfile}
                    disabled={savingBmr}
                    data-testid="button-save-bmr"
                    className="rounded-lg bg-indigo-500 text-white font-semibold px-6 py-2 text-sm hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {savingBmr ? 'Saving…' : 'Save Profile'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-lg bg-slate-950/60 border border-indigo-500/20 p-3">
                    <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wide mb-1">Sex</p>
                    <p className="text-base font-semibold text-indigo-100 capitalize">{profile.sex}</p>
                  </div>
                  <div className="rounded-lg bg-slate-950/60 border border-indigo-500/20 p-3">
                    <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wide mb-1">Age</p>
                    <p className="text-base font-semibold text-indigo-100">{profile.age} years</p>
                  </div>
                  <div className="rounded-lg bg-slate-950/60 border border-indigo-500/20 p-3">
                    <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wide mb-1">Height</p>
                    <p className="text-base font-semibold text-indigo-100">{profile.height_cm} cm</p>
                  </div>
                </div>

                {calculatedBmr !== null && (
                  <>
                    <div className="rounded-lg bg-indigo-900/40 border border-indigo-500/40 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-indigo-300 mb-1">Your BMR (based on {bmrWeight} kg)</p>
                          <p className="text-3xl font-bold text-indigo-100" data-testid="text-bmr-result">
                            {calculatedBmr} <span className="text-base font-normal text-indigo-300">cal/day</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Activity Level Selector */}
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-slate-400 mb-2">Activity Level</p>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={() => setActivityLevel('sedentary')}
                            data-testid="button-activity-sedentary"
                            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                              activityLevel === 'sedentary'
                                ? 'bg-indigo-500 text-white border-2 border-indigo-400'
                                : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            Sedentary
                            <span className="block text-[10px] font-normal mt-0.5 opacity-80">× 1.2</span>
                          </button>
                          <button
                            onClick={() => setActivityLevel('active')}
                            data-testid="button-activity-active"
                            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                              activityLevel === 'active'
                                ? 'bg-indigo-500 text-white border-2 border-indigo-400'
                                : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            Active
                            <span className="block text-[10px] font-normal mt-0.5 opacity-80">× 1.4</span>
                          </button>
                          <button
                            onClick={() => setActivityLevel('full_apollo')}
                            data-testid="button-activity-full-apollo"
                            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                              activityLevel === 'full_apollo'
                                ? 'bg-indigo-500 text-white border-2 border-indigo-400'
                                : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            Full Apollo
                            <span className="block text-[10px] font-normal mt-0.5 opacity-80">× 1.7</span>
                          </button>
                        </div>
                      </div>

                      {/* Maintenance (TDEE) Card */}
                      <div className="rounded-lg bg-slate-900/60 border border-indigo-500/20 p-3">
                        <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wide mb-1">
                          Maintenance (TDEE)
                        </p>
                        <p className="text-xl font-bold text-indigo-100" data-testid="text-tdee">
                          {Math.round(calculatedBmr * (
                            activityLevel === 'sedentary' ? 1.2 :
                            activityLevel === 'active' ? 1.4 :
                            1.7
                          ))}{' '}
                          <span className="text-sm font-normal text-indigo-300">cal/day</span>
                        </p>
                      </div>

                      {/* Goal Selector */}
                      <div>
                        <p className="text-xs text-slate-400 mb-2">Goal</p>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={() => setGoal('cut')}
                            data-testid="button-goal-cut"
                            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                              goal === 'cut'
                                ? 'bg-emerald-500 text-white border-2 border-emerald-400'
                                : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            Cut
                          </button>
                          <button
                            onClick={() => setGoal('maintain')}
                            data-testid="button-goal-maintain"
                            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                              goal === 'maintain'
                                ? 'bg-indigo-500 text-white border-2 border-indigo-400'
                                : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            Maintain
                          </button>
                          <button
                            onClick={() => setGoal('bulk')}
                            data-testid="button-goal-bulk"
                            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                              goal === 'bulk'
                                ? 'bg-sky-500 text-white border-2 border-sky-400'
                                : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            Bulk
                          </button>
                        </div>
                      </div>

                      {/* Conditional Intensity Selector */}
                      {goal === 'cut' && (
                        <div>
                          <p className="text-xs text-slate-400 mb-2">Cut Level</p>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              onClick={() => setCutLevel('relaxed')}
                              data-testid="button-cut-relaxed"
                              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                                cutLevel === 'relaxed'
                                  ? 'bg-emerald-500 text-white border-2 border-emerald-400'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                              }`}
                            >
                              Relaxed
                              <span className="block text-[10px] font-normal mt-0.5 opacity-80">-250 cal</span>
                            </button>
                            <button
                              onClick={() => setCutLevel('cut')}
                              data-testid="button-cut-cut"
                              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                                cutLevel === 'cut'
                                  ? 'bg-emerald-500 text-white border-2 border-emerald-400'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                              }`}
                            >
                              Cut
                              <span className="block text-[10px] font-normal mt-0.5 opacity-80">-400 cal</span>
                            </button>
                            <button
                              onClick={() => setCutLevel('full_shred')}
                              data-testid="button-cut-full-shred"
                              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                                cutLevel === 'full_shred'
                                  ? 'bg-emerald-500 text-white border-2 border-emerald-400'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                              }`}
                            >
                              Full Shred
                              <span className="block text-[10px] font-normal mt-0.5 opacity-80">-600 cal</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {goal === 'bulk' && (
                        <div>
                          <p className="text-xs text-slate-400 mb-2">Bulk Level</p>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              onClick={() => setBulkLevel('big')}
                              data-testid="button-bulk-big"
                              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                                bulkLevel === 'big'
                                  ? 'bg-sky-500 text-white border-2 border-sky-400'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                              }`}
                            >
                              Big
                              <span className="block text-[10px] font-normal mt-0.5 opacity-80">+200 cal</span>
                            </button>
                            <button
                              onClick={() => setBulkLevel('bigger')}
                              data-testid="button-bulk-bigger"
                              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                                bulkLevel === 'bigger'
                                  ? 'bg-sky-500 text-white border-2 border-sky-400'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                              }`}
                            >
                              Bigger
                              <span className="block text-[10px] font-normal mt-0.5 opacity-80">+350 cal</span>
                            </button>
                            <button
                              onClick={() => setBulkLevel('massive')}
                              data-testid="button-bulk-massive"
                              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                                bulkLevel === 'massive'
                                  ? 'bg-sky-500 text-white border-2 border-sky-400'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                              }`}
                            >
                              Massive
                              <span className="block text-[10px] font-normal mt-0.5 opacity-80">+500 cal</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Save Button and Error Display */}
                      {shredError && (
                        <p className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded-lg border border-red-700/50">
                          {shredError}
                        </p>
                      )}
                      <button
                        onClick={handleSaveShredulator}
                        disabled={savingShredulator}
                        data-testid="button-save-shredulator"
                        className="rounded-lg bg-indigo-500 text-white font-semibold px-6 py-2 text-sm hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {savingShredulator ? 'Saving…' : 'Save'}
                      </button>

                      {/* Daily Target Cards */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-slate-900/60 border border-indigo-500/20 p-4">
                          <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wide mb-1">
                            Daily Calorie Target
                          </p>
                          <p className="text-2xl font-bold text-indigo-100" data-testid="text-daily-target">
                            {(() => {
                              const maintenanceCalories = Math.round(calculatedBmr * (
                                activityLevel === 'sedentary' ? 1.2 :
                                activityLevel === 'active' ? 1.4 :
                                1.7
                              ));
                              
                              let adjustment = 0;
                              if (goal === 'cut') {
                                adjustment = cutLevel === 'relaxed' ? -250 : cutLevel === 'cut' ? -400 : -600;
                              } else if (goal === 'bulk') {
                                adjustment = bulkLevel === 'big' ? 200 : bulkLevel === 'bigger' ? 350 : 500;
                              }
                              
                              const dailyTarget = Math.max(1200, maintenanceCalories + adjustment);
                              return dailyTarget;
                            })()}{' '}
                            <span className="text-sm font-normal text-indigo-300">cal</span>
                          </p>
                          <p className="text-[10px] text-slate-500 mt-1" data-testid="text-daily-target-description">
                            {goal === 'maintain' && 'Maintain'}
                            {goal === 'cut' && `Cut · ${cutLevel === 'relaxed' ? 'Relaxed' : cutLevel === 'cut' ? 'Cut' : 'Full Shred'}`}
                            {goal === 'bulk' && `Bulk · ${bulkLevel === 'big' ? 'Big' : bulkLevel === 'bigger' ? 'Bigger' : 'Massive'}`}
                          </p>
                        </div>

                        <div className="rounded-lg bg-slate-900/60 border border-emerald-500/20 p-4">
                          <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wide mb-1">
                            Daily Protein Target
                          </p>
                          <p className="text-2xl font-bold text-emerald-100" data-testid="text-daily-protein-target">
                            {(() => {
                              const currentWeight = parseFloat(bmrWeight) || 0;
                              let proteinMultiplier = 1.8; // default to Active
                              
                              if (activityLevel === 'sedentary') {
                                proteinMultiplier = 1.6;
                              } else if (activityLevel === 'active') {
                                proteinMultiplier = 1.8;
                              } else if (activityLevel === 'full_apollo') {
                                proteinMultiplier = 2.0;
                              }
                              
                              const dailyProtein = Math.round(currentWeight * proteinMultiplier);
                              return dailyProtein;
                            })()}{' '}
                            <span className="text-sm font-normal text-emerald-300">g</span>
                          </p>
                          <p className="text-[10px] text-slate-500 mt-1" data-testid="text-daily-protein-description">
                            {activityLevel === 'sedentary' && '1.6g per kg'}
                            {activityLevel === 'active' && '1.8g per kg'}
                            {activityLevel === 'full_apollo' && '2.0g per kg'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </section>

          {/* Journal Section */}
          <JournalSection />

          {/* Weight Tracker */}
          <WeightTrackerCard weights={weights} bodyFatLogs={bodyFatLogs} waistLogs={waistLogs} profile={profile} loading={loadingWeights || loadingBf || loadingWaist} />

          {/* Weight History Table */}
          <WeightLogTable 
            weights={weights} 
            bodyFatLogs={bodyFatLogs} 
            profile={profile} 
            onDelete={handleDeleteEntries} 
            deleting={deletingEntries}
          />
        </div>

        {/* Goals Modal */}
        {showGoalsModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
            <div className="bg-slate-900 rounded-2xl border border-amber-500/40 shadow-2xl shadow-amber-500/20 p-6 max-w-md w-full space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-amber-300">Edit Your Goals</h3>
                <button
                  onClick={() => setShowGoalsModal(false)}
                  className="text-slate-400 hover:text-slate-200 transition-colors"
                  data-testid="button-close-goals-modal"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Goal Weight (kg)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={goalWeightInput}
                    onChange={(e) => setGoalWeightInput(e.target.value)}
                    placeholder="e.g. 75.0"
                    data-testid="input-goal-weight"
                    className="w-full rounded-lg bg-slate-950 border border-amber-500/40 px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Goal Body Fat %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={goalBfInput}
                    onChange={(e) => setGoalBfInput(e.target.value)}
                    placeholder="e.g. 12.0"
                    data-testid="input-goal-bf"
                    className="w-full rounded-lg bg-slate-950 border border-amber-500/40 px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {saveGoalsError && (
                <p className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded-lg border border-red-700/50">
                  {saveGoalsError}
                </p>
              )}

              {saveGoalsSuccess && (
                <p className="text-xs text-amber-300 bg-amber-900/30 px-3 py-2 rounded-lg border border-amber-700/50">
                  {saveGoalsSuccess}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setShowGoalsModal(false)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
                  data-testid="button-cancel-goals"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveGoals}
                  disabled={savingGoals}
                  data-testid="button-save-goals"
                  className="flex-1 rounded-lg bg-amber-500 text-slate-950 font-semibold px-4 py-2 text-sm hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {savingGoals ? 'Saving…' : 'Save Goals'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Password Change Modal */}
        {showPasswordModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
            <div className="bg-slate-900 rounded-2xl border border-sky-500/40 shadow-2xl shadow-sky-500/20 p-6 max-w-md w-full space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-sky-300">Change Password</h3>
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="text-slate-400 hover:text-slate-200 transition-colors"
                  data-testid="button-close-password-modal"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    placeholder="Enter current password"
                    data-testid="input-current-password"
                    className="w-full rounded-lg bg-slate-950 border border-sky-500/40 px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder="Enter new password (min 6 characters)"
                    data-testid="input-new-password"
                    className="w-full rounded-lg bg-slate-950 border border-sky-500/40 px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    placeholder="Confirm new password"
                    data-testid="input-confirm-password"
                    className="w-full rounded-lg bg-slate-950 border border-sky-500/40 px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {savePasswordError && (
                <p className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded-lg border border-red-700/50">
                  {savePasswordError}
                </p>
              )}

              {savePasswordSuccess && (
                <p className="text-xs text-sky-300 bg-sky-900/30 px-3 py-2 rounded-lg border border-sky-700/50">
                  {savePasswordSuccess}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
                  data-testid="button-cancel-password"
                >
                  Cancel
                </button>
                <button
                  onClick={handleChangePassword}
                  disabled={savingPassword}
                  data-testid="button-save-password"
                  className="flex-1 rounded-lg bg-sky-500 text-slate-950 font-semibold px-4 py-2 text-sm hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {savingPassword ? 'Changing…' : 'Change Password'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
