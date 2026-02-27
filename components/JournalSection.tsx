import { useState, useEffect } from 'react';

type JournalEntry = {
  id: string;
  user_id: string;
  category: 'training' | 'diet' | 'supplements' | 'stack';
  content: string;
  created_at: string;
};

type Category = 'training' | 'diet' | 'supplements' | 'stack';

type SharedJournals = {
  training: boolean | string[];
  diet: boolean | string[];
  supplements: boolean | string[];
  stack: boolean | string[];
};

function isCategorySharedWithAnyTeam(value: boolean | string[] | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

function getSharedTeamIds(value: boolean | string[] | undefined, allTeamIds: string[]): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'boolean' && value === true) {
    // Legacy boolean true means shared with all teams
    return allTeamIds;
  }
  return [];
}

const CATEGORIES: { key: Category; label: string; icon: string; activeColor: string; inactiveColor: string }[] = [
  { key: 'training', label: 'Training', icon: '🏋️', activeColor: 'bg-emerald-600', inactiveColor: 'bg-emerald-900/50 hover:bg-emerald-800/50' },
  { key: 'diet', label: 'Diet', icon: '🥗', activeColor: 'bg-teal-600', inactiveColor: 'bg-teal-900/50 hover:bg-teal-800/50' },
  { key: 'supplements', label: 'Supplements', icon: '💊', activeColor: 'bg-lime-600', inactiveColor: 'bg-lime-900/50 hover:bg-lime-800/50' },
  { key: 'stack', label: 'Stack', icon: '💉', activeColor: 'bg-green-600', inactiveColor: 'bg-green-900/50 hover:bg-green-800/50' },
];

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  
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

export default function JournalSection() {
  const [activeTab, setActiveTab] = useState<Category>('training');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sharing, setSharing] = useState<SharedJournals>({
    training: false,
    diet: false,
    supplements: false,
    stack: false,
  });
  const [togglingShare, setTogglingShare] = useState(false);
  const [teamCount, setTeamCount] = useState(1);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const ENTRIES_LIMIT = 5;

  async function loadEntries() {
    setLoading(true);
    try {
      const res = await fetch(`/api/journal?category=${activeTab}`);
      const data = await res.json();
      if (data.ok) {
        setEntries(data.entries);
      } else {
        console.error('Load journal entries error:', data.error);
      }
    } catch (err) {
      console.error('Load journal entries error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadSharingPrefs() {
    try {
      const res = await fetch('/api/journal/sharing');
      const data = await res.json();
      if (data.ok) {
        setSharing(data.sharing);
        setTeamCount(data.teamCount || 1);
        if (data.teams) {
          setTeams(data.teams);
        }
      }
    } catch (err) {
      console.error('Load sharing preferences error:', err);
    }
  }

  useEffect(() => {
    loadSharingPrefs();
  }, []);

  useEffect(() => {
    loadEntries();
    setNewContent('');
    setError(null);
    setShowAll(false);
    setEditing(null);
    setEditContent('');
  }, [activeTab]);

  async function handleSave() {
    if (!newContent.trim()) return;
    
    setSaving(true);
    setError(null);
    
    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: activeTab,
          content: newContent.trim(),
        }),
      });
      
      const data = await res.json();
      
      if (data.ok) {
        setNewContent('');
        await loadEntries();
      } else {
        setError(data.error || 'Failed to save entry');
      }
    } catch (err) {
      console.error('Save journal entry error:', err);
      setError('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleCategoryShare() {
    setTogglingShare(true);
    
    try {
      const res = await fetch('/api/journal/sharing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: activeTab,
          shared: !isCategorySharedWithAnyTeam(sharing[activeTab]),
        }),
      });
      
      const data = await res.json();
      
      if (data.ok) {
        setSharing(data.sharing);
      } else {
        console.error('Toggle share error:', data.error);
      }
    } catch (err) {
      console.error('Toggle share error:', err);
    } finally {
      setTogglingShare(false);
    }
  }

  async function handleToggleTeamShare(teamId: string) {
    setTogglingShare(true);
    
    try {
      const currentValue = sharing[activeTab];
      const allTeamIds = teams.map(t => t.id);
      const currentTeamIds = getSharedTeamIds(currentValue, allTeamIds);
      let newTeamIds: string[];
      
      if (currentTeamIds.includes(teamId)) {
        newTeamIds = currentTeamIds.filter(id => id !== teamId);
      } else {
        newTeamIds = [...currentTeamIds, teamId];
      }
      
      const res = await fetch('/api/journal/sharing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: activeTab,
          teamIds: newTeamIds,
        }),
      });
      
      const data = await res.json();
      
      if (data.ok) {
        setSharing(data.sharing);
      } else {
        console.error('Toggle team share error:', data.error);
      }
    } catch (err) {
      console.error('Toggle team share error:', err);
    } finally {
      setTogglingShare(false);
    }
  }

  async function handleDelete(entryId: string) {
    if (!confirm('Delete this entry?')) return;
    
    setDeleting(entryId);
    
    try {
      const res = await fetch('/api/journal', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entryId }),
      });
      
      const data = await res.json();
      
      if (data.ok) {
        await loadEntries();
      } else {
        console.error('Delete entry error:', data.error);
      }
    } catch (err) {
      console.error('Delete entry error:', err);
    } finally {
      setDeleting(null);
    }
  }

  function handleStartEdit(entry: JournalEntry) {
    setEditing(entry.id);
    setEditContent(entry.content);
  }

  function handleCancelEdit() {
    setEditing(null);
    setEditContent('');
  }

  async function handleSaveEdit(entryId: string) {
    if (!editContent.trim()) return;
    
    setEditSaving(true);
    
    try {
      const res = await fetch('/api/journal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entryId, content: editContent }),
      });
      
      const data = await res.json();
      
      if (data.ok) {
        setEntries(prev => prev.map(e => 
          e.id === entryId ? { ...e, content: data.entry.content } : e
        ));
        setEditing(null);
        setEditContent('');
      } else {
        console.error('Edit entry error:', data.error);
        setError(data.error || 'Failed to save changes');
      }
    } catch (err) {
      console.error('Edit entry error:', err);
      setError('Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  }

  const currentCategory = CATEGORIES.find(c => c.key === activeTab);
  const isCategoryShared = isCategorySharedWithAnyTeam(sharing[activeTab]);
  const allTeamIds = teams.map(t => t.id);
  const currentSharedTeamIds = getSharedTeamIds(sharing[activeTab], allTeamIds);

  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-700/50 p-4 sm:p-6" data-testid="journal-section">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <span className="text-2xl">📓</span>
          Journal
        </h2>
      </div>

      {/* Tabs - Color coded */}
      <div className="flex flex-wrap gap-2 mb-4" data-testid="journal-tabs">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveTab(cat.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === cat.key
                ? `${cat.activeColor} text-white shadow-md`
                : `${cat.inactiveColor} text-slate-300`
            }`}
            data-testid={`journal-tab-${cat.key}`}
          >
            <span>{cat.icon}</span>
            <span className="hidden sm:inline">{cat.label}</span>
            {isCategorySharedWithAnyTeam(sharing[cat.key]) && (
              <span className="ml-1 w-2 h-2 bg-white/80 rounded-full" title="Shared with team" />
            )}
          </button>
        ))}
      </div>

      {/* Category Share Toggle - Single team: simple toggle, Multi-team: checkboxes */}
      <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700/30">
        {teamCount <= 1 ? (
          /* Single team: simple toggle */
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-200">
                Share {currentCategory?.label} Journal
              </p>
              <p className="text-xs text-slate-500">
                {isCategoryShared 
                  ? 'Your team can see all entries in this category' 
                  : 'Only you can see entries in this category'}
              </p>
            </div>
            <button
              onClick={handleToggleCategoryShare}
              disabled={togglingShare}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${
                isCategoryShared
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
              data-testid="journal-share-toggle"
            >
              {togglingShare ? '...' : isCategoryShared ? 'Shared' : 'Share'}
            </button>
          </div>
        ) : (
          /* Multi-team: checkboxes for each team */
          <div>
            <p className="text-sm font-medium text-slate-200 mb-2">
              Share {currentCategory?.label} Journal With:
            </p>
            <div className="space-y-2">
              {teams.map((team) => {
                const isChecked = currentSharedTeamIds.includes(team.id);
                return (
                  <label
                    key={team.id}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleTeamShare(team.id)}
                      disabled={togglingShare}
                      className="w-4 h-4 rounded border-slate-500 bg-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 disabled:opacity-50"
                      data-testid={`journal-share-team-${team.id}`}
                    />
                    <span className={`text-sm ${isChecked ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-300'}`}>
                      {team.name}
                    </span>
                  </label>
                );
              })}
            </div>
            {teams.length === 0 && (
              <p className="text-xs text-slate-500">Loading teams...</p>
            )}
          </div>
        )}
      </div>

      {/* New Entry Form */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-300 mb-1">
          New {currentCategory?.label} Entry
        </label>
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder={`Write your ${currentCategory?.label.toLowerCase()} notes here...`}
          className="w-full p-3 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm resize-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder-slate-500"
          rows={3}
          maxLength={5000}
          data-testid="journal-textarea"
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-slate-500">
            {newContent.length}/5000 characters
          </span>
          <button
            onClick={handleSave}
            disabled={saving || !newContent.trim()}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              saving || !newContent.trim()
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-emerald-600 text-white hover:bg-emerald-500'
            }`}
            data-testid="journal-save-button"
          >
            {saving ? 'Saving...' : 'Save Entry'}
          </button>
        </div>
        {error && (
          <p className="text-red-400 text-sm mt-2" data-testid="journal-error">
            {error}
          </p>
        )}
      </div>

      {/* Entries List */}
      <div className="border-t border-slate-700/50 pt-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">
          Previous {currentCategory?.label} Entries
        </h3>
        
        {loading ? (
          <div className="text-center py-4">
            <div className="inline-block w-6 h-6 border-2 border-slate-600 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-sm text-slate-500 mt-2">Loading entries...</p>
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4" data-testid="journal-empty">
            No {currentCategory?.label.toLowerCase()} entries yet. Add your first one above!
          </p>
        ) : (
          <>
            <div className="space-y-3" data-testid="journal-entries-list">
              {(showAll ? entries : entries.slice(0, ENTRIES_LIMIT)).map((entry) => (
                <div
                  key={entry.id}
                  className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50"
                  data-testid={`journal-entry-${entry.id}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-medium text-slate-500" data-testid={`journal-entry-date-${entry.id}`}>
                      {formatDateTime(entry.created_at)}
                    </span>
                    <div className="flex items-center gap-2">
                      {editing === entry.id ? (
                        <>
                          <button
                            onClick={handleCancelEdit}
                            disabled={editSaving}
                            className="text-slate-400 hover:text-slate-300 text-xs font-medium disabled:opacity-50"
                            data-testid={`journal-cancel-${entry.id}`}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit(entry.id)}
                            disabled={editSaving || !editContent.trim()}
                            className="text-emerald-400 hover:text-emerald-300 text-xs font-medium disabled:opacity-50"
                            data-testid={`journal-save-edit-${entry.id}`}
                          >
                            {editSaving ? 'Saving...' : 'Save'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleStartEdit(entry)}
                            disabled={deleting === entry.id || editing !== null}
                            className="text-sky-400 hover:text-sky-300 text-xs font-medium disabled:opacity-50"
                            data-testid={`journal-edit-${entry.id}`}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            disabled={deleting === entry.id || editing !== null}
                            className="text-red-400 hover:text-red-300 text-xs font-medium disabled:opacity-50"
                            data-testid={`journal-delete-${entry.id}`}
                          >
                            {deleting === entry.id ? '...' : 'Delete'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {editing === entry.id ? (
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full p-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-sm resize-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      rows={4}
                      maxLength={5000}
                      autoFocus
                      data-testid={`journal-edit-textarea-${entry.id}`}
                    />
                  ) : (
                    <p className="text-sm text-slate-200 whitespace-pre-wrap" data-testid={`journal-entry-content-${entry.id}`}>
                      {entry.content}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {entries.length > ENTRIES_LIMIT && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="w-full mt-3 py-2 text-sm font-medium text-emerald-400 hover:text-emerald-300 bg-slate-800/50 rounded-lg border border-slate-700/50 hover:bg-slate-700/50 transition-colors"
                data-testid="journal-show-more-button"
              >
                {showAll ? `Show Less` : `Show More (${entries.length - ENTRIES_LIMIT} more)`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
