import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

type Team = {
  team_id: string;
  team_name: string;
};

export function TeamSwitcher() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTeams();
  }, []);

  async function loadTeams() {
    try {
      const res = await fetch('/api/user/teams');
      if (!res.ok) {
        console.error('Failed to load teams');
        setLoading(false);
        return;
      }

      const data = await res.json();
      setTeams(data.teams || []);
      setActiveTeamId(data.activeTeamId);
    } catch (error) {
      console.error('Load teams error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function switchTeam(teamId: string) {
    if (teamId === activeTeamId) return;

    try {
      const res = await fetch('/api/user/active-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      });

      if (!res.ok) {
        console.error('Failed to switch team');
        return;
      }

      setActiveTeamId(teamId);
      // Reload the current page to fetch new team data
      router.reload();
    } catch (error) {
      console.error('Switch team error:', error);
    }
  }

  if (loading || teams.length === 0) {
    return null;
  }

  // If user only has one team, don't show the switcher
  if (teams.length === 1) {
    return null;
  }

  const activeTeam = teams.find((t) => t.team_id === activeTeamId);

  return (
    <select
      value={activeTeamId || ''}
      onChange={(e) => switchTeam(e.target.value)}
      className="rounded-lg bg-slate-900 border border-slate-700 px-3 min-h-11 text-sm text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none min-w-[160px]"
      data-testid="select-team"
    >
      {teams.map((team) => (
        <option key={team.team_id} value={team.team_id}>
          {team.team_name}
        </option>
      ))}
    </select>
  );
}
