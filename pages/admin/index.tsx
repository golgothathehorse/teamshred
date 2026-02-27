// pages/admin/index.tsx
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { parseSessionFromRequest, SessionUser } from '../../lib/auth';

type Props = {
  user: SessionUser;
};

type UserTeam = {
  team_id: string;
  team_name: string;
};

type SimpleUser = {
  id: string;
  username: string;
  is_admin: boolean;
  created_at: string;
  team_id: string | null;
  teams?: UserTeam[];
};

type Team = {
  id: string;
  name: string;
  created_at: string;
};

type Banner = {
  id: string;
  team_id: string | null;
  message: string;
  type: string;
  created_at: string;
  created_by: string | null;
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

export default function AdminPage({ user }: Props) {
  const router = useRouter();

  const isNoxAdmin =
    user.isAdmin && user.username.toLowerCase() === 'nox';

  // Users
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Create user form
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);

  // Teams
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [teamNameInput, setTeamNameInput] = useState('');
  const [teamFormLoading, setTeamFormLoading] = useState(false);
  const [teamFormError, setTeamFormError] = useState<string | null>(null);
  const [teamFormSuccess, setTeamFormSuccess] = useState<string | null>(null);

  // Per-row team update loading
  const [updatingUserTeamId, setUpdatingUserTeamId] = useState<string | null>(
    null
  );

  // Banners (team announcements / news)
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loadingBanners, setLoadingBanners] = useState(true);
  const [bannersError, setBannersError] = useState<string | null>(null);

  const [bannerTeamId, setBannerTeamId] = useState<string>('');
  const [bannerMessage, setBannerMessage] = useState<string>('');
  const [bannerFormLoading, setBannerFormLoading] = useState(false);
  const [bannerFormError, setBannerFormError] = useState<string | null>(null);
  const [bannerFormSuccess, setBannerFormSuccess] = useState<string | null>(
    null
  );
  const [selectedBannerIds, setSelectedBannerIds] = useState<Set<string>>(
    new Set()
  );
  const [deletingBanners, setDeletingBanners] = useState(false);

  // Clear all banners for a team
  const [clearTeamId, setClearTeamId] = useState<string>('');
  const [clearingTeamBanners, setClearingTeamBanners] = useState(false);
  const [clearTeamError, setClearTeamError] = useState<string | null>(null);
  const [clearTeamSuccess, setClearTeamSuccess] = useState<string | null>(null);

  // Multi-team management
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedTeamIdForUser, setSelectedTeamIdForUser] = useState<string>('');
  const [addingUserToTeam, setAddingUserToTeam] = useState(false);
  const [multiTeamError, setMultiTeamError] = useState<string | null>(null);
  const [multiTeamSuccess, setMultiTeamSuccess] = useState<string | null>(null);

  // Expandable user rows for inline team management
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [updatingTeamsFor, setUpdatingTeamsFor] = useState<string | null>(null);
  const [teamAssignmentFeedback, setTeamAssignmentFeedback] = useState<Record<string, {type: 'success' | 'error', message: string}>>({});

  useEffect(() => {
    async function loadUsers() {
      try {
        setLoadingUsers(true);
        const res = await fetch('/api/admin/users');
        const data = await res.json();
        if (!data.ok) {
          console.error('Load users error:', data.error);
          return;
        }
        setUsers(data.users ?? []);
      } catch (err) {
        console.error('Load users unexpected error:', err);
      } finally {
        setLoadingUsers(false);
      }
    }

    async function loadTeams() {
      try {
        setLoadingTeams(true);
        const res = await fetch('/api/admin/teams');
        const data = await res.json();
        if (!data.ok) {
          console.error('Load teams error:', data.error);
          return;
        }
        setTeams(data.teams ?? []);
      } catch (err) {
        console.error('Load teams unexpected error:', err);
      } finally {
        setLoadingTeams(false);
      }
    }

    async function loadBanners() {
      try {
        setLoadingBanners(true);
        setBannersError(null);
        const res = await fetch('/api/admin/banners?limit=30');
        const data = await res.json();
        if (!data.ok) {
          console.error('Load banners error:', data.error);
          setBannersError(data.error || 'Failed to load banners');
          return;
        }
        setBanners(data.banners ?? []);
      } catch (err) {
        console.error('Load banners unexpected error:', err);
        setBannersError('Something went wrong while loading banners');
      } finally {
        setLoadingBanners(false);
      }
    }

    loadUsers();
    loadTeams();
    loadBanners();
  }, []);

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setFormLoading(true);

    try {
      const username = newUsername.trim();
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password: newPassword,
          isAdmin: newIsAdmin,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setFormError(data.error || 'Failed to create user');
        setFormLoading(false);
        return;
      }

      if (data.users && data.users.length > 0) {
        // Prepend new user
        setUsers((prev) => [data.users[0], ...prev]);
      }

      setFormSuccess(`User "${username}" created`);
      setNewUsername('');
      setNewPassword('');
      setNewIsAdmin(false);
    } catch (err) {
      console.error('Create user unexpected error:', err);
      setFormError('Something went wrong');
    } finally {
      setFormLoading(false);
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

  async function handleResetPassword(u: SimpleUser) {
    const newPassword = window.prompt(
      `Enter a new password for "${u.username}":`
    );
    if (!newPassword) return;

    if (newPassword.length < 4) {
      window.alert('Password should be at least 4 characters.');
      return;
    }

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, password: newPassword }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        window.alert(data.error || 'Failed to reset password');
        return;
      }

      window.alert(`Password reset for "${u.username}"`);
    } catch (err) {
      console.error('Reset password error:', err);
      window.alert('Something went wrong');
    }
  }

  async function handleToggleAdmin(u: SimpleUser) {
    const isSelf = u.id === user.id;
    if (isSelf) {
      window.alert('You cannot change your own admin status.');
      return;
    }

    const newAdminStatus = !u.is_admin;
    const confirmed = window.confirm(
      `${newAdminStatus ? 'Grant admin access to' : 'Remove admin access from'} "${u.username}"?`
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, isAdmin: newAdminStatus }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        window.alert(data.error || 'Failed to update admin status');
        return;
      }

      const updatedUser: SimpleUser | undefined = data.users?.[0];
      if (updatedUser) {
        setUsers((prev) =>
          prev.map((x) => (x.id === updatedUser.id ? updatedUser : x))
        );
      }

      window.alert(`${newAdminStatus ? 'Admin access granted to' : 'Admin access removed from'} "${u.username}"`);
    } catch (err) {
      console.error('Toggle admin error:', err);
      window.alert('Something went wrong');
    }
  }

  async function handleDeleteUser(u: SimpleUser) {
    const isSelf = u.id === user.id;
    if (isSelf) {
      window.alert('You cannot delete your own account.');
      return;
    }

    const confirmed = window.confirm(
      `Delete user "${u.username}"? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        window.alert(data.error || 'Failed to delete user');
        return;
      }

      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      window.alert(`User "${u.username}" deleted`);
    } catch (err) {
      console.error('Delete user error:', err);
      window.alert('Something went wrong');
    }
  }

  async function handleCreateTeam(e: FormEvent) {
    e.preventDefault();
    setTeamFormError(null);
    setTeamFormSuccess(null);
    setTeamFormLoading(true);

    try {
      const name = teamNameInput.trim();
      const res = await fetch('/api/admin/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setTeamFormError(data.error || 'Failed to create team');
        setTeamFormLoading(false);
        return;
      }

      if (data.team) {
        setTeams((prev) => [data.team, ...prev]);
      }

      setTeamFormSuccess(`Team "${name}" created`);
      setTeamNameInput('');
    } catch (err) {
      console.error('Create team error:', err);
      setTeamFormError('Something went wrong');
    } finally {
      setTeamFormLoading(false);
    }
  }

  async function handleDeleteTeam(team: Team) {
    const confirmed = window.confirm(
      `Delete team "${team.name}"? Members will simply lose their team.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/admin/teams', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: team.id }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        window.alert(data.error || 'Failed to delete team');
        return;
      }

      // Remove team from local list
      setTeams((prev) => prev.filter((t) => t.id !== team.id));
      // Clear team_id from any users (locally; DB is handled by FK)
      setUsers((prev) =>
        prev.map((u) =>
          u.team_id === team.id ? { ...u, team_id: null } : u
        )
      );
      window.alert(`Team "${team.name}" deleted`);
    } catch (err) {
      console.error('Delete team error:', err);
      window.alert('Something went wrong');
    }
  }

  async function handleChangeUserTeam(u: SimpleUser, newTeamId: string) {
    const teamIdToSend = newTeamId === '' ? null : newTeamId;
    const userTeamIds = (u.teams || []).map(t => t.team_id);
    const isUserInTeam = teamIdToSend ? userTeamIds.includes(teamIdToSend) : true;

    setUpdatingUserTeamId(u.id);
    try {
      // If user is not in the team, add them first
      if (teamIdToSend && !isUserInTeam) {
        const addRes = await fetch('/api/admin/user-teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: u.id, teamId: teamIdToSend }),
        });

        const addData = await addRes.json();
        if (!addRes.ok || !addData.ok) {
          window.alert(addData.error || 'Failed to add user to team');
          // Reload to revert dropdown state
          const usersRes = await fetch('/api/admin/users');
          const usersData = await usersRes.json();
          if (usersData.ok) setUsers(usersData.users ?? []);
          return;
        }

        // Update local state immediately to reflect new membership
        const teamName = teams.find(t => t.id === teamIdToSend)?.name || 'Unknown';
        setUsers(prev => prev.map(user => 
          user.id === u.id 
            ? {...user, teams: [...(user.teams || []), {team_id: teamIdToSend, team_name: teamName}]}
            : user
        ));
      }

      // Now set as primary team
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, teamId: teamIdToSend }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        window.alert(data.error || 'Failed to update primary team');
        // Reload to revert changes
        const usersRes = await fetch('/api/admin/users');
        const usersData = await usersRes.json();
        if (usersData.ok) setUsers(usersData.users ?? []);
        return;
      }

      // Reload users to refresh all data (ensures consistency)
      const usersRes = await fetch('/api/admin/users');
      const usersData = await usersRes.json();
      if (usersData.ok) {
        setUsers(usersData.users ?? []);
      }
    } catch (err) {
      console.error('Update user team error:', err);
      window.alert('Something went wrong');
      // Reload to revert changes
      const usersRes = await fetch('/api/admin/users');
      const usersData = await usersRes.json();
      if (usersData.ok) setUsers(usersData.users ?? []);
    } finally {
      setUpdatingUserTeamId(null);
    }
  }

  async function handleCreateBanner(e: FormEvent) {
    e.preventDefault();
    setBannerFormError(null);
    setBannerFormSuccess(null);

    if (!bannerTeamId) {
      setBannerFormError('Please select a team');
      return;
    }
    if (!bannerMessage.trim()) {
      setBannerFormError('Please enter a message');
      return;
    }

    setBannerFormLoading(true);

    try {
      const res = await fetch('/api/admin/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: bannerTeamId,
          message: bannerMessage.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setBannerFormError(data.error || 'Failed to post announcement');
        setBannerFormLoading(false);
        return;
      }

      if (data.banner) {
        setBanners((prev) => [data.banner, ...prev]);
      }

      setBannerFormSuccess('Announcement posted');
      setBannerMessage('');
    } catch (err) {
      console.error('Create banner error:', err);
      setBannerFormError('Something went wrong');
    } finally {
      setBannerFormLoading(false);
    }
  }

  function toggleBannerSelection(bannerId: string) {
    setSelectedBannerIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(bannerId)) {
        newSet.delete(bannerId);
      } else {
        newSet.add(bannerId);
      }
      return newSet;
    });
  }

  async function handleDeleteSelectedBanners() {
    if (selectedBannerIds.size === 0) return;

    if (!confirm(`Delete ${selectedBannerIds.size} selected news item(s)?`)) {
      return;
    }

    setDeletingBanners(true);

    try {
      const idsArray = Array.from(selectedBannerIds);
      const deletePromises = idsArray.map(async (id) => {
        try {
          const res = await fetch(`/api/admin/banners/${id}`, {
            method: 'DELETE',
          });
          const data = await res.json();
          return {
            id,
            success: res.ok && data.ok === true,
            error: data.error,
          };
        } catch (err) {
          return {
            id,
            success: false,
            error: 'Network error',
          };
        }
      });

      const results = await Promise.all(deletePromises);
      const successfulIds = results
        .filter((r) => r.success)
        .map((r) => r.id);
      const failedResults = results.filter((r) => !r.success);

      if (failedResults.length > 0) {
        const errorMessages = failedResults
          .map((r) => `ID ${r.id}: ${r.error || 'Unknown error'}`)
          .join('\n');
        window.alert(
          `${failedResults.length} deletion(s) failed:\n${errorMessages}\n\nSuccessfully deleted ${successfulIds.length} item(s).`
        );
      }

      // Only remove successfully deleted banners from state
      if (successfulIds.length > 0) {
        setBanners((prev) => prev.filter((b) => !successfulIds.includes(b.id)));

        // Only clear successfully deleted IDs from selection
        setSelectedBannerIds((prev) => {
          const newSet = new Set(prev);
          successfulIds.forEach((id) => newSet.delete(id));
          return newSet;
        });
      }
    } catch (err) {
      console.error('Delete banners error:', err);
      window.alert('Something went wrong during deletion');
    } finally {
      setDeletingBanners(false);
    }
  }

  async function handleClearTeamBanners(e: FormEvent) {
    e.preventDefault();
    
    if (!clearTeamId) {
      setClearTeamError('Please select a team');
      return;
    }

    const teamName = teams.find((t) => t.id === clearTeamId)?.name || 'Unknown';
    
    if (!confirm(`Delete ALL banners (manual and auto-generated) for team "${teamName}"?`)) {
      return;
    }

    setClearTeamError(null);
    setClearTeamSuccess(null);
    setClearingTeamBanners(true);

    try {
      const res = await fetch('/api/admin/banners/clear-team', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: clearTeamId }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setClearTeamError(data.error || 'Failed to clear banners');
        return;
      }

      setClearTeamSuccess(`Cleared ${data.deletedCount} banner(s) from ${teamName}`);
      setClearTeamId('');
      
      // Refresh the banners list
      const refreshRes = await fetch('/api/admin/banners?limit=30');
      const refreshData = await refreshRes.json();
      if (refreshData.ok) {
        setBanners(refreshData.banners ?? []);
      }
    } catch (err) {
      console.error('Clear team banners error:', err);
      setClearTeamError('Something went wrong');
    } finally {
      setClearingTeamBanners(false);
    }
  }

  async function handleAddUserToTeam(e: FormEvent) {
    e.preventDefault();
    if (!selectedUserId || !selectedTeamIdForUser) {
      setMultiTeamError('Please select both a user and a team');
      return;
    }

    setMultiTeamError(null);
    setMultiTeamSuccess(null);
    setAddingUserToTeam(true);

    try {
      const res = await fetch('/api/admin/user-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          teamId: selectedTeamIdForUser,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMultiTeamError(data.error || 'Failed to add user to team');
        return;
      }

      setMultiTeamSuccess('User added to team successfully');
      setSelectedUserId('');
      setSelectedTeamIdForUser('');
      
      // Reload users to refresh their team memberships
      const usersRes = await fetch('/api/admin/users');
      const usersData = await usersRes.json();
      if (usersData.ok) {
        setUsers(usersData.users ?? []);
      }
    } catch (err) {
      console.error('Add user to team error:', err);
      setMultiTeamError('Something went wrong');
    } finally {
      setAddingUserToTeam(false);
    }
  }

  async function handleRemoveUserFromTeam(userId: string, teamId: string, username: string, teamName: string) {
    if (!window.confirm(`Remove ${username} from ${teamName}?`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/user-teams', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, teamId }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        window.alert(data.error || 'Failed to remove user from team');
        return;
      }

      // Reload users to refresh their team memberships
      const usersRes = await fetch('/api/admin/users');
      const usersData = await usersRes.json();
      if (usersData.ok) {
        setUsers(usersData.users ?? []);
      }
    } catch (err) {
      console.error('Remove user from team error:', err);
      window.alert('Something went wrong');
    }
  }

  async function handleToggleUserTeam(userId: string, teamId: string, isCurrentlyAssigned: boolean) {
    setUpdatingTeamsFor(userId);
    // Clear feedback for this specific user
    setTeamAssignmentFeedback(prev => {
      const next = {...prev};
      delete next[userId];
      return next;
    });

    try {
      const teamName = teams.find(t => t.id === teamId)?.name || 'team';

      if (isCurrentlyAssigned) {
        // Remove from team
        const res = await fetch('/api/admin/user-teams', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, teamId }),
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          setTeamAssignmentFeedback(prev => ({...prev, [userId]: {type: 'error', message: data.error || 'Failed to remove from team'}}));
          // Reload on error to revert checkbox state
          const usersRes = await fetch('/api/admin/users');
          const usersData = await usersRes.json();
          if (usersData.ok) setUsers(usersData.users ?? []);
          return;
        }
        setTeamAssignmentFeedback(prev => ({...prev, [userId]: {type: 'success', message: `Removed from ${teamName}`}}));
      } else {
        // Add to team
        const res = await fetch('/api/admin/user-teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, teamId }),
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          setTeamAssignmentFeedback(prev => ({...prev, [userId]: {type: 'error', message: data.error || 'Failed to add to team'}}));
          // Reload on error to revert checkbox state
          const usersRes = await fetch('/api/admin/users');
          const usersData = await usersRes.json();
          if (usersData.ok) setUsers(usersData.users ?? []);
          return;
        }
        setTeamAssignmentFeedback(prev => ({...prev, [userId]: {type: 'success', message: `Added to ${teamName}`}}));
      }

      // Reload users to refresh team memberships (ensures checkboxes stay in sync)
      const usersRes = await fetch('/api/admin/users');
      const usersData = await usersRes.json();
      if (usersData.ok) {
        setUsers(usersData.users ?? []);
      }

      // Clear feedback after 3 seconds
      setTimeout(() => {
        setTeamAssignmentFeedback(prev => {
          const next = {...prev};
          delete next[userId];
          return next;
        });
      }, 3000);
    } catch (err) {
      console.error('Toggle user team error:', err);
      setTeamAssignmentFeedback(prev => ({...prev, [userId]: {type: 'error', message: 'Something went wrong'}}));
      // Reload on error to revert checkbox state
      const usersRes = await fetch('/api/admin/users');
      const usersData = await usersRes.json();
      if (usersData.ok) setUsers(usersData.users ?? []);
    } finally {
      setUpdatingTeamsFor(null);
    }
  }

  function getTeamName(teamId: string | null): string {
    if (!teamId) return 'Unknown team';
    const team = teams.find((t) => t.id === teamId);
    return team ? team.name : 'Unknown team';
  }

  function formatDateTime(value: string): string {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('en-AU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <>
      <Head>
        <title>Team Shred – Admin</title>
        <style>{`
          /* Custom scrollbar for admin page */
          body::-webkit-scrollbar {
            width: 12px;
          }
          body::-webkit-scrollbar-track {
            background: #0f172a;
          }
          body::-webkit-scrollbar-thumb {
            background: #334155;
            border-radius: 6px;
          }
          body::-webkit-scrollbar-thumb:hover {
            background: #475569;
          }
          /* Firefox scrollbar */
          body {
            scrollbar-width: thin;
            scrollbar-color: #334155 #0f172a;
          }
        `}</style>
      </Head>
      <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100 px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Admin Control Room
              </h1>
              <p className="text-sm text-slate-400">
                Signed in as{' '}
                <span className="font-mono text-emerald-400">
                  {user.username}
                </span>
                . Manage shred squad accounts, teams, and announcements.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              {isNoxAdmin && (
                <>
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/warzone"
                    className="inline-flex items-center justify-center rounded-xl border border-red-500/60 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-100 hover:bg-red-500/25 transition-colors"
                  >
                    Warzone
                  </Link>
                  <Link
                    href="/tracker"
                    className="inline-flex items-center justify-center rounded-xl border border-emerald-500/60 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25 transition-colors"
                  >
                    Apollo
                  </Link>
                  <Link
                    href="/admin/exercise-types"
                    className="inline-flex items-center justify-center rounded-xl border border-sky-500/60 bg-sky-500/15 px-4 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/25 transition-colors"
                    data-testid="link-exercise-types"
                  >
                    Exercise Types
                  </Link>
                </>
              )}
              <button
                onClick={handleLogout}
                className="inline-flex items-center justify-center rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20 transition-colors"
              >
                Logout
              </button>
            </div>
          </header>

          {/* Unified User & Team Management */}
          <section className="rounded-2xl border border-purple-500/40 bg-slate-900/80 shadow-xl shadow-purple-500/5">
            <div className="border-b border-purple-500/40 px-5 py-4">
              <h2 className="text-lg font-semibold tracking-tight text-purple-100">
                User & Team Management
              </h2>
              <p className="text-xs text-purple-200/80">
                Create teams, manage users, and assign team memberships all in one place.
              </p>
            </div>

            <div className="px-5 py-6 space-y-6">
              {/* Create User Form */}
              <div className="rounded-xl border border-emerald-500/30 bg-slate-950/40 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-emerald-200">Create New User</h3>
                <form
                  onSubmit={handleCreateUser}
                  className="grid grid-cols-1 md:grid-cols-3 gap-3"
                >
                  <div>
                    <label
                      htmlFor="new-username"
                      className="block text-xs font-medium text-slate-300 mb-1"
                    >
                      Username
                    </label>
                    <input
                      id="new-username"
                      type="text"
                      placeholder="Username"
                      className="w-full rounded-lg bg-slate-900 border border-emerald-500/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      disabled={formLoading}
                      autoComplete="off"
                      data-testid="input-new-username"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="new-password"
                      className="block text-xs font-medium text-slate-300 mb-1"
                    >
                      Password
                    </label>
                    <input
                      id="new-password"
                      type="password"
                      placeholder="Password"
                      className="w-full rounded-lg bg-slate-900 border border-emerald-500/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={formLoading}
                      autoComplete="new-password"
                      data-testid="input-new-password"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={formLoading}
                      className="w-full inline-flex items-center justify-center rounded-lg bg-emerald-500 text-slate-950 font-semibold text-xs px-4 py-2 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed min-h-9"
                      data-testid="button-create-user"
                    >
                      {formLoading ? 'Creating…' : 'Create User'}
                    </button>
                  </div>
                </form>

                <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border border-slate-700 bg-slate-900 text-emerald-500"
                    checked={newIsAdmin}
                    onChange={(e) => setNewIsAdmin(e.target.checked)}
                    disabled={formLoading}
                    data-testid="checkbox-new-admin"
                  />
                  <span>Make this user an admin</span>
                </label>

                {formError && (
                  <p className="text-xs text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
                    {formError}
                  </p>
                )}

                {formSuccess && (
                  <p className="text-xs text-emerald-300 bg-emerald-900/30 border border-emerald-700/60 rounded-lg px-3 py-2">
                    {formSuccess}
                  </p>
                )}
              </div>

              {/* Create Team Form */}
              <div className="rounded-xl border border-sky-500/30 bg-slate-950/40 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-sky-200">Create New Team</h3>
                <form
                  onSubmit={handleCreateTeam}
                  className="flex flex-col sm:flex-row gap-3 sm:items-end"
                >
                  <div className="flex-1">
                    <label
                      htmlFor="team-name"
                      className="block text-xs font-medium text-slate-300 mb-1"
                    >
                      Team name
                    </label>
                    <input
                      id="team-name"
                      className="w-full rounded-lg bg-slate-900 border border-sky-500/40 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      value={teamNameInput}
                      onChange={(e) => setTeamNameInput(e.target.value)}
                      disabled={teamFormLoading}
                      placeholder="e.g., Team Apollo"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={teamFormLoading}
                    className="inline-flex items-center justify-center rounded-lg bg-sky-500 text-slate-950 font-semibold text-xs px-4 py-2 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed min-h-9"
                    data-testid="button-create-team"
                  >
                    {teamFormLoading ? 'Creating…' : 'Create Team'}
                  </button>
                </form>

                {teamFormError && (
                  <p className="text-xs text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
                    {teamFormError}
                  </p>
                )}

                {teamFormSuccess && (
                  <p className="text-xs text-emerald-300 bg-emerald-900/30 border border-emerald-700/60 rounded-lg px-3 py-2">
                    {teamFormSuccess}
                  </p>
                )}

                {/* Existing teams list with delete buttons */}
                {teams.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs text-slate-400 mb-2">Existing teams:</p>
                    <div className="flex flex-wrap gap-2">
                      {teams.map((t) => (
                        <div
                          key={t.id}
                          className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 text-sky-200 border border-sky-500/40 px-2 py-1 text-[10px]"
                        >
                          <span>{t.name}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteTeam(t)}
                            className="ml-1 inline-flex items-center justify-center rounded-full hover:bg-red-500/30 text-red-300 p-0.5 transition-colors"
                            title={`Delete ${t.name}`}
                            data-testid={`button-delete-team-${t.name}`}
                          >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Users Table with Expandable Team Management */}
              <div className="rounded-xl border border-slate-700/50 bg-slate-950/40 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700/50">
                  <h3 className="text-sm font-semibold text-slate-200">All Users</h3>
                  <p className="text-xs text-slate-400">
                    Click "Manage Teams" to assign users to multiple teams
                  </p>
                </div>

                <div className="overflow-x-auto">
                  {loadingUsers ? (
                    <p className="text-xs text-slate-500 p-4">Loading users…</p>
                  ) : users.length === 0 ? (
                    <p className="text-xs text-slate-500 p-4">
                      No users yet. Create the first user above.
                    </p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400 text-[11px] uppercase tracking-wide border-b border-slate-800 bg-slate-900/50">
                          <th className="text-left py-2 px-4">Username</th>
                          <th className="text-left py-2 px-4">Role</th>
                          <th className="text-left py-2 px-4">Primary Team</th>
                          <th className="text-left py-2 px-4">All Teams</th>
                          <th className="text-right py-2 px-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => {
                          const isSelf = u.id === user.id;
                          const isExpanded = expandedUserId === u.id;
                          const userTeamIds = (u.teams || []).map(t => t.team_id);

                          return (
                            <>
                              <tr
                                key={u.id}
                                className="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors"
                              >
                                <td className="py-3 px-4 font-mono text-[11px]">
                                  {u.username}
                                </td>
                                <td className="py-3 px-4">
                                  {u.is_admin ? (
                                    <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 px-2 py-[2px] text-[10px]">
                                      ADMIN
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-full bg-slate-800/70 text-slate-300 border border-slate-700/60 px-2 py-[2px] text-[10px]">
                                      USER
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  <select
                                    className="w-full max-w-[140px] rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    value={u.team_id ?? ''}
                                    disabled={loadingTeams || updatingUserTeamId === u.id}
                                    onChange={(e) => handleChangeUserTeam(u, e.target.value)}
                                    data-testid={`select-primary-team-${u.username}`}
                                  >
                                    <option value="">{loadingTeams ? 'Loading…' : 'No team'}</option>
                                    {teams.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex flex-wrap gap-1 items-center">
                                    {!u.teams || u.teams.length === 0 ? (
                                      <span className="text-slate-500 text-[10px]">No teams</span>
                                    ) : (
                                      u.teams.map((team) => (
                                        <span
                                          key={team.team_id}
                                          className="inline-flex items-center rounded-full bg-purple-500/15 text-purple-200 border border-purple-500/40 px-2 py-[2px] text-[10px]"
                                        >
                                          {team.team_name}
                                        </span>
                                      ))
                                    )}
                                    {teamAssignmentFeedback[u.id] && (
                                      <span className={`inline-flex items-center text-[9px] px-2 py-[2px] rounded-full ${
                                        teamAssignmentFeedback[u.id].type === 'success'
                                          ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/60'
                                          : 'bg-red-950/50 text-red-300 border border-red-900/60'
                                      }`}>
                                        {teamAssignmentFeedback[u.id].message}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex flex-wrap gap-1 justify-end">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                                      className="rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/40 px-2 py-[2px] text-[10px] hover:bg-purple-500/25 transition-colors"
                                      data-testid={`button-manage-teams-${u.username}`}
                                    >
                                      {isExpanded ? 'Close' : 'Manage Teams'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isSelf}
                                      onClick={() => handleToggleAdmin(u)}
                                      className="rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/40 px-2 py-[2px] text-[10px] hover:bg-sky-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                      data-testid={`button-toggle-admin-${u.username}`}
                                    >
                                      {u.is_admin ? 'Remove Admin' : 'Make Admin'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleResetPassword(u)}
                                      className="rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 px-2 py-[2px] text-[10px] hover:bg-emerald-500/25 transition-colors"
                                      data-testid={`button-reset-password-${u.username}`}
                                    >
                                      Reset PW
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isSelf}
                                      onClick={() => handleDeleteUser(u)}
                                      className="rounded-full bg-red-500/15 text-red-300 border border-red-500/40 px-2 py-[2px] text-[10px] hover:bg-red-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                      data-testid={`button-delete-${u.username}`}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {/* Expandable Team Management Row */}
                              {isExpanded && (
                                <tr className="bg-slate-900/50 border-b border-slate-800/40">
                                  <td colSpan={4} className="py-4 px-4">
                                    <div className="space-y-2">
                                      <p className="text-xs font-semibold text-purple-200 mb-3">
                                        Team Memberships for {u.username}
                                      </p>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                        {teams.map((team) => {
                                          const isAssigned = userTeamIds.includes(team.id);
                                          return (
                                            <label
                                              key={team.id}
                                              className="inline-flex items-center gap-2 text-xs text-slate-300 p-2 rounded-lg hover:bg-slate-800/50 cursor-pointer"
                                            >
                                              <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border border-slate-700 bg-slate-900 text-purple-500"
                                                checked={isAssigned}
                                                onChange={() => handleToggleUserTeam(u.id, team.id, isAssigned)}
                                                disabled={updatingTeamsFor === u.id}
                                                data-testid={`checkbox-team-${team.name}-for-${u.username}`}
                                              />
                                              <span>{team.name}</span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                      {updatingTeamsFor === u.id && (
                                        <p className="text-xs text-slate-400">Updating...</p>
                                      )}
                                      {teamAssignmentFeedback[u.id] && (
                                        <div className={`mt-2 text-xs px-3 py-2 rounded-lg border ${
                                          teamAssignmentFeedback[u.id].type === 'success'
                                            ? 'bg-emerald-900/30 border-emerald-700/60 text-emerald-300'
                                            : 'bg-red-950/40 border-red-900/60 text-red-300'
                                        }`}>
                                          {teamAssignmentFeedback[u.id].message}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </section>


          {/* Team Announcements / News */}
          <section className="rounded-2xl border border-amber-500/40 bg-slate-950/80 shadow-xl shadow-amber-500/10">
            <div className="border-b border-amber-500/40 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-amber-100">
                  Team announcements / news
                </h2>
                <p className="text-xs text-amber-200/80">
                  Post manual news items for a specific team. PB and weekend
                  banners will appear here automatically later.
                </p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4 text-sm">
              <form
                onSubmit={handleCreateBanner}
                className="flex flex-col gap-3 md:flex-row md:items-start"
              >
                <div className="md:w-48">
                  <label
                    htmlFor="banner-team"
                    className="block text-xs font-medium text-amber-100 mb-1"
                  >
                    Team
                  </label>
                  <select
                    id="banner-team"
                    className="w-full rounded-xl bg-slate-950 border border-amber-500/60 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    value={bannerTeamId}
                    onChange={(e) => setBannerTeamId(e.target.value)}
                    disabled={bannerFormLoading || loadingTeams}
                  >
                    <option value="">
                      {loadingTeams ? 'Loading teams…' : 'Select a team'}
                    </option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <label
                    htmlFor="banner-message"
                    className="block text-xs font-medium text-amber-100 mb-1"
                  >
                    Message
                  </label>
                  <textarea
                    id="banner-message"
                    rows={2}
                    className="w-full rounded-xl bg-slate-950 border border-amber-500/60 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                    value={bannerMessage}
                    onChange={(e) => setBannerMessage(e.target.value)}
                    disabled={bannerFormLoading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={bannerFormLoading}
                  className="inline-flex items-center justify-center rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs px-4 py-2 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed md:mt-[1.375rem]"
                >
                  {bannerFormLoading ? 'Posting…' : 'Post announcement'}
                </button>
              </form>

              {bannerFormError && (
                <p className="text-xs text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
                  {bannerFormError}
                </p>
              )}

              {bannerFormSuccess && (
                <p className="text-xs text-emerald-300 bg-emerald-900/30 border border-emerald-700/60 rounded-lg px-3 py-2">
                  {bannerFormSuccess}
                </p>
              )}

              {/* Clear all banners for a team */}
              <div className="border-t border-amber-500/20 pt-4">
                <form
                  onSubmit={handleClearTeamBanners}
                  className="flex flex-col gap-3 md:flex-row md:items-end"
                >
                  <div className="md:w-64">
                    <label
                      htmlFor="clear-team"
                      className="block text-xs font-medium text-amber-100 mb-1"
                    >
                      Clear all banners for team
                    </label>
                    <select
                      id="clear-team"
                      className="w-full rounded-xl bg-slate-950 border border-red-500/60 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                      value={clearTeamId}
                      onChange={(e) => setClearTeamId(e.target.value)}
                      disabled={clearingTeamBanners || loadingTeams}
                    >
                      <option value="">
                        {loadingTeams ? 'Loading teams…' : 'Select a team'}
                      </option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={clearingTeamBanners || !clearTeamId}
                    className="inline-flex items-center justify-center rounded-xl bg-red-500 text-white font-semibold text-xs px-4 py-2 hover:bg-red-400 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {clearingTeamBanners ? 'Clearing…' : 'Clear all banners'}
                  </button>
                </form>

                {clearTeamError && (
                  <p className="text-xs text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2 mt-2">
                    {clearTeamError}
                  </p>
                )}

                {clearTeamSuccess && (
                  <p className="text-xs text-emerald-300 bg-emerald-900/30 border border-emerald-700/60 rounded-lg px-3 py-2 mt-2">
                    {clearTeamSuccess}
                  </p>
                )}
              </div>

              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-amber-100">
                    Recent news items
                  </h3>
                  {selectedBannerIds.size > 0 && (
                    <button
                      onClick={handleDeleteSelectedBanners}
                      disabled={deletingBanners}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deletingBanners
                        ? 'Deleting…'
                        : `Delete ${selectedBannerIds.size} selected`}
                    </button>
                  )}
                </div>
                {loadingBanners ? (
                  <p className="text-xs text-slate-500">Loading news…</p>
                ) : bannersError ? (
                  <p className="text-xs text-red-300">{bannersError}</p>
                ) : banners.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No announcements yet. Post the first one above.
                  </p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {banners.map((b) => (
                      <li
                        key={b.id}
                        className="flex items-start gap-3 border-b border-slate-800/60 pb-2 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={selectedBannerIds.has(b.id)}
                          onChange={() => toggleBannerSelection(b.id)}
                          className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-2 focus:ring-amber-500 cursor-pointer"
                        />
                        <div className="flex-1 flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-sky-500/15 text-sky-200 border border-sky-500/40 px-2 py-[2px] text-[10px]">
                                {b.type === 'manual'
                                  ? 'Manual'
                                  : b.type === 'pb'
                                  ? 'PB'
                                  : b.type === 'blowout'
                                  ? 'Weekend Blow Out'
                                  : b.type === 'solid'
                                  ? 'Solid Weekend'
                                  : b.type}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {getTeamName(b.team_id)}
                              </span>
                            </div>
                            <p className="text-slate-100">{b.message}</p>
                          </div>
                          <span className="text-[10px] text-slate-500 whitespace-nowrap">
                            {formatDateTime(b.created_at)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
