import { useMemo } from 'react';

type BodyFatEntry = {
  id: string;
  user_id: string;
  log_date: string;
  bf_percent: number;
  inserted_at: string;
};

type WeightEntry = {
  id: string;
  user_id: string;
  weigh_date: string;
  weight_kg: number;
  inserted_at: string;
  is_monday: boolean;
  is_friday: boolean;
};

type ProfileData = {
  pb_weight_kg: number | null;
  pb_date: string | null;
  goal_weight: number | null;
  goal_bf: number | null;
};

type Props = {
  username: string;
  profile: ProfileData | undefined;
  bodyFatLogs: BodyFatEntry[];
  weights: WeightEntry[];
  loading: boolean;
};

export default function PersonalStatsCard({ username, profile, bodyFatLogs, weights, loading }: Props) {
  // Calculate current BF% (most recent entry)
  const currentBf = useMemo(() => {
    if (bodyFatLogs.length === 0) return null;
    const sorted = [...bodyFatLogs].sort(
      (a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime()
    );
    return sorted[0].bf_percent;
  }, [bodyFatLogs]);

  // Calculate latest weight (most recent entry)
  const latestWeight = useMemo(() => {
    if (weights.length === 0) return null;
    const sorted = [...weights].sort(
      (a, b) => new Date(b.weigh_date).getTime() - new Date(a.weigh_date).getTime()
    );
    return sorted[0].weight_kg;
  }, [weights]);

  if (loading) {
    return (
      <section className="rounded-xl border-2 bg-slate-900/60 p-4">
        <p className="text-xs text-slate-500">Loading stats…</p>
      </section>
    );
  }

  return (
    <section 
      className="rounded-xl border-2 bg-slate-900/60 p-4 space-y-3"
      style={{ borderColor: '#0ea5e9' }}
      data-testid="card-personal-stats"
    >
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: '#0ea5e9' }}
        ></div>
        <h3 className="text-sm font-bold text-slate-100">{username.toLowerCase()}</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        {/* Latest Weight - Full width, prominent */}
        <div className="sm:col-span-2 space-y-1 border-b border-slate-700/50 pb-3">
          <p className="text-slate-500 font-medium">
            Latest Weight
          </p>
          <p 
            className="text-2xl font-bold"
            style={{ color: '#0ea5e9' }}
            data-testid="text-latest-weight"
          >
            {latestWeight !== null ? `${latestWeight} kg` : '—'}
          </p>
        </div>

        {/* PB Weight */}
        <div className="space-y-1">
          <p className="text-slate-500 font-medium">PB</p>
          <p 
            className="text-lg font-bold"
            style={{ color: '#eab308' }}
            data-testid="text-pb-weight"
          >
            {profile?.pb_weight_kg !== null && profile?.pb_weight_kg !== undefined
              ? `${profile.pb_weight_kg} kg`
              : '—'}
          </p>
        </div>

        {/* Current BF% */}
        <div className="space-y-1">
          <p className="text-slate-500 font-medium">Current BF%</p>
          <p 
            className="text-lg font-bold"
            style={{ color: '#0ea5e9' }}
            data-testid="text-current-bf"
          >
            {currentBf !== null ? `${currentBf.toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>
    </section>
  );
}
