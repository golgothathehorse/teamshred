// pages/admin/exercise-types.tsx
// Admin page for managing exercise types

import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useEffect, useState, useMemo, FormEvent } from 'react';
import Link from 'next/link';
import { parseSessionFromRequest, SessionUser } from '../../lib/auth';
import { UNIT_TYPE_OPTIONS, sortExerciseTypes } from '../../lib/exercises';

type Props = {
  user: SessionUser;
};

type ExerciseType = {
  id: string;
  name: string;
  unit_type: string;
  unit_label: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const user = parseSessionFromRequest(ctx.req);

  if (!user) {
    return {
      redirect: { destination: '/login', permanent: false },
    };
  }

  if (!user.isAdmin) {
    return {
      redirect: { destination: '/dashboard', permanent: false },
    };
  }

  return { props: { user } };
};

export default function AdminExerciseTypesPage({ user }: Props) {
  const [exerciseTypes, setExerciseTypes] = useState<ExerciseType[]>([]);
  const sortedExerciseTypes = useMemo(() => sortExerciseTypes(exerciseTypes), [exerciseTypes]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newUnitType, setNewUnitType] = useState('reps');
  const [newUnitLabel, setNewUnitLabel] = useState('reps');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUnitType, setEditUnitType] = useState('');
  const [editUnitLabel, setEditUnitLabel] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editLoading, setEditLoading] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadExerciseTypes();
  }, []);

  const loadExerciseTypes = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/exercise-types', { credentials: 'include' });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to load exercise types');
        return;
      }
      setExerciseTypes(data.exercise_types || []);
    } catch (err) {
      console.error('Error loading exercise types:', err);
      setError('Failed to load exercise types');
    } finally {
      setLoading(false);
    }
  };

  const handleUnitTypeChange = (value: string) => {
    setNewUnitType(value);
    const option = UNIT_TYPE_OPTIONS.find(o => o.value === value);
    if (option) {
      setNewUnitLabel(option.defaultUnitLabel);
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const res = await fetch('/api/admin/exercise-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newName,
          unit_type: newUnitType,
          unit_label: newUnitLabel,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setFormError(data.error || 'Failed to create exercise type');
        return;
      }

      setFormSuccess('Exercise type created successfully!');
      setNewName('');
      setNewUnitType('reps');
      setNewUnitLabel('reps');
      loadExerciseTypes();
    } catch (err) {
      console.error('Error creating exercise type:', err);
      setFormError('Failed to create exercise type');
    } finally {
      setFormLoading(false);
    }
  };

  const startEdit = (et: ExerciseType) => {
    setEditingId(et.id);
    setEditName(et.name);
    setEditUnitType(et.unit_type);
    setEditUnitLabel(et.unit_label);
    setEditActive(et.is_active);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditUnitType('');
    setEditUnitLabel('');
    setEditActive(true);
  };

  const handleUpdate = async (id: string) => {
    setEditLoading(true);
    try {
      const res = await fetch(`/api/admin/exercise-types/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: editName,
          unit_type: editUnitType,
          unit_label: editUnitLabel,
          is_active: editActive,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        alert(data.error || 'Failed to update exercise type');
        return;
      }

      cancelEdit();
      loadExerciseTypes();
    } catch (err) {
      console.error('Error updating exercise type:', err);
      alert('Failed to update exercise type');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this exercise type? If it is in use, it will be deactivated instead.')) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/exercise-types/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (!data.ok) {
        alert(data.error || 'Failed to delete exercise type');
        return;
      }

      loadExerciseTypes();
    } catch (err) {
      console.error('Error deleting exercise type:', err);
      alert('Failed to delete exercise type');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Head>
        <title>Exercise Types Management | Admin</title>
      </Head>

      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
        <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-sky-100">Exercise Types Management</h1>
              <p className="text-sm text-slate-400">Add, edit, or remove exercise types used across the app</p>
            </div>
            <Link
              href="/admin"
              className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              data-testid="link-back-admin"
            >
              Back to Admin
            </Link>
          </div>

          <section className="rounded-2xl border border-sky-500/40 bg-slate-900/80 shadow-xl">
            <div className="border-b border-sky-500/40 px-5 py-4">
              <h2 className="text-lg font-semibold text-sky-100">Add New Exercise Type</h2>
            </div>

            <form onSubmit={handleCreate} className="px-5 py-4 space-y-4">
              {formError && (
                <div className="text-red-400 text-sm bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="text-emerald-400 text-sm bg-emerald-900/20 border border-emerald-500/30 rounded-lg px-3 py-2">
                  {formSuccess}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Burpees"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    required
                    data-testid="input-new-name"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Unit Type</label>
                  <select
                    value={newUnitType}
                    onChange={(e) => handleUnitTypeChange(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    data-testid="select-unit-type"
                  >
                    {UNIT_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Unit Label</label>
                  <input
                    type="text"
                    value={newUnitLabel}
                    onChange={(e) => setNewUnitLabel(e.target.value)}
                    placeholder="e.g., reps"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    required
                    data-testid="input-unit-label"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={formLoading || !newName.trim()}
                    className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50 px-4 py-2 rounded-lg font-medium transition-colors"
                    data-testid="btn-create"
                  >
                    {formLoading ? 'Creating...' : 'Add Exercise'}
                  </button>
                </div>
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-700/40 bg-slate-900/80 shadow-xl">
            <div className="border-b border-slate-700/40 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-100">All Exercise Types</h2>
              <p className="text-xs text-slate-400">Manage existing exercise types</p>
            </div>

            <div className="px-5 py-4">
              {loading ? (
                <div className="text-center py-8 text-slate-500">Loading...</div>
              ) : error ? (
                <div className="text-center py-8 text-red-400">{error}</div>
              ) : exerciseTypes.length === 0 ? (
                <div className="text-center py-8 text-slate-500">No exercise types found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm" data-testid="exercise-types-table">
                    <thead className="bg-slate-800/50 text-slate-400">
                      <tr>
                        <th className="px-4 py-3 rounded-tl-lg">Name</th>
                        <th className="px-4 py-3">Unit Type</th>
                        <th className="px-4 py-3">Unit Label</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right rounded-tr-lg">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {sortedExerciseTypes.map(et => (
                        <tr key={et.id} className={`${et.is_active ? '' : 'opacity-50'}`} data-testid={`row-${et.id}`}>
                          {editingId === et.id ? (
                            <>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white"
                                  data-testid="input-edit-name"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <select
                                  value={editUnitType}
                                  onChange={(e) => setEditUnitType(e.target.value)}
                                  className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white"
                                  data-testid="select-edit-unit-type"
                                >
                                  {UNIT_TYPE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  value={editUnitLabel}
                                  onChange={(e) => setEditUnitLabel(e.target.value)}
                                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white"
                                  data-testid="input-edit-unit-label"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={editActive}
                                    onChange={(e) => setEditActive(e.target.checked)}
                                    className="w-4 h-4"
                                    data-testid="checkbox-edit-active"
                                  />
                                  <span className="text-xs">Active</span>
                                </label>
                              </td>
                              <td className="px-4 py-3 text-right space-x-2">
                                <button
                                  onClick={() => handleUpdate(et.id)}
                                  disabled={editLoading}
                                  className="text-xs bg-emerald-600 hover:bg-emerald-700 px-3 py-1 rounded"
                                  data-testid="btn-save-edit"
                                >
                                  {editLoading ? '...' : 'Save'}
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="text-xs bg-slate-600 hover:bg-slate-500 px-3 py-1 rounded"
                                  data-testid="btn-cancel-edit"
                                >
                                  Cancel
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 font-medium">{et.name}</td>
                              <td className="px-4 py-3 text-slate-400">{et.unit_type}</td>
                              <td className="px-4 py-3 text-slate-400">{et.unit_label}</td>
                              <td className="px-4 py-3">
                                <span className={`text-xs px-2 py-1 rounded-full ${et.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-400'}`}>
                                  {et.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right space-x-2">
                                <button
                                  onClick={() => startEdit(et)}
                                  className="text-xs bg-sky-600 hover:bg-sky-700 px-3 py-1 rounded"
                                  data-testid={`btn-edit-${et.id}`}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(et.id)}
                                  disabled={deletingId === et.id}
                                  className="text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 px-3 py-1 rounded"
                                  data-testid={`btn-delete-${et.id}`}
                                >
                                  {deletingId === et.id ? '...' : 'Delete'}
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
