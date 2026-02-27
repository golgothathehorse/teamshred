import { useState, useEffect, useMemo, useCallback } from 'react';
import { formatDateDDMMYYYY, getSydneyDateString } from '../lib/dateUtils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface GymExercise {
  id: string;
  name: string;
  muscle_group: string;
  split_category: string | null;
  description: string | null;
  safety_guide: string | null;
  is_custom: boolean;
  created_by_user_id: string | null;
}

interface GymSet {
  id: string;
  session_exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  is_warmup: boolean;
  notes: string | null;
  created_at: string | null;
}

interface SessionExercise {
  id: string;
  exercise_id: string;
  sort_order: number;
  notes: string | null;
  exercise_name: string;
  muscle_group: string;
  sets: GymSet[];
}

interface GymSession {
  id: string;
  user_id: string;
  session_date: string;
  status: string;
  name: string | null;
  notes: string | null;
  started_at: string;
  finished_at: string | null;
}

interface RoutineExercise {
  id: string;
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  default_sets: number;
  default_reps: number;
  default_weight_kg: number | null;
}

interface Routine {
  id: string;
  name: string;
  description: string | null;
  exercises: RoutineExercise[];
}

interface SessionStat {
  id: string;
  session_date: string;
  name: string | null;
  exercise_count: number;
  set_count: number;
  total_volume: number;
  started_at: string | null;
  finished_at: string | null;
}

interface ExerciseProgress {
  date: string;
  max_weight: number;
  max_reps: number;
  total_sets: number;
  total_volume: number;
}

type SeshView = 'home' | 'active' | 'browse' | 'history' | 'progress';

const MUSCLE_GROUPS = ['All', 'Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Core'];

export default function SeshTab() {
  const [view, setView] = useState<SeshView>('home');
  const [exercises, setExercises] = useState<GymExercise[]>([]);
  const [sessions, setSessions] = useState<GymSession[]>([]);
  const [activeSession, setActiveSession] = useState<GymSession | null>(null);
  const [sessionExercises, setSessionExercises] = useState<SessionExercise[]>([]);
  const [lastWeights, setLastWeights] = useState<Record<string, { weight_kg: number; reps: number | null }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [muscleFilter, setMuscleFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [editingSet, setEditingSet] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editReps, setEditReps] = useState('');

  const [addingSetFor, setAddingSetFor] = useState<string | null>(null);
  const [newWeight, setNewWeight] = useState('');
  const [newReps, setNewReps] = useState('');

  const [sessionName, setSessionName] = useState('');
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [saveAsRoutine, setSaveAsRoutine] = useState(false);
  const [routineName, setRoutineName] = useState('');

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [showRoutines, setShowRoutines] = useState(false);

  const [sessionStats, setSessionStats] = useState<SessionStat[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'week' | 'month' | 'all'>('month');

  const [progressExerciseId, setProgressExerciseId] = useState('');
  const [progressData, setProgressData] = useState<ExerciseProgress[]>([]);
  const [progressLoading, setProgressLoading] = useState(false);

  const [infoExerciseId, setInfoExerciseId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const [showPastDatePicker, setShowPastDatePicker] = useState(false);
  const [pastDate, setPastDate] = useState('');

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [showCreateExercise, setShowCreateExercise] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExMuscle, setNewExMuscle] = useState('');
  const [newExSplit, setNewExSplit] = useState('');
  const [newExDescription, setNewExDescription] = useState('');
  const [newExSafety, setNewExSafety] = useState('');
  const [creatingExercise, setCreatingExercise] = useState(false);

  const [editingExercise, setEditingExercise] = useState<GymExercise | null>(null);
  const [editExName, setEditExName] = useState('');
  const [editExMuscle, setEditExMuscle] = useState('');
  const [editExSplit, setEditExSplit] = useState('');
  const [editExDescription, setEditExDescription] = useState('');
  const [editExSafety, setEditExSafety] = useState('');
  const [savingExercise, setSavingExercise] = useState(false);

  const [newSetNotes, setNewSetNotes] = useState('');
  const [editSetNotes, setEditSetNotes] = useState('');
  const [hoveredNoteSetId, setHoveredNoteSetId] = useState<string | null>(null);

  const [timerTick, setTimerTick] = useState(Date.now());

  const today = useMemo(() => getSydneyDateString(), []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (view !== 'active') return;
    const interval = setInterval(() => setTimerTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [view]);

  async function loadData() {
    setLoading(true);
    try {
      const [exRes, sessRes, lwRes, rtRes, statsRes] = await Promise.all([
        fetch('/api/gym/exercises'),
        fetch('/api/gym/sessions'),
        fetch('/api/gym/last-weights'),
        fetch('/api/gym/routines'),
        fetch('/api/gym/session-stats'),
      ]);
      const [exData, sessData, lwData, rtData, statsData] = await Promise.all([
        exRes.json(), sessRes.json(), lwRes.json(), rtRes.json(), statsRes.json(),
      ]);
      if (exData.ok) {
        setExercises(exData.exercises);
        if (exData.userId) setCurrentUserId(exData.userId);
      }
      if (sessData.ok) setSessions(sessData.sessions);
      if (lwData.ok) setLastWeights(lwData.lastWeights);
      if (rtData.ok) setRoutines(rtData.routines);
      if (statsData.ok) setSessionStats(statsData.sessions);

      if (sessData.ok) {
        const active = sessData.sessions.find((s: GymSession) => s.status === 'active');
        if (active) {
          await loadActiveSession(active.id);
          setView('active');
        }
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function loadExerciseProgress(exerciseId: string) {
    if (!exerciseId) return;
    setProgressLoading(true);
    try {
      const res = await fetch(`/api/gym/exercise-progress?exercise_id=${exerciseId}`);
      const data = await res.json();
      if (data.ok) setProgressData(data.progress);
    } catch (e: any) {
      setError(e.message);
    }
    setProgressLoading(false);
  }

  async function loadActiveSession(sessionId: string) {
    const res = await fetch(`/api/gym/sessions/${sessionId}`);
    const data = await res.json();
    if (data.ok) {
      setActiveSession(data.session);
      setSessionExercises(data.exercises);
      setSessionName(data.session.name || '');
    }
  }

  async function startNewSession(dateOverride?: string) {
    try {
      const res = await fetch('/api/gym/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_date: dateOverride || today }),
      });
      const data = await res.json();
      if (data.ok) {
        setActiveSession(data.session);
        setSessionExercises([]);
        setSessionName('');
        setShowPastDatePicker(false);
        setPastDate('');
        setView('active');
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function addExerciseToSession(exerciseId: string) {
    if (!activeSession) return;
    try {
      const res = await fetch(`/api/gym/sessions/${activeSession.id}/exercises`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercise_id: exerciseId }),
      });
      const data = await res.json();
      if (data.ok) {
        await loadActiveSession(activeSession.id);
        setView('active');
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function removeExerciseFromSession(sessionExerciseId: string) {
    if (!activeSession) return;
    try {
      await fetch(`/api/gym/sessions/${activeSession.id}/exercises`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_exercise_id: sessionExerciseId }),
      });
      await loadActiveSession(activeSession.id);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function addSet(sessionExerciseId: string, exerciseId: string) {
    if (!activeSession) return;
    const defaultWeight = lastWeights[exerciseId]?.weight_kg || 0;
    const defaultReps = lastWeights[exerciseId]?.reps || 10;
    const weightVal = newWeight !== '' ? parseFloat(newWeight) : defaultWeight;
    const repsVal = newReps !== '' ? parseInt(newReps) : defaultReps;

    try {
      await fetch(`/api/gym/sessions/${activeSession.id}/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_exercise_id: sessionExerciseId,
          weight_kg: weightVal,
          reps: repsVal,
          notes: newSetNotes.trim() || undefined,
        }),
      });
      setAddingSetFor(null);
      setNewWeight('');
      setNewReps('');
      setNewSetNotes('');
      await loadActiveSession(activeSession.id);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function updateSet(setId: string) {
    if (!activeSession) return;
    try {
      await fetch(`/api/gym/sessions/${activeSession.id}/sets`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          set_id: setId,
          weight_kg: editWeight !== '' ? parseFloat(editWeight) : null,
          reps: editReps !== '' ? parseInt(editReps) : null,
          notes: editSetNotes.trim() || null,
        }),
      });
      setEditingSet(null);
      setEditSetNotes('');
      await loadActiveSession(activeSession.id);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function deleteSet(setId: string) {
    if (!activeSession) return;
    try {
      await fetch(`/api/gym/sessions/${activeSession.id}/sets`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set_id: setId }),
      });
      await loadActiveSession(activeSession.id);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function finishSession() {
    if (!activeSession) return;
    try {
      await fetch('/api/gym/finish-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSession.id,
          name: sessionName.trim() || null,
        }),
      });
      setActiveSession(null);
      setSessionExercises([]);
      setShowFinishConfirm(false);
      setSaveAsRoutine(false);
      setRoutineName('');
      setView('home');
      await loadData();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function saveSessionAsRoutine() {
    if (!activeSession || !routineName.trim()) return;
    try {
      const exerciseData = sessionExercises.map((ex, i) => ({
        exercise_id: ex.exercise_id,
        default_sets: ex.sets.length || 3,
        default_reps: ex.sets.length > 0 ? (ex.sets[0].reps || 10) : 10,
        default_weight_kg: ex.sets.length > 0 ? ex.sets[0].weight_kg : null,
      }));

      await fetch('/api/gym/routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: routineName.trim(),
          exercises: exerciseData,
        }),
      });
      setSaveAsRoutine(false);
      setRoutineName('');
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function startSessionFromRoutine(routine: Routine, dateOverride?: string) {
    try {
      const res = await fetch('/api/gym/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_date: dateOverride || today, name: routine.name }),
      });
      const data = await res.json();
      if (data.ok) {
        const newSessionId = data.session.id;
        for (const ex of routine.exercises) {
          await fetch(`/api/gym/sessions/${newSessionId}/exercises`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exercise_id: ex.exercise_id }),
          });
        }
        setShowPastDatePicker(false);
        setPastDate('');
        await loadActiveSession(newSessionId);
        setView('active');
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function deleteRoutine(routineId: string) {
    try {
      await fetch('/api/gym/routines', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routine_id: routineId }),
      });
      setRoutines(prev => prev.filter(r => r.id !== routineId));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function cancelSession() {
    if (!activeSession) return;
    try {
      await fetch(`/api/gym/sessions/${activeSession.id}`, {
        method: 'DELETE',
      });
      setActiveSession(null);
      setSessionExercises([]);
      setView('home');
      loadData();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function createExercise() {
    if (!newExName.trim()) return;
    setCreatingExercise(true);
    try {
      const res = await fetch('/api/gym/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newExName.trim(),
          muscle_group: newExMuscle.trim() || undefined,
          split_category: newExSplit.trim() || undefined,
          description: newExDescription.trim() || undefined,
          safety_guide: newExSafety.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setExercises(prev => [...prev, data.exercise].sort((a, b) => {
          if (a.muscle_group !== b.muscle_group) return a.muscle_group.localeCompare(b.muscle_group);
          return a.name.localeCompare(b.name);
        }));
        setNewExName('');
        setNewExMuscle('');
        setNewExSplit('');
        setNewExDescription('');
        setNewExSafety('');
        setShowCreateExercise(false);
        if (activeSession) {
          await addExerciseToSession(data.exercise.id);
        }
      } else {
        setError(data.error || 'Failed to create exercise');
      }
    } catch (e: any) {
      setError(e.message);
    }
    setCreatingExercise(false);
  }

  async function saveEditExercise() {
    if (!editingExercise) return;
    setSavingExercise(true);
    try {
      const res = await fetch('/api/gym/exercises', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingExercise.id,
          name: editExName.trim() || undefined,
          muscle_group: editExMuscle.trim() || undefined,
          split_category: editExSplit,
          description: editExDescription,
          safety_guide: editExSafety,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setExercises(prev => prev.map(ex => ex.id === data.exercise.id ? data.exercise : ex));
        setEditingExercise(null);
      } else {
        setError(data.error || 'Failed to update exercise');
      }
    } catch (e: any) {
      setError(e.message);
    }
    setSavingExercise(false);
  }

  function startEditExercise(ex: GymExercise) {
    setEditingExercise(ex);
    setEditExName(ex.name);
    setEditExMuscle(ex.muscle_group === 'Other' ? '' : ex.muscle_group);
    setEditExSplit(ex.split_category || '');
    setEditExDescription(ex.description || '');
    setEditExSafety(ex.safety_guide || '');
  }

  const filteredExercises = useMemo(() => {
    return exercises.filter(ex => {
      if (muscleFilter !== 'All' && ex.muscle_group !== muscleFilter) return false;
      if (searchQuery && !ex.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [exercises, muscleFilter, searchQuery]);

  const completedSessions = useMemo(() => {
    return sessions.filter(s => s.status === 'completed').slice(0, 20);
  }, [sessions]);

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'all') return sessionStats;
    const todayStr = getSydneyDateString();
    const todayParts = todayStr.split('-').map(Number);
    const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);

    let cutoff: Date;
    if (historyFilter === 'week') {
      cutoff = new Date(todayDate);
      cutoff.setDate(cutoff.getDate() - 7);
    } else {
      cutoff = new Date(todayDate);
      cutoff.setMonth(cutoff.getMonth() - 1);
    }
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    return sessionStats.filter(s => s.session_date >= cutoffStr);
  }, [sessionStats, historyFilter]);

  const exercisesUsedInSessions = useMemo(() => {
    const ids = new Set<string>();
    for (const lw of Object.keys(lastWeights)) {
      ids.add(lw);
    }
    return exercises.filter(ex => ids.has(ex.id));
  }, [exercises, lastWeights]);

  if (loading) {
    return (
      <section className="mb-8">
        <div className="bg-gray-800 rounded-lg p-6 border border-orange-700/50 text-center">
          <div className="animate-pulse text-orange-400">Loading Sesh...</div>
        </div>
      </section>
    );
  }

  // BROWSE VIEW - Exercise Library
  if (view === 'browse') {
    return (
      <section className="mb-8" data-testid="sesh-browse">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => { setView('active'); setShowCreateExercise(false); setEditingExercise(null); }}
            className="bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm"
            data-testid="btn-back-to-session"
          >
            Back
          </button>
          <h2 className="text-lg font-semibold text-orange-400">Exercise Library</h2>
        </div>

        {/* Create New Exercise Button / Form */}
        {!showCreateExercise && !editingExercise ? (
          <button
            onClick={() => setShowCreateExercise(true)}
            className="w-full bg-green-600/20 border border-green-600/50 rounded-lg py-3 text-green-400 text-sm font-medium mb-3"
            data-testid="btn-show-create-exercise"
          >
            + Create New Exercise
          </button>
        ) : showCreateExercise ? (
          <div className="bg-gray-800 border border-green-600/50 rounded-lg p-4 mb-3" data-testid="create-exercise-form">
            <h3 className="text-green-400 font-semibold text-sm mb-3">Create New Exercise</h3>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Exercise name *"
                value={newExName}
                onChange={(e) => setNewExName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                autoFocus
                data-testid="input-new-exercise-name"
              />
              <select
                value={newExMuscle}
                onChange={(e) => setNewExMuscle(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                data-testid="select-new-exercise-muscle"
              >
                <option value="">Muscle Group (optional)</option>
                {MUSCLE_GROUPS.filter(mg => mg !== 'All').map(mg => (
                  <option key={mg} value={mg}>{mg}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Split category (optional)"
                value={newExSplit}
                onChange={(e) => setNewExSplit(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                data-testid="input-new-exercise-split"
              />
              <textarea
                placeholder="Description (optional)"
                value={newExDescription}
                onChange={(e) => setNewExDescription(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
                rows={2}
                data-testid="input-new-exercise-description"
              />
              <textarea
                placeholder="Safety guide (optional)"
                value={newExSafety}
                onChange={(e) => setNewExSafety(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
                rows={2}
                data-testid="input-new-exercise-safety"
              />
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={createExercise}
                disabled={!newExName.trim() || creatingExercise}
                className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
                data-testid="btn-confirm-create-exercise"
              >
                {creatingExercise ? 'Creating...' : activeSession ? 'Create & Add to Session' : 'Create Exercise'}
              </button>
              <button
                onClick={() => { setShowCreateExercise(false); setNewExName(''); setNewExMuscle(''); setNewExSplit(''); setNewExDescription(''); setNewExSafety(''); }}
                className="px-4 bg-gray-700 text-gray-300 py-2.5 rounded-lg text-sm"
                data-testid="btn-cancel-create-exercise"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : editingExercise ? (
          <div className="bg-gray-800 border border-blue-600/50 rounded-lg p-4 mb-3" data-testid="edit-exercise-form">
            <h3 className="text-blue-400 font-semibold text-sm mb-3">Edit Exercise: {editingExercise.name}</h3>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Exercise name *"
                value={editExName}
                onChange={(e) => setEditExName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                data-testid="input-edit-exercise-name"
              />
              <select
                value={editExMuscle}
                onChange={(e) => setEditExMuscle(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                data-testid="select-edit-exercise-muscle"
              >
                <option value="">Muscle Group (optional)</option>
                {MUSCLE_GROUPS.filter(mg => mg !== 'All').map(mg => (
                  <option key={mg} value={mg}>{mg}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Split category (optional)"
                value={editExSplit}
                onChange={(e) => setEditExSplit(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                data-testid="input-edit-exercise-split"
              />
              <textarea
                placeholder="Description (optional)"
                value={editExDescription}
                onChange={(e) => setEditExDescription(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
                rows={2}
                data-testid="input-edit-exercise-description"
              />
              <textarea
                placeholder="Safety guide (optional)"
                value={editExSafety}
                onChange={(e) => setEditExSafety(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
                rows={2}
                data-testid="input-edit-exercise-safety"
              />
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={saveEditExercise}
                disabled={!editExName.trim() || savingExercise}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
                data-testid="btn-confirm-edit-exercise"
              >
                {savingExercise ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditingExercise(null)}
                className="px-4 bg-gray-700 text-gray-300 py-2.5 rounded-lg text-sm"
                data-testid="btn-cancel-edit-exercise"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <input
          type="text"
          placeholder="Search exercises..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white mb-3 text-base"
          data-testid="input-exercise-search"
        />

        <div className="flex flex-wrap gap-2 mb-4">
          {MUSCLE_GROUPS.map(mg => (
            <button
              key={mg}
              onClick={() => setMuscleFilter(mg)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                muscleFilter === mg
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-700 text-gray-300'
              }`}
              data-testid={`filter-muscle-${mg.toLowerCase()}`}
            >
              {mg}
            </button>
          ))}
        </div>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {filteredExercises.map(ex => (
            <div key={ex.id} className="relative">
              <div className="flex items-stretch bg-gray-800 border border-gray-700 rounded-lg hover:border-orange-600 transition-colors">
                <button
                  onClick={() => addExerciseToSession(ex.id)}
                  className="flex-1 text-left p-3 min-w-0"
                  data-testid={`exercise-${ex.id}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm">
                        {ex.name}
                        {ex.is_custom && <span className="text-green-500 text-[10px] ml-1.5 font-normal">CUSTOM</span>}
                      </p>
                      <p className="text-gray-400 text-xs mt-0.5">
                        {ex.muscle_group === 'Other' && !ex.split_category ? (
                          <span className="text-amber-500/70 italic">To be added</span>
                        ) : (
                          <>{ex.muscle_group} {ex.split_category ? `\u00B7 ${ex.split_category}` : ''}</>
                        )}
                      </p>
                      {lastWeights[ex.id] && (
                        <p className="text-orange-400 text-xs mt-1">
                          Last: {lastWeights[ex.id].weight_kg}kg {lastWeights[ex.id].reps ? `x ${lastWeights[ex.id].reps}` : ''}
                        </p>
                      )}
                    </div>
                    <span className="text-orange-500 text-xl ml-2">+</span>
                  </div>
                </button>
                {ex.is_custom && ex.created_by_user_id === currentUserId && (
                  <button
                    onClick={(e) => { e.stopPropagation(); startEditExercise(ex); setShowCreateExercise(false); }}
                    className="flex items-center px-2 text-blue-400 hover:text-blue-300 transition-colors border-l border-gray-700"
                    data-testid={`btn-edit-exercise-${ex.id}`}
                    title="Edit exercise"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setInfoExerciseId(infoExerciseId === ex.id ? null : ex.id); }}
                  className="flex items-center px-3 text-gray-400 hover:text-blue-400 transition-colors border-l border-gray-700"
                  data-testid={`btn-info-browse-${ex.id}`}
                  title="Exercise info"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                </button>
              </div>
              {infoExerciseId === ex.id && (
                <div className="bg-gray-900 border border-gray-600 rounded-lg p-3 mt-1 text-xs space-y-1.5" data-testid={`info-popup-${ex.id}`}>
                  <div className="flex justify-between items-start">
                    <p className="text-orange-400 font-semibold text-sm">{ex.name}</p>
                    <button onClick={() => setInfoExerciseId(null)} className="text-gray-500 hover:text-gray-300 ml-2">✕</button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <div><span className="text-gray-500">Muscle Group:</span> <span className="text-gray-200">{ex.muscle_group === 'Other' ? <span className="text-amber-500/70 italic">To be added</span> : ex.muscle_group}</span></div>
                    <div><span className="text-gray-500">Split:</span> <span className="text-gray-200">{ex.split_category || <span className="text-amber-500/70 italic">To be added</span>}</span></div>
                  </div>
                  <div><span className="text-gray-500">Description:</span> <span className="text-gray-300">{ex.description || <span className="text-amber-500/70 italic">To be added</span>}</span></div>
                  <div className={ex.safety_guide ? "bg-yellow-900/20 border border-yellow-800/30 rounded p-2" : ""}>
                    <span className="text-gray-500">{ex.safety_guide ? '' : ''}<span className={ex.safety_guide ? "text-yellow-500 font-medium" : "text-gray-500"}>Safety:</span></span> <span className={ex.safety_guide ? "text-yellow-200/80" : ""}>{ex.safety_guide || <span className="text-amber-500/70 italic">To be added</span>}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
          {filteredExercises.length === 0 && (
            <p className="text-gray-500 text-center py-4">No exercises found</p>
          )}
        </div>
      </section>
    );
  }

  // HISTORY VIEW
  if (view === 'history') {
    const totalVolumeFiltered = filteredHistory.reduce((sum, s) => sum + s.total_volume, 0);
    const totalSetsFiltered = filteredHistory.reduce((sum, s) => sum + s.set_count, 0);

    return (
      <section className="mb-8" data-testid="sesh-history">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setView('home')}
            className="bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm"
            data-testid="btn-back-from-history"
          >
            Back
          </button>
          <h2 className="text-lg font-semibold text-orange-400">Session History</h2>
        </div>

        <div className="flex gap-2 mb-3">
          {(['week', 'month', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setHistoryFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                historyFilter === f
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-700 text-gray-300'
              }`}
              data-testid={`history-filter-${f}`}
            >
              {f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : 'All Time'}
            </button>
          ))}
        </div>

        {filteredHistory.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 text-center">
              <p className="text-lg font-bold text-orange-400">{filteredHistory.length}</p>
              <p className="text-gray-500 text-[10px]">Sessions</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 text-center">
              <p className="text-lg font-bold text-orange-400">{totalSetsFiltered}</p>
              <p className="text-gray-500 text-[10px]">Total Sets</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 text-center">
              <p className="text-lg font-bold text-orange-400">{Math.round(totalVolumeFiltered).toLocaleString()}</p>
              <p className="text-gray-500 text-[10px]">Volume (kg)</p>
            </div>
          </div>
        )}

        {filteredHistory.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center">
            <p className="text-gray-400">No sessions in this period</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredHistory.map(sess => (
              <SessionHistoryCard
                key={sess.id}
                session={sess}
                volumeKg={sess.total_volume}
                exerciseCount={sess.exercise_count}
                setCount={sess.set_count}
                finishedAt={sess.finished_at}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  // PROGRESS VIEW - Exercise Weight Progression Chart
  if (view === 'progress') {
    return (
      <section className="mb-8" data-testid="sesh-progress">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setView('home')}
            className="bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm"
            data-testid="btn-back-from-progress"
          >
            Back
          </button>
          <h2 className="text-lg font-semibold text-orange-400">Exercise Progress</h2>
        </div>

        <select
          value={progressExerciseId}
          onChange={(e) => {
            setProgressExerciseId(e.target.value);
            if (e.target.value) loadExerciseProgress(e.target.value);
          }}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white mb-4 text-sm"
          data-testid="select-progress-exercise"
        >
          <option value="">Select an exercise...</option>
          {exercisesUsedInSessions.length > 0 ? (
            exercisesUsedInSessions.map(ex => (
              <option key={ex.id} value={ex.id}>{ex.name} ({ex.muscle_group})</option>
            ))
          ) : (
            exercises.filter(ex => !ex.is_custom).slice(0, 30).map(ex => (
              <option key={ex.id} value={ex.id}>{ex.name} ({ex.muscle_group})</option>
            ))
          )}
        </select>

        {progressLoading && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center">
            <div className="animate-pulse text-orange-400">Loading progress...</div>
          </div>
        )}

        {!progressLoading && progressExerciseId && progressData.length === 0 && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center">
            <p className="text-gray-400">No data yet for this exercise</p>
            <p className="text-gray-500 text-sm mt-1">Complete a sesh with this exercise to see progress</p>
          </div>
        )}

        {!progressLoading && progressData.length > 0 && (
          <div>
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-4">
              <h3 className="text-gray-300 text-sm font-medium mb-3">Weight Progression (kg)</h3>
              <ExerciseChart data={progressData} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 text-center">
                <p className="text-lg font-bold text-orange-400">
                  {Math.max(...progressData.map(d => d.max_weight))} kg
                </p>
                <p className="text-gray-500 text-xs">Personal Best</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 text-center">
                <p className="text-lg font-bold text-orange-400">{progressData.length}</p>
                <p className="text-gray-500 text-xs">Sessions Tracked</p>
              </div>
            </div>

            <div className="mt-4 space-y-1">
              <h3 className="text-gray-300 text-sm font-medium mb-2">Session Log</h3>
              {progressData.slice().reverse().map((d, i) => (
                <div key={i} className="flex justify-between text-xs py-1 border-b border-gray-700/50">
                  <span className="text-gray-400">{formatDateDDMMYYYY(d.date)}</span>
                  <span className="text-white">{d.max_weight} kg x {d.max_reps} reps</span>
                  <span className="text-gray-500">{d.total_sets} sets</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  // ACTIVE SESSION VIEW
  if (view === 'active' && activeSession) {
    const totalSets = sessionExercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    const totalVolume = sessionExercises.reduce((sum, ex) =>
      sum + ex.sets.reduce((s, set) => s + (set.weight_kg || 0) * (set.reps || 0), 0), 0
    );

    const allSetsFlat = sessionExercises
      .flatMap(ex => ex.sets)
      .filter(s => s.created_at)
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

    const firstSetAt = allSetsFlat[0]?.created_at ?? null;
    const lastSetAt = allSetsFlat[allSetsFlat.length - 1]?.created_at ?? null;
    const elapsedMs = firstSetAt ? timerTick - new Date(firstSetAt).getTime() : null;
    const sinceLastMs = lastSetAt ? timerTick - new Date(lastSetAt).getTime() : null;

    return (
      <section className="mb-8" data-testid="sesh-active">
        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 mb-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="bg-gray-800 rounded-lg p-4 border border-orange-700/50 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <input
                type="text"
                placeholder="Session name (optional)"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                className="bg-transparent border-none text-white font-semibold text-lg p-0 focus:outline-none focus:ring-0 placeholder-gray-500 w-full"
                data-testid="input-session-name"
              />
              <p className="text-gray-400 text-xs mt-1">{formatDateDDMMYYYY(activeSession.session_date)}</p>
            </div>
            <span className="bg-orange-600 text-white text-xs px-2 py-1 rounded">ACTIVE</span>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-gray-400">{sessionExercises.length} exercises</span>
            <span className="text-gray-400">{totalSets} sets</span>
            <span className="text-orange-400 font-medium">{Math.round(totalVolume).toLocaleString()} kg vol</span>
          </div>
          {elapsedMs !== null && (
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700">
              <span className="text-gray-300 text-xs font-mono" data-testid="timer-elapsed">
                ⏱ {formatDuration(elapsedMs)} elapsed
              </span>
              {sinceLastMs !== null && (
                <span
                  className={`text-xs font-mono ${sinceLastMs > 3 * 60 * 1000 ? 'text-orange-400' : 'text-green-400'}`}
                  data-testid="timer-last-set"
                >
                  Last set: {formatDuration(sinceLastMs)} ago
                </span>
              )}
            </div>
          )}
        </div>

        {sessionExercises.map((ex, idx) => {
          const exInfo = exercises.find(e => e.id === ex.exercise_id);
          return (
          <div key={ex.id} className="bg-gray-800 rounded-lg border border-gray-700 mb-3" data-testid={`session-exercise-${idx}`}>
            <div className="flex items-center justify-between p-3 border-b border-gray-700">
              <div className="flex items-center gap-2 min-w-0">
                <div className="min-w-0">
                  <p className="text-white font-medium text-sm">{ex.exercise_name}</p>
                  <p className="text-gray-500 text-xs">{ex.muscle_group}</p>
                </div>
                <button
                  onClick={() => setInfoExerciseId(infoExerciseId === ex.exercise_id ? null : ex.exercise_id)}
                  className="text-gray-400 hover:text-blue-400 transition-colors flex-shrink-0"
                  data-testid={`btn-info-session-${idx}`}
                  title="Exercise info"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                </button>
              </div>
              {confirmRemoveId === ex.id ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-gray-400 text-xs">Remove exercise?</span>
                  <button
                    onClick={() => { removeExerciseFromSession(ex.id); setConfirmRemoveId(null); }}
                    className="text-white bg-red-600 text-xs px-2 py-1 rounded"
                    data-testid={`btn-confirm-remove-exercise-${idx}`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmRemoveId(null)}
                    className="text-gray-300 bg-gray-700 text-xs px-2 py-1 rounded"
                    data-testid={`btn-cancel-remove-exercise-${idx}`}
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmRemoveId(ex.id)}
                  className="text-red-500 text-xs px-2 py-1 hover:bg-red-900/30 rounded flex-shrink-0"
                  data-testid={`btn-remove-exercise-${idx}`}
                >
                  Remove
                </button>
              )}
            </div>

            {infoExerciseId === ex.exercise_id && exInfo && (
              <div className="bg-gray-900 border-b border-gray-600 p-3 text-xs space-y-1.5" data-testid={`info-popup-session-${idx}`}>
                <div className="flex justify-between items-start">
                  <p className="text-orange-400 font-semibold text-sm">{exInfo.name}</p>
                  <button onClick={() => setInfoExerciseId(null)} className="text-gray-500 hover:text-gray-300 ml-2">✕</button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div><span className="text-gray-500">Muscle Group:</span> <span className="text-gray-200">{exInfo.muscle_group === 'Other' ? <span className="text-amber-500/70 italic">To be added</span> : exInfo.muscle_group}</span></div>
                  <div><span className="text-gray-500">Split:</span> <span className="text-gray-200">{exInfo.split_category || <span className="text-amber-500/70 italic">To be added</span>}</span></div>
                </div>
                <div><span className="text-gray-500">Description:</span> <span className="text-gray-300">{exInfo.description || <span className="text-amber-500/70 italic">To be added</span>}</span></div>
                {exInfo.safety_guide ? (
                  <div className="bg-yellow-900/20 border border-yellow-800/30 rounded p-2">
                    <span className="text-yellow-500 font-medium">Safety:</span> <span className="text-yellow-200/80">{exInfo.safety_guide}</span>
                  </div>
                ) : (
                  <div><span className="text-gray-500">Safety:</span> <span className="text-amber-500/70 italic">To be added</span></div>
                )}
              </div>
            )}

            <div className="p-3">
              <div className="grid grid-cols-[40px_1fr_1fr_60px] gap-2 text-xs text-gray-500 mb-1 px-1">
                <span>Set</span>
                <span>Weight (kg)</span>
                <span>Reps</span>
                <span></span>
              </div>
              {ex.sets.length > 0 && (
                <div className="mb-2">
                  {ex.sets.map((set) => (
                    <div key={set.id}>
                      <div className="grid grid-cols-[40px_1fr_1fr_60px] gap-2 items-center mb-1">
                        <span className={`text-xs ${set.is_warmup ? 'text-yellow-500' : 'text-gray-400'}`}>
                          {set.is_warmup ? 'W' : set.set_number}
                        </span>
                        {editingSet === set.id ? (
                          <>
                            <input
                              type="number"
                              value={editWeight}
                              onChange={(e) => setEditWeight(e.target.value)}
                              className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-sm w-full"
                              inputMode="decimal"
                              data-testid={`input-edit-weight-${set.id}`}
                            />
                            <input
                              type="number"
                              value={editReps}
                              onChange={(e) => setEditReps(e.target.value)}
                              className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-sm w-full"
                              inputMode="numeric"
                              data-testid={`input-edit-reps-${set.id}`}
                            />
                            <div className="flex gap-1">
                              <button onClick={() => updateSet(set.id)} className="text-green-500 text-xs px-1">Save</button>
                              <button onClick={() => { setEditingSet(null); setEditSetNotes(''); }} className="text-gray-500 text-xs px-1">X</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span
                              className="text-white text-sm cursor-pointer hover:text-orange-400"
                              onClick={() => { setEditingSet(set.id); setEditWeight(String(set.weight_kg || '')); setEditReps(String(set.reps || '')); setEditSetNotes(set.notes || ''); }}
                            >
                              {set.weight_kg !== null ? `${set.weight_kg}` : '-'}
                            </span>
                            <span className="flex items-center gap-1">
                              <span
                                className="text-white text-sm cursor-pointer hover:text-orange-400"
                                onClick={() => { setEditingSet(set.id); setEditWeight(String(set.weight_kg || '')); setEditReps(String(set.reps || '')); setEditSetNotes(set.notes || ''); }}
                              >
                                {set.reps !== null ? set.reps : '-'}
                              </span>
                              {set.notes && (
                                <span
                                  className="relative"
                                  onMouseEnter={() => setHoveredNoteSetId(set.id)}
                                  onMouseLeave={() => setHoveredNoteSetId(null)}
                                  onClick={() => setHoveredNoteSetId(hoveredNoteSetId === set.id ? null : set.id)}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400 cursor-pointer"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                  {hoveredNoteSetId === set.id && (
                                    <div className="absolute bottom-full left-0 mb-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-200 whitespace-pre-wrap max-w-[200px] z-10 shadow-lg" data-testid={`set-note-popup-${set.id}`}>
                                      {set.notes}
                                    </div>
                                  )}
                                </span>
                              )}
                            </span>
                            <button
                              onClick={() => deleteSet(set.id)}
                              className="text-red-500/60 text-xs hover:text-red-400"
                              data-testid={`btn-delete-set-${set.id}`}
                            >
                              Del
                            </button>
                          </>
                        )}
                      </div>
                      {editingSet === set.id && (
                        <div className="ml-10 mb-2">
                          <input
                            type="text"
                            placeholder="Set notes (optional)"
                            value={editSetNotes}
                            onChange={(e) => setEditSetNotes(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs"
                            data-testid={`input-edit-notes-${set.id}`}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {addingSetFor === ex.id ? (
                <div className="mt-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-5 shrink-0 text-center">{ex.sets.length + 1}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        placeholder={lastWeights[ex.exercise_id]?.weight_kg?.toString() || '0'}
                        value={newWeight}
                        onChange={(e) => setNewWeight(e.target.value)}
                        className="bg-gray-700 border border-orange-600/50 rounded px-2 py-2 text-white text-sm w-[72px]"
                        inputMode="decimal"
                        autoFocus
                        data-testid="input-new-weight"
                      />
                      <input
                        type="number"
                        placeholder={lastWeights[ex.exercise_id]?.reps?.toString() || '10'}
                        value={newReps}
                        onChange={(e) => setNewReps(e.target.value)}
                        className="bg-gray-700 border border-orange-600/50 rounded px-2 py-2 text-white text-sm w-[60px]"
                        inputMode="numeric"
                        data-testid="input-new-reps"
                      />
                    </div>
                    <button
                      onClick={() => addSet(ex.id, ex.exercise_id)}
                      className="bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded px-4 py-2 flex-1 min-w-[60px]"
                      data-testid="btn-confirm-add-set"
                    >
                      OK
                    </button>
                    <button
                      onClick={() => { setAddingSetFor(null); setNewWeight(''); setNewReps(''); setNewSetNotes(''); }}
                      className="text-gray-500 hover:text-gray-300 text-sm px-2 py-2 shrink-0"
                      data-testid="btn-cancel-add-set"
                    >
                      X
                    </button>
                  </div>
                  <div className="ml-7">
                    <input
                      type="text"
                      placeholder="Set notes (optional)"
                      value={newSetNotes}
                      onChange={(e) => setNewSetNotes(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs"
                      data-testid="input-new-set-notes"
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setAddingSetFor(ex.id);
                    const lw = lastWeights[ex.exercise_id];
                    if (lw) {
                      setNewWeight(String(lw.weight_kg));
                      setNewReps(String(lw.reps || 10));
                    } else if (ex.sets.length > 0) {
                      const lastSet = ex.sets[ex.sets.length - 1];
                      setNewWeight(String(lastSet.weight_kg || ''));
                      setNewReps(String(lastSet.reps || ''));
                    } else {
                      setNewWeight('');
                      setNewReps('');
                    }
                  }}
                  className="w-full bg-orange-600/20 border border-orange-600/40 rounded-lg py-2.5 text-orange-400 text-sm font-medium mt-1"
                  data-testid={`btn-add-set-${idx}`}
                >
                  + Add Set
                </button>
              )}
            </div>
          </div>
          );
        })}

        <button
          onClick={() => { setView('browse'); setSearchQuery(''); setMuscleFilter('All'); }}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 text-white font-medium mb-3"
          data-testid="btn-add-exercise"
        >
          + Add Exercise
        </button>

        <div className="flex gap-2">
          <button
            onClick={() => setShowFinishConfirm(true)}
            className="flex-1 bg-green-600 rounded-lg py-3 text-white font-semibold"
            data-testid="btn-finish-sesh"
            disabled={sessionExercises.length === 0}
          >
            Finish Sesh
          </button>
          <button
            onClick={cancelSession}
            className="bg-red-600/20 border border-red-600/40 rounded-lg px-4 py-3 text-red-400 text-sm"
            data-testid="btn-cancel-sesh"
          >
            Cancel
          </button>
        </div>

        {showFinishConfirm && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" data-testid="finish-confirm-modal">
            <div className="bg-gray-800 rounded-xl p-6 max-w-sm w-full border border-gray-700">
              <h3 className="text-white text-lg font-semibold mb-2">Finish Session?</h3>
              <p className="text-gray-400 text-sm mb-4">
                {sessionExercises.length} exercises, {totalSets} sets, {Math.round(totalVolume).toLocaleString()} kg total volume
              </p>

              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer" data-testid="toggle-save-routine">
                  <input
                    type="checkbox"
                    checked={saveAsRoutine}
                    onChange={(e) => setSaveAsRoutine(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-700 text-orange-600"
                  />
                  <span className="text-gray-300 text-sm">Save as routine</span>
                </label>
                {saveAsRoutine && (
                  <input
                    type="text"
                    placeholder="Routine name (e.g. Push Day)"
                    value={routineName}
                    onChange={(e) => setRoutineName(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-2"
                    data-testid="input-routine-name"
                  />
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (saveAsRoutine && routineName.trim()) {
                      await saveSessionAsRoutine();
                    }
                    await finishSession();
                  }}
                  className="flex-1 bg-green-600 rounded-lg py-2.5 text-white font-semibold"
                  data-testid="btn-confirm-finish"
                >
                  Finish
                </button>
                <button
                  onClick={() => { setShowFinishConfirm(false); setSaveAsRoutine(false); setRoutineName(''); }}
                  className="flex-1 bg-gray-700 rounded-lg py-2.5 text-gray-300"
                  data-testid="btn-cancel-finish"
                >
                  Keep Going
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  // HOME VIEW - Start Sesh or view history
  return (
    <section className="mb-8" data-testid="sesh-home">
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 mb-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        onClick={() => startNewSession()}
        className="w-full bg-orange-600 rounded-xl py-4 text-white text-lg font-bold mb-3 active:bg-orange-700 transition-colors"
        data-testid="btn-start-sesh"
      >
        Start New Sesh
      </button>

      <button
        onClick={() => { setShowPastDatePicker(!showPastDatePicker); setPastDate(''); }}
        className={`w-full rounded-xl py-3 text-sm font-medium mb-3 transition-colors ${
          showPastDatePicker
            ? 'bg-orange-700 text-white border border-orange-500'
            : 'bg-gray-700 text-gray-200 border border-gray-600'
        }`}
        data-testid="btn-log-past-sesh"
      >
        Log Past Sesh
      </button>

      {showPastDatePicker && (
        <div className="bg-gray-800 rounded-lg border border-orange-600/50 p-4 mb-4" data-testid="past-sesh-picker">
          <p className="text-sm text-gray-300 mb-3">Select the date of your past session:</p>
          <input
            type="date"
            value={pastDate}
            onChange={(e) => setPastDate(e.target.value)}
            max={today}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white mb-3"
            data-testid="input-past-date"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { if (pastDate) startNewSession(pastDate); }}
              disabled={!pastDate}
              className="flex-1 bg-orange-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="btn-start-past-sesh"
            >
              Start Session
            </button>
            <button
              onClick={() => { setShowPastDatePicker(false); setPastDate(''); }}
              className="px-4 bg-gray-700 text-gray-300 py-2.5 rounded-lg text-sm"
              data-testid="btn-cancel-past-sesh"
            >
              Cancel
            </button>
          </div>

          {routines.length > 0 && pastDate && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <p className="text-xs text-gray-400 mb-2">Or load a routine for this date:</p>
              <div className="space-y-2">
                {routines.map(routine => (
                  <button
                    key={routine.id}
                    onClick={() => startSessionFromRoutine(routine, pastDate)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-left flex items-center justify-between"
                    data-testid={`btn-past-routine-${routine.id}`}
                  >
                    <div>
                      <p className="text-white text-sm font-medium">{routine.name}</p>
                      <p className="text-gray-500 text-xs">{routine.exercises.length} exercises</p>
                    </div>
                    <span className="text-orange-400 text-xs font-medium">Load</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 text-center">
          <p className="text-2xl font-bold text-orange-400" data-testid="stat-total-sessions">
            {sessions.filter(s => s.status === 'completed').length}
          </p>
          <p className="text-gray-400 text-xs mt-1">Total Sessions</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 text-center">
          <p className="text-2xl font-bold text-orange-400" data-testid="stat-this-week">
            {sessions.filter(s => {
              if (s.status !== 'completed') return false;
              const d = new Date(s.session_date);
              const now = new Date();
              const weekAgo = new Date(now);
              weekAgo.setDate(weekAgo.getDate() - 7);
              return d >= weekAgo;
            }).length}
          </p>
          <p className="text-gray-400 text-xs mt-1">This Week</p>
        </div>
      </div>

      {routines.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-gray-300 font-medium text-sm">My Routines</h3>
          </div>
          <div className="space-y-2">
            {routines.map(routine => (
              <div key={routine.id} className="bg-gray-800 rounded-lg border border-gray-700 p-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{routine.name}</p>
                  <p className="text-gray-500 text-xs">{routine.exercises.length} exercises</p>
                </div>
                <div className="flex gap-2 ml-2">
                  <button
                    onClick={() => startSessionFromRoutine(routine)}
                    className="bg-orange-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium"
                    data-testid={`btn-load-routine-${routine.id}`}
                  >
                    Load
                  </button>
                  <button
                    onClick={() => deleteRoutine(routine.id)}
                    className="text-red-500/60 text-xs px-2 py-1.5 hover:text-red-400"
                    data-testid={`btn-delete-routine-${routine.id}`}
                  >
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {completedSessions.length > 0 && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setView('history')}
            className="flex-1 bg-gray-700 text-gray-200 text-sm py-2.5 rounded-lg font-medium"
            data-testid="btn-view-history"
          >
            History
          </button>
          <button
            onClick={() => setView('progress')}
            className="flex-1 bg-gray-700 text-gray-200 text-sm py-2.5 rounded-lg font-medium"
            data-testid="btn-view-progress"
          >
            Progress
          </button>
        </div>
      )}

      {completedSessions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-gray-300 font-medium text-sm">Recent Sessions</h3>
            <button
              onClick={() => setView('history')}
              className="text-orange-400 text-xs"
              data-testid="btn-view-all-history"
            >
              View All
            </button>
          </div>
          <div className="space-y-2">
            {completedSessions.slice(0, 5).map(sess => (
              <SessionHistoryCard key={sess.id} session={sess} compact finishedAt={sess.finished_at} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function SessionHistoryCard({ session, compact, volumeKg, exerciseCount, setCount, finishedAt }: {
  session: { id: string; session_date: string; name: string | null };
  compact?: boolean;
  volumeKg?: number;
  exerciseCount?: number;
  setCount?: number;
  finishedAt?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<{ exercises: SessionExercise[] } | null>(null);
  const [hoveredNote, setHoveredNote] = useState<string | null>(null);

  async function loadDetails() {
    if (details) {
      setExpanded(!expanded);
      return;
    }
    try {
      const res = await fetch(`/api/gym/sessions/${session.id}`);
      const data = await res.json();
      if (data.ok) {
        setDetails({ exercises: data.exercises });
        setExpanded(true);
      }
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <button
        onClick={loadDetails}
        className="w-full text-left p-3 flex items-center justify-between"
        data-testid={`history-session-${session.id}`}
      >
        <div>
          <p className="text-white text-sm font-medium">
            {session.name || formatDateDDMMYYYY(session.session_date)}
          </p>
          {session.name && (
            <p className="text-gray-500 text-xs">{formatDateDDMMYYYY(session.session_date)}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {volumeKg !== undefined && (
            <div className="text-right">
              <p className="text-orange-400 text-sm font-medium">{Math.round(volumeKg).toLocaleString()} kg</p>
              {exerciseCount !== undefined && setCount !== undefined && (
                <p className="text-gray-500 text-xs">{exerciseCount} exercises, {setCount} sets</p>
              )}
            </div>
          )}
          <span className="text-gray-500 text-xs">{expanded ? '\u25B2' : '\u25BC'}</span>
        </div>
      </button>
      {expanded && details && (() => {
        const allDetailSets = details.exercises
          .flatMap(ex => ex.sets)
          .filter(s => s.created_at)
          .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

        const firstDetailSetAt = allDetailSets[0]?.created_at ?? null;
        const sessionDurationMs = firstDetailSetAt && finishedAt
          ? new Date(finishedAt).getTime() - new Date(firstDetailSetAt).getTime()
          : null;

        const setTimestampMap = new Map<string, number>();
        allDetailSets.forEach((s, idx) => {
          const prev = allDetailSets[idx - 1];
          if (prev && prev.created_at && s.created_at) {
            setTimestampMap.set(s.id, new Date(s.created_at).getTime() - new Date(prev.created_at).getTime());
          }
        });

        return (
          <div className="border-t border-gray-700 p-3 space-y-2">
            {sessionDurationMs !== null && sessionDurationMs > 0 && (
              <p className="text-gray-500 text-xs pb-1 border-b border-gray-700/50">
                Session time: {formatDuration(sessionDurationMs)}
              </p>
            )}
            {details.exercises.map((ex) => (
              <div key={ex.id}>
                <p className="text-gray-300 text-xs font-medium">{ex.exercise_name} <span className="text-gray-500">({ex.muscle_group})</span></p>
                {ex.sets.map(set => {
                  const splitMs = setTimestampMap.get(set.id);
                  return (
                    <div key={set.id} className="flex items-center gap-1 ml-3">
                      <p className="text-gray-400 text-xs">
                        Set {set.set_number}: {set.weight_kg ?? '-'}kg x {set.reps ?? '-'}
                      </p>
                      {splitMs !== undefined && (
                        <span className="text-gray-600 text-xs font-mono">+{formatDuration(splitMs)}</span>
                      )}
                      {set.notes && (
                        <span
                          className="relative"
                          onMouseEnter={() => setHoveredNote(set.id)}
                          onMouseLeave={() => setHoveredNote(null)}
                          onClick={() => setHoveredNote(hoveredNote === set.id ? null : set.id)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400 cursor-pointer"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                          {hoveredNote === set.id && (
                            <div className="absolute bottom-full left-0 mb-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-200 whitespace-pre-wrap max-w-[200px] z-10 shadow-lg">
                              {set.notes}
                            </div>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {details.exercises.length === 0 && (
              <p className="text-gray-500 text-xs">No exercises recorded</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function ExerciseChart({ data }: { data: ExerciseProgress[] }) {
  const chartData = data.map(d => ({
    date: formatDateDDMMYYYY(d.date).slice(0, 5),
    weight: d.max_weight,
  }));

  return (
    <div style={{ width: '100%', height: 200 }} data-testid="exercise-progress-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#9CA3AF', fontSize: 10 }}
            stroke="#4B5563"
          />
          <YAxis
            tick={{ fill: '#9CA3AF', fontSize: 10 }}
            stroke="#4B5563"
            domain={[(dataMin: number) => Math.max(0, dataMin - 5), (dataMax: number) => dataMax + 5]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#F9FAFB',
              fontSize: 12,
            }}
            formatter={(value: number) => [`${value} kg`, 'Max Weight']}
          />
          <Line
            type="monotone"
            dataKey="weight"
            stroke="#F97316"
            strokeWidth={2}
            dot={{ fill: '#F97316', r: 3 }}
            activeDot={{ r: 5, fill: '#FB923C' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
