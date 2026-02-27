import { useState } from 'react';

interface TaskData {
  id: string;
  name: string;
  unit_type: string;
  target_type: string;
  target_value: string | null;
}

interface EntryData {
  id: string;
  task_id?: string;
  user_id: string;
  entry_date: string;
  value: string | null;
  note?: string | null;
  task_name: string;
  task_unit_type: string;
  username: string;
  entry_type?: string;
  display?: string;
  duration_minutes?: number;
  avg_heart_rate?: number | null;
  calories_burned?: number | null;
  exercise_mode?: string;
}

interface ChallengeEditModalProps {
  challengeId: string;
  initialData: {
    title: string;
    starts_on: string;
    ends_on: string;
    stake_text: string | null;
    stake_amount: string | null;
    description: string | null;
    scope: string;
    template_key: string | null;
    target_weight_kg: string | null;
    target_duration_minutes?: number | null;
    target_avg_heart_rate?: number | null;
    target_calories?: number | null;
    status: string;
  };
  tasks: TaskData[];
  participants?: { user_id: string; username: string }[];
  onClose: () => void;
  onSaved: () => void;
}

export default function ChallengeEditModal({ challengeId, initialData, tasks: initialTasks, participants, onClose, onSaved }: ChallengeEditModalProps) {
  const [title, setTitle] = useState(initialData.title);
  const [startsOn, setStartsOn] = useState(initialData.starts_on);
  const [endsOn, setEndsOn] = useState(initialData.ends_on);
  const [stakeText, setStakeText] = useState(initialData.stake_text || '');
  const [description, setDescription] = useState(initialData.description || '');
  const [targetWeightKg, setTargetWeightKg] = useState(initialData.target_weight_kg || '');
  const [targetDurationMinutes, setTargetDurationMinutes] = useState(String(initialData.target_duration_minutes || ''));
  const [targetAvgHeartRate, setTargetAvgHeartRate] = useState(String(initialData.target_avg_heart_rate || ''));
  const [targetCalories, setTargetCalories] = useState(String(initialData.target_calories || ''));

  const [taskEdits, setTaskEdits] = useState<Record<string, { target_value: string; name: string }>>(
    Object.fromEntries(initialTasks.map(t => [t.id, { target_value: t.target_value || '0', name: t.name }]))
  );

  const [entries, setEntries] = useState<EntryData[]>([]);
  const [entryType, setEntryType] = useState<string>('rep');
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const [showEntries, setShowEntries] = useState(false);
  const [entryEdits, setEntryEdits] = useState<Record<string, { value: string; entry_date: string; avg_heart_rate?: string; calories_burned?: string; exercise_mode?: string }>>({});
  const [entryDeletes, setEntryDeletes] = useState<Set<string>>(new Set());

  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newEntryUserId, setNewEntryUserId] = useState('');
  const [newEntryDate, setNewEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [newEntryValue, setNewEntryValue] = useState('');
  const [newEntryTaskId, setNewEntryTaskId] = useState('');
  const [newFlapsMode, setNewFlapsMode] = useState('HIIT');
  const [newFlapsDuration, setNewFlapsDuration] = useState('');
  const [newFlapsHR, setNewFlapsHR] = useState('');
  const [newFlapsCalories, setNewFlapsCalories] = useState('');
  const [newFlapsNotes, setNewFlapsNotes] = useState('');
  const [addingEntry, setAddingEntry] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const hasTargetWeight = !!initialData.target_weight_kg;
  const isFlapsChallenge = ['lone_flaps', 'flap_off', 'team_flaps'].includes(initialData.template_key || '');

  async function loadEntries() {
    setEntriesLoading(true);
    try {
      const res = await fetch(`/api/warzone/challenges/${challengeId}/entries`);
      const data = await res.json();
      if (data.ok) {
        setEntries(data.entries);
        setEntryType(data.entry_type || 'rep');
        const edits: Record<string, { value: string; entry_date: string; avg_heart_rate?: string; calories_burned?: string; exercise_mode?: string }> = {};
        data.entries.forEach((e: EntryData) => {
          edits[e.id] = {
            value: e.entry_type === 'flaps' ? String(e.duration_minutes || 0) : (e.value || '0'),
            entry_date: e.entry_date,
            avg_heart_rate: e.avg_heart_rate != null ? String(e.avg_heart_rate) : '',
            calories_burned: e.calories_burned != null ? String(e.calories_burned) : '',
            exercise_mode: e.exercise_mode || '',
          };
        });
        setEntryEdits(edits);
        setEntriesLoaded(true);
      }
    } catch (err) {
      console.error('Error loading entries:', err);
    }
    setEntriesLoading(false);
  }

  function toggleEntries() {
    if (!showEntries && !entriesLoaded) {
      loadEntries();
    }
    setShowEntries(!showEntries);
  }

  function updateTaskEdit(taskId: string, field: string, value: string) {
    setTaskEdits(prev => ({
      ...prev,
      [taskId]: { ...prev[taskId], [field]: value },
    }));
  }

  function updateEntryEdit(entryId: string, field: string, value: string) {
    setEntryEdits(prev => ({
      ...prev,
      [entryId]: { ...prev[entryId], [field]: value },
    }));
  }

  function toggleEntryDelete(entryId: string) {
    setEntryDeletes(prev => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  async function handleAddEntry() {
    if (!newEntryUserId) {
      setError('Please select a user');
      return;
    }
    if (!newEntryDate) {
      setError('Please select a date');
      return;
    }

    setAddingEntry(true);
    setError('');

    try {
      let body: any = {
        user_id: newEntryUserId,
        entry_date: newEntryDate,
      };

      if (isFlapsChallenge) {
        if (!newFlapsDuration) {
          setError('Please enter duration');
          setAddingEntry(false);
          return;
        }
        body.duration_minutes = Number(newFlapsDuration);
        body.exercise_mode = newFlapsMode;
        body.avg_heart_rate = newFlapsHR ? Number(newFlapsHR) : null;
        body.calories_burned = newFlapsCalories ? Number(newFlapsCalories) : null;
        body.notes = newFlapsNotes || null;
      } else {
        if (!newEntryValue) {
          setError('Please enter a value');
          setAddingEntry(false);
          return;
        }
        body.value = Number(newEntryValue);
        if (newEntryTaskId) body.task_id = newEntryTaskId;
      }

      const res = await fetch(`/api/warzone/challenges/${challengeId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.ok) {
        setSuccess('Entry added');
        setShowAddEntry(false);
        setNewEntryValue('');
        setNewFlapsDuration('');
        setNewFlapsHR('');
        setNewFlapsCalories('');
        setNewFlapsNotes('');
        await loadEntries();
        setTimeout(() => setSuccess(''), 2000);
      } else {
        setError(data.error || 'Failed to add entry');
      }
    } catch (err) {
      setError('Failed to add entry');
    }
    setAddingEntry(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const body: any = {};

      if (title !== initialData.title) body.title = title;
      if (startsOn !== initialData.starts_on) body.starts_on = startsOn;
      if (endsOn !== initialData.ends_on) body.ends_on = endsOn;
      if (stakeText !== (initialData.stake_text || '')) body.stake_text = stakeText;
      if (description !== (initialData.description || '')) body.description = description;
      if (hasTargetWeight && targetWeightKg !== (initialData.target_weight_kg || '')) body.target_weight_kg = targetWeightKg;
      if (isFlapsChallenge) {
        if (targetDurationMinutes !== String(initialData.target_duration_minutes || '')) body.target_duration_minutes = targetDurationMinutes ? Number(targetDurationMinutes) : null;
        if (targetAvgHeartRate !== String(initialData.target_avg_heart_rate || '')) body.target_avg_heart_rate = targetAvgHeartRate ? Number(targetAvgHeartRate) : null;
        if (targetCalories !== String(initialData.target_calories || '')) body.target_calories = targetCalories ? Number(targetCalories) : null;
      }

      const taskUpdatesList = initialTasks
        .filter(t => {
          const edit = taskEdits[t.id];
          return edit && (edit.target_value !== (t.target_value || '0') || edit.name !== t.name);
        })
        .map(t => ({
          id: t.id,
          target_value: taskEdits[t.id].target_value,
          name: taskEdits[t.id].name,
        }));

      if (taskUpdatesList.length > 0) body.task_updates = taskUpdatesList;

      const entryUpdatesList = entries
        .filter(e => {
          if (entryDeletes.has(e.id)) return false;
          const edit = entryEdits[e.id];
          if (!edit) return false;
          const origValue = e.entry_type === 'flaps' ? String(e.duration_minutes || 0) : (e.value || '0');
          const origHR = e.avg_heart_rate != null ? String(e.avg_heart_rate) : '';
          const origCal = e.calories_burned != null ? String(e.calories_burned) : '';
          const origMode = e.exercise_mode || '';
          return edit.value !== origValue || edit.entry_date !== e.entry_date ||
            (edit.avg_heart_rate || '') !== origHR || (edit.calories_burned || '') !== origCal ||
            (edit.exercise_mode || '') !== origMode;
        })
        .map(e => {
          const edit = entryEdits[e.id];
          const update: any = { id: e.id, value: edit.value, entry_date: edit.entry_date };
          if (isFlapsChallenge) {
            update.avg_heart_rate = edit.avg_heart_rate ? Number(edit.avg_heart_rate) : null;
            update.calories_burned = edit.calories_burned ? Number(edit.calories_burned) : null;
            update.exercise_mode = edit.exercise_mode || null;
          }
          return update;
        });

      if (entryUpdatesList.length > 0) body.entry_updates = entryUpdatesList;

      const deletesList = Array.from(entryDeletes);
      if (deletesList.length > 0) body.entry_deletes = deletesList;

      if (Object.keys(body).length === 0) {
        setSuccess('No changes to save');
        setSaving(false);
        return;
      }

      const res = await fetch(`/api/warzone/challenges/${challengeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.ok) {
        setSuccess('Changes saved');
        setTimeout(() => {
          onSaved();
          onClose();
        }, 800);
      } else {
        setError(data.error || 'Failed to save');
      }
    } catch (err) {
      setError('Failed to save changes');
    }
    setSaving(false);
  }

  const unitLabel = (unitType: string) => {
    if (unitType === 'km' || unitType === 'distance') return 'km';
    if (unitType === 'minutes') return 'min';
    if (unitType === 'sessions' || unitType === 'reps') return unitType;
    return 'reps';
  };

  const availableUsers = participants || [];

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-600 rounded-xl w-full max-w-lg p-5 space-y-4 mb-8"
        onClick={(e) => e.stopPropagation()}
        data-testid="challenge-edit-modal"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-amber-400">Edit Challenge</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl" data-testid="btn-close-edit-modal">&times;</button>
        </div>

        {error && <div className="bg-red-900/50 border border-red-700 rounded-lg p-2 text-sm text-red-300">{error}</div>}
        {success && <div className="bg-green-900/50 border border-green-700 rounded-lg p-2 text-sm text-green-300">{success}</div>}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              data-testid="input-edit-title"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Start Date</label>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                data-testid="input-edit-starts-on"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">End Date</label>
              <input
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                data-testid="input-edit-ends-on"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Stakes</label>
            <input
              value={stakeText}
              onChange={(e) => setStakeText(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="e.g. Loser buys dinner"
              data-testid="input-edit-stakes"
            />
          </div>

          {hasTargetWeight && (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Target Weight Loss (kg)</label>
              <input
                type="number"
                step="0.1"
                value={targetWeightKg}
                onChange={(e) => setTargetWeightKg(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                data-testid="input-edit-target-weight"
              />
            </div>
          )}

          {isFlapsChallenge && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Duration (min)</label>
                <input
                  type="number"
                  value={targetDurationMinutes}
                  onChange={(e) => setTargetDurationMinutes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  data-testid="input-edit-duration"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Avg HR (bpm)</label>
                <input
                  type="number"
                  value={targetAvgHeartRate}
                  onChange={(e) => setTargetAvgHeartRate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  data-testid="input-edit-hr"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Calories</label>
                <input
                  type="number"
                  value={targetCalories}
                  onChange={(e) => setTargetCalories(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  data-testid="input-edit-calories"
                />
              </div>
            </div>
          )}
        </div>

        {initialTasks.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Challenge Legs / Tasks</h3>
            <div className="space-y-2">
              {initialTasks.map(task => (
                <div key={task.id} className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-slate-400 flex-shrink-0">Name:</span>
                    <input
                      value={taskEdits[task.id]?.name || ''}
                      onChange={(e) => updateTaskEdit(task.id, 'name', e.target.value)}
                      className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                      data-testid={`input-edit-task-name-${task.id}`}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 flex-shrink-0">Target ({task.target_type === 'per_day' ? 'per day' : 'total'}):</span>
                    <input
                      type="number"
                      value={taskEdits[task.id]?.target_value || ''}
                      onChange={(e) => updateTaskEdit(task.id, 'target_value', e.target.value)}
                      className="w-24 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                      data-testid={`input-edit-task-target-${task.id}`}
                    />
                    <span className="text-xs text-slate-500">{unitLabel(task.unit_type)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleEntries}
              className="text-sm text-amber-400 hover:text-amber-300 underline"
              data-testid="btn-toggle-entries"
            >
              {showEntries ? 'Hide Entries' : `View & Edit Entries`}
            </button>
            <button
              onClick={() => {
                if (!showEntries) {
                  toggleEntries();
                }
                setShowAddEntry(!showAddEntry);
              }}
              className="text-sm text-emerald-400 hover:text-emerald-300 underline"
              data-testid="btn-toggle-add-entry"
            >
              + Add Entry
            </button>
          </div>

          {showAddEntry && (
            <div className="mt-3 bg-slate-800 rounded-lg p-3 border border-emerald-700/50 space-y-2">
              <h4 className="text-sm font-semibold text-emerald-400">Add New Entry</h4>

              <div>
                <label className="text-xs text-slate-400 block mb-1">User</label>
                {availableUsers.length > 0 ? (
                  <select
                    value={newEntryUserId}
                    onChange={(e) => setNewEntryUserId(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
                    data-testid="select-add-entry-user"
                  >
                    <option value="">Select user...</option>
                    {availableUsers.map(u => (
                      <option key={u.user_id} value={u.user_id}>{u.username}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={newEntryUserId}
                    onChange={(e) => setNewEntryUserId(e.target.value)}
                    placeholder="User ID"
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
                    data-testid="input-add-entry-user-id"
                  />
                )}
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Date</label>
                <input
                  type="date"
                  value={newEntryDate}
                  onChange={(e) => setNewEntryDate(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
                  data-testid="input-add-entry-date"
                />
              </div>

              {isFlapsChallenge ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Mode</label>
                      <select
                        value={newFlapsMode}
                        onChange={(e) => setNewFlapsMode(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
                        data-testid="select-add-flaps-mode"
                      >
                        <option value="HIIT">HIIT</option>
                        <option value="Ride">Ride</option>
                        <option value="Run">Run</option>
                        <option value="Hike">Hike</option>
                        <option value="Swim">Swim</option>
                        <option value="Custom">Custom</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Duration (min)</label>
                      <input
                        type="number"
                        value={newFlapsDuration}
                        onChange={(e) => setNewFlapsDuration(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
                        data-testid="input-add-flaps-duration"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Avg HR (bpm)</label>
                      <input
                        type="number"
                        value={newFlapsHR}
                        onChange={(e) => setNewFlapsHR(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
                        data-testid="input-add-flaps-hr"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Calories</label>
                      <input
                        type="number"
                        value={newFlapsCalories}
                        onChange={(e) => setNewFlapsCalories(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
                        data-testid="input-add-flaps-calories"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Notes</label>
                    <input
                      value={newFlapsNotes}
                      onChange={(e) => setNewFlapsNotes(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
                      placeholder="Optional notes..."
                      data-testid="input-add-flaps-notes"
                    />
                  </div>
                </>
              ) : (
                <>
                  {initialTasks.length > 1 && (
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Task/Leg</label>
                      <select
                        value={newEntryTaskId}
                        onChange={(e) => setNewEntryTaskId(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
                        data-testid="select-add-entry-task"
                      >
                        <option value="">Default (first task)</option>
                        {initialTasks.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Value ({initialTasks[0]?.unit_type || 'reps'})</label>
                    <input
                      type="number"
                      value={newEntryValue}
                      onChange={(e) => setNewEntryValue(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
                      data-testid="input-add-entry-value"
                    />
                  </div>
                </>
              )}

              <button
                onClick={handleAddEntry}
                disabled={addingEntry}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                data-testid="btn-submit-add-entry"
              >
                {addingEntry ? 'Adding...' : 'Add Entry'}
              </button>
            </div>
          )}

          {showEntries && (
            <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
              {entriesLoading ? (
                <div className="text-center py-4 text-slate-500 text-sm">Loading entries...</div>
              ) : entries.length === 0 ? (
                <div className="text-center py-4 text-slate-500 text-sm">No entries logged yet</div>
              ) : (
                entries.map(entry => {
                  const isDeleted = entryDeletes.has(entry.id);
                  const edit = entryEdits[entry.id];
                  return (
                    <div
                      key={entry.id}
                      className={`bg-slate-800 rounded-lg p-2.5 border text-sm ${isDeleted ? 'border-red-700/50 opacity-50' : 'border-slate-700'}`}
                      data-testid={`entry-row-${entry.id}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-slate-300 font-medium truncate">{entry.username}</span>
                          <span className="text-slate-500 text-xs truncate">{entry.display || entry.task_name}</span>
                        </div>
                        <button
                          onClick={() => toggleEntryDelete(entry.id)}
                          className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${isDeleted ? 'bg-slate-700 text-slate-300' : 'bg-red-900/50 text-red-400'}`}
                          data-testid={`btn-delete-entry-${entry.id}`}
                        >
                          {isDeleted ? 'Undo' : 'Del'}
                        </button>
                      </div>
                      {!isDeleted && edit && (
                        entry.entry_type === 'flaps' ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="date"
                                value={edit.entry_date}
                                onChange={(e) => updateEntryEdit(entry.id, 'entry_date', e.target.value)}
                                className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs flex-1"
                                data-testid={`input-entry-date-${entry.id}`}
                              />
                              <select
                                value={edit.exercise_mode || ''}
                                onChange={(e) => updateEntryEdit(entry.id, 'exercise_mode', e.target.value)}
                                className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs w-20"
                                data-testid={`select-entry-mode-${entry.id}`}
                              >
                                <option value="HIIT">HIIT</option>
                                <option value="Ride">Ride</option>
                                <option value="Run">Run</option>
                                <option value="Hike">Hike</option>
                                <option value="Swim">Swim</option>
                                <option value="Custom">Custom</option>
                              </select>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <span className="text-slate-500 text-[10px] block">Duration</span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    value={edit.value}
                                    onChange={(e) => updateEntryEdit(entry.id, 'value', e.target.value)}
                                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs"
                                    data-testid={`input-entry-value-${entry.id}`}
                                  />
                                  <span className="text-slate-500 text-[10px]">min</span>
                                </div>
                              </div>
                              <div className="flex-1">
                                <span className="text-slate-500 text-[10px] block">Avg HR</span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    value={edit.avg_heart_rate || ''}
                                    onChange={(e) => updateEntryEdit(entry.id, 'avg_heart_rate', e.target.value)}
                                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs"
                                    data-testid={`input-entry-hr-${entry.id}`}
                                  />
                                  <span className="text-slate-500 text-[10px]">bpm</span>
                                </div>
                              </div>
                              <div className="flex-1">
                                <span className="text-slate-500 text-[10px] block">Calories</span>
                                <input
                                  type="number"
                                  value={edit.calories_burned || ''}
                                  onChange={(e) => updateEntryEdit(entry.id, 'calories_burned', e.target.value)}
                                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs"
                                  data-testid={`input-entry-cal-${entry.id}`}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={edit.entry_date}
                              onChange={(e) => updateEntryEdit(entry.id, 'entry_date', e.target.value)}
                              className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs flex-1"
                              data-testid={`input-entry-date-${entry.id}`}
                            />
                            <input
                              type="number"
                              step="any"
                              value={edit.value}
                              onChange={(e) => updateEntryEdit(entry.id, 'value', e.target.value)}
                              className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs"
                              data-testid={`input-entry-value-${entry.id}`}
                            />
                            <span className="text-slate-500 text-xs">{unitLabel(entry.task_unit_type)}</span>
                          </div>
                        )
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-amber-600 hover:bg-amber-500 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
            data-testid="btn-save-challenge-edit"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={onClose}
            className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 py-2.5 rounded-lg text-sm transition-colors"
            data-testid="btn-cancel-edit"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
